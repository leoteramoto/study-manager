// Autorização com o token model do GIS (RN41). O token fica só em memória,
// nesta aba: nunca em localStorage, IndexedDB, logs ou URL.
import {
  ESCOPO_DRIVE,
  interpretarRespostaToken,
  MARGEM_EXPIRACAO_TOKEN_MS,
  TEMPO_LIMITE_AUTORIZACAO_MS,
  type TokenAcesso,
  tokenValido,
} from '@/domain/backupNuvem'
import type { OpcoesAutorizacao } from '../destino'
import type { Oauth2Gis, TokenClientGis } from './gis'

/** Limite para a revogação responder; depois disso a desconexão segue. */
export const TEMPO_LIMITE_REVOGACAO_MS = 10_000

export interface DependenciasAutorizacao {
  clientId: string
  carregarGis: () => Promise<Oauth2Gis | null>
  agora?: () => Date
  registrarErro?: (contexto: string, erro: unknown) => void
}

interface PedidoEmAndamento {
  promessa: Promise<boolean>
  concluir: (ok: boolean) => void
}

/** Tipo do erro do popup, sem nenhum outro dado. */
function tipoDoErro(erro: unknown): string {
  const tipo: unknown =
    typeof erro === 'object' && erro !== null ? Reflect.get(erro, 'type') : undefined
  return typeof tipo === 'string' ? tipo.slice(0, 40) : 'desconhecido'
}

export class AutorizacaoGoogle {
  private readonly clientId: string
  private readonly carregar: () => Promise<Oauth2Gis | null>
  private readonly agora: () => Date
  private readonly registrarErro: (contexto: string, erro: unknown) => void

  private oauth2: Oauth2Gis | null = null
  private cliente: TokenClientGis | null = null
  private preparando: Promise<void> | null = null
  private token: TokenAcesso | null = null
  private pedido: PedidoEmAndamento | null = null
  private cancelarVencimento: (() => void) | null = null
  private readonly ouvintes = new Set<() => void>()

  constructor(dependencias: DependenciasAutorizacao) {
    this.clientId = dependencias.clientId
    this.carregar = dependencias.carregarGis
    this.agora = dependencias.agora ?? (() => new Date())
    this.registrarErro = dependencias.registrarErro ?? (() => undefined)
  }

  /** Carrega o GIS e cria o token client, uma vez. Falhou: tenta de novo na próxima. */
  preparar(): Promise<void> {
    if (this.cliente) return Promise.resolve()
    this.preparando ??= this.carregar()
      .then((oauth2) => {
        if (!oauth2) throw new Error('script do Google indisponível')
        this.oauth2 = oauth2
        this.cliente = oauth2.initTokenClient({
          client_id: this.clientId,
          scope: ESCOPO_DRIVE,
          callback: (resposta) => {
            this.receberToken(resposta)
          },
          error_callback: (erro) => {
            this.registrarErro('autorizacao', new Error(`popup: ${tipoDoErro(erro)}`))
            this.concluirPedido(false)
          },
        })
      })
      .catch((erro: unknown) => {
        this.registrarErro('carregamento', erro instanceof Error ? erro : new Error('falha'))
      })
      .finally(() => {
        this.preparando = null
      })
    return this.preparando
  }

  temToken(): boolean {
    return tokenValido(this.token, this.agora())
  }

  /** Token válido para as chamadas à API, ou `null`. */
  tokenAtual(): string | null {
    return tokenValido(this.token, this.agora()) ? this.token.token : null
  }

  aoMudarToken(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  /**
   * Pede um token (RN41). Síncrona até `requestAccessToken`, para o navegador
   * permitir o popup. Nunca rejeita. Script ainda não carregado: resolve
   * `false` na hora e não abre popup depois. Pedido em andamento (clique
   * duplo): devolve o mesmo pedido, sem segundo popup.
   */
  autorizar(opcoes: OpcoesAutorizacao): Promise<boolean> {
    if (this.pedido) return this.pedido.promessa
    if (!this.cliente) {
      void this.preparar()
      return Promise.resolve(false)
    }

    let concluir: (ok: boolean) => void = () => undefined
    const promessa = new Promise<boolean>((resolver) => {
      concluir = resolver
    })
    const limite = setTimeout(() => {
      this.registrarErro('autorizacao', new Error('popup sem resposta no tempo limite'))
      this.concluirPedido(false)
    }, TEMPO_LIMITE_AUTORIZACAO_MS)
    this.pedido = {
      promessa,
      concluir: (ok) => {
        clearTimeout(limite)
        concluir(ok)
      },
    }

    try {
      this.cliente.requestAccessToken({
        prompt: opcoes.escolherConta ? 'select_account' : '',
        ...(opcoes.dicaEmail ? { login_hint: opcoes.dicaEmail } : {}),
      })
    } catch (erro) {
      this.registrarErro('autorizacao', erro instanceof Error ? new Error(erro.name) : erro)
      this.concluirPedido(false)
    }
    return promessa
  }

  /** Esquece o token (401 da API, ou "Desconectar"). */
  esquecerToken(): void {
    this.cancelarVencimento?.()
    this.cancelarVencimento = null
    if (this.token === null) return
    this.token = null
    this.avisar()
  }

  /**
   * Revoga o token desta aba e o esquece. Falha ou demora na revogação não
   * impede a desconexão (resolve depois de no máximo 10 s).
   */
  async revogar(): Promise<void> {
    const token = this.token?.token ?? null
    this.esquecerToken()
    const oauth2 = this.oauth2
    if (token === null || oauth2 === null) return
    await new Promise<void>((resolver) => {
      const limite = setTimeout(() => {
        this.registrarErro('revogacao', new Error('sem resposta no tempo limite'))
        resolver()
      }, TEMPO_LIMITE_REVOGACAO_MS)
      try {
        oauth2.revoke(token, () => {
          clearTimeout(limite)
          resolver()
        })
      } catch {
        clearTimeout(limite)
        this.registrarErro('revogacao', new Error('falha ao revogar'))
        resolver()
      }
    })
  }

  private receberToken(resposta: unknown): void {
    const token = interpretarRespostaToken(resposta, this.agora())
    if (token) {
      // Mesmo depois do tempo limite o token é aproveitado (aoMudarToken avisa).
      this.definirToken(token)
    } else {
      this.registrarErro('autorizacao', new Error('resposta de token recusada'))
    }
    this.concluirPedido(token !== null)
  }

  private definirToken(token: TokenAcesso): void {
    this.cancelarVencimento?.()
    this.token = token
    // Avisa também quando o token vence, para o indicador do cabeçalho.
    const restante = token.expiraEm - MARGEM_EXPIRACAO_TOKEN_MS - this.agora().getTime()
    const id = setTimeout(
      () => {
        this.cancelarVencimento = null
        this.avisar()
      },
      Math.max(0, restante) + 1,
    )
    this.cancelarVencimento = () => {
      clearTimeout(id)
    }
    this.avisar()
  }

  private concluirPedido(ok: boolean): void {
    const pedido = this.pedido
    this.pedido = null
    pedido?.concluir(ok)
  }

  private avisar(): void {
    for (const ouvinte of this.ouvintes) ouvinte()
  }
}
