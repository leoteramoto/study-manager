// Destino do build de E2E (VITE_DESTINO_NUVEM=falso). SÓ existe nesse build:
// `carregarDestino` o importa de forma dinâmica dentro de uma condição que o
// Vite resolve no build, e `scripts/verificar-dist-google.mjs` confere que o
// marcador abaixo não aparece nos builds normais.
//
// É o DestinoFalso com o "Drive" guardado no localStorage, para sobreviver ao
// "Recarregar" da restauração. O teste controla o popup e as falhas pela mesma
// chave (page.evaluate); não há nenhum gancho em `window`. O token continua só
// em memória, como no destino real.
import type { BackupNuvem } from '@/domain/backupNuvem'
import type {
  DadosGravacao,
  DestinoBackupNuvem,
  OpcoesAutorizacao,
  TipoErroNuvem,
} from '../destino'
import { DestinoFalso, type EstadoDestinoFalso, type ModoAutorizacaoFalsa } from '../destinoFalso'

/** Marcador único deste módulo (procurado no dist pelos builds normais). */
export const CHAVE_DESTINO_E2E = 'study-manager:e2e-destino-falso'

export interface EstadoDestinoE2E extends EstadoDestinoFalso {
  modoAutorizacao: ModoAutorizacaoFalsa
  /** Erros a lançar nas próximas operações do Drive, em ordem. */
  falhas: TipoErroNuvem[]
  email: string | null
  gravacoes: number
  revogacoes: number
  pedidosAutorizacao: number
}

function estadoInicial(): EstadoDestinoE2E {
  return {
    arquivos: [],
    proximoId: 1,
    instante: Date.parse('2026-01-01T00:00:00.000Z'),
    modoAutorizacao: 'concede',
    falhas: [],
    email: 'pessoa@example.com',
    gravacoes: 0,
    revogacoes: 0,
    pedidosAutorizacao: 0,
  }
}

function ler(): EstadoDestinoE2E {
  try {
    const texto = localStorage.getItem(CHAVE_DESTINO_E2E)
    if (!texto) return estadoInicial()
    return { ...estadoInicial(), ...(JSON.parse(texto) as Partial<EstadoDestinoE2E>) }
  } catch {
    return estadoInicial()
  }
}

class DestinoE2E implements DestinoBackupNuvem {
  private readonly falso = new DestinoFalso()
  private estado = ler()

  /** Traz o "Drive" e os controles do localStorage (o teste pode tê-los mudado). */
  private carregar(): void {
    this.estado = ler()
    this.falso.importarEstado(this.estado)
    this.falso.modoAutorizacao = this.estado.modoAutorizacao
    this.falso.email = this.estado.email
    this.falso.falhas.splice(0, this.falso.falhas.length, ...this.estado.falhas)
    this.falso.gravacoes = 0
    this.falso.revogacoes = 0
  }

  private salvar(): void {
    const novo: EstadoDestinoE2E = {
      ...this.estado,
      ...this.falso.exportarEstado(),
      falhas: [...this.falso.falhas],
      gravacoes: this.estado.gravacoes + this.falso.gravacoes,
      revogacoes: this.estado.revogacoes + this.falso.revogacoes,
    }
    this.estado = novo
    localStorage.setItem(CHAVE_DESTINO_E2E, JSON.stringify(novo))
  }

  private async operar<T>(operacao: () => Promise<T>): Promise<T> {
    this.carregar()
    try {
      return await operacao()
    } finally {
      this.salvar()
    }
  }

  preparar(): void {
    this.falso.preparar()
  }

  temToken(): boolean {
    return this.falso.temToken()
  }

  aoMudarToken(ouvinte: () => void): () => void {
    return this.falso.aoMudarToken(ouvinte)
  }

  autorizar(opcoes: OpcoesAutorizacao): Promise<boolean> {
    // Síncrono, como o real: o pedido é registrado ainda dentro do clique.
    this.carregar()
    this.estado.pedidosAutorizacao++
    const pedido = this.falso.autorizar(opcoes)
    this.salvar()
    return pedido
  }

  revogar(): Promise<void> {
    return this.operar(() => this.falso.revogar())
  }

  obterEmail(): Promise<string | null> {
    return this.operar(() => this.falso.obterEmail())
  }

  garantirPasta(pastaId: string | null): Promise<string> {
    return this.operar(() => this.falso.garantirPasta(pastaId))
  }

  acharPasta(pastaId: string | null): Promise<string | null> {
    return this.operar(() => this.falso.acharPasta(pastaId))
  }

  listarBackups(pastaId: string): Promise<BackupNuvem[]> {
    return this.operar(() => this.falso.listarBackups(pastaId))
  }

  gravarBackup(dados: DadosGravacao): Promise<void> {
    return this.operar(() => this.falso.gravarBackup(dados))
  }

  moverParaLixeira(id: string): Promise<void> {
    return this.operar(() => this.falso.moverParaLixeira(id))
  }

  baixarBackup(id: string): Promise<string> {
    return this.operar(() => this.falso.baixarBackup(id))
  }
}

export function criarDestinoE2E(): DestinoBackupNuvem {
  return new DestinoE2E()
}
