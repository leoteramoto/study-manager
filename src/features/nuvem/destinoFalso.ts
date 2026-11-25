// Destino falso, em memória (RN52): usado pelos testes unitários e pelo build
// do E2E. Simula o Drive com as mesmas regras de visibilidade do `drive.file`
// (só o que o app criou) e passa as marcas pelo mesmo `appProperties` que a
// implementação real, para exercitar a leitura do domínio.
import {
  APP_PROPERTIES_PASTA,
  type ArquivoDrive,
  type BackupNuvem,
  CHAVE_MARCA,
  interpretarBackupsDaPasta,
  MARCA_PASTA,
  MIME_BACKUP,
  MIME_PASTA,
  NOME_PASTA_NUVEM,
  tamanhoNuvemAceito,
} from '@/domain/backupNuvem'
import {
  type DadosGravacao,
  type DestinoBackupNuvem,
  ErroArquivoGrande,
  ErroNuvem,
  type OpcoesAutorizacao,
  type TipoErroNuvem,
} from './destino'

/** O que acontece no próximo pedido de token. `pendente` nunca responde. */
export type ModoAutorizacaoFalsa = 'concede' | 'nega' | 'pendente'

export interface ArquivoFalso {
  meta: ArquivoDrive
  pais: string[]
  lixeira: boolean
  conteudo: string
}

/** Estado do "Drive" falso, serializável (para o destino do E2E guardar). */
export interface EstadoDestinoFalso {
  arquivos: ArquivoFalso[]
  proximoId: number
  instante: number
}

export class DestinoFalso implements DestinoBackupNuvem {
  email: string | null = 'pessoa@example.com'
  modoAutorizacao: ModoAutorizacaoFalsa = 'concede'
  /** Erros a lançar nas próximas operações do Drive, em ordem. */
  readonly falhas: TipoErroNuvem[] = []
  /** Enquanto definido, `gravarBackup` espera esta promessa (envio lento). */
  atrasoGravacao: Promise<void> | null = null
  readonly arquivos = new Map<string, ArquivoFalso>()
  readonly pedidosAutorizacao: OpcoesAutorizacao[] = []
  gravacoes = 0
  preparacoes = 0
  revogacoes = 0
  /** Maior número de gravações simultâneas já visto (teste do lock). */
  maxGravacoesSimultaneas = 0

  private token = false
  private gravacoesEmAndamento = 0
  private proximoId = 1
  private instante = Date.parse('2026-01-01T00:00:00.000Z')
  private readonly ouvintes = new Set<() => void>()

  exportarEstado(): EstadoDestinoFalso {
    return {
      arquivos: [...this.arquivos.values()],
      proximoId: this.proximoId,
      instante: this.instante,
    }
  }

  importarEstado(estado: EstadoDestinoFalso): void {
    this.arquivos.clear()
    for (const arquivo of estado.arquivos) this.arquivos.set(arquivo.meta.id, arquivo)
    this.proximoId = estado.proximoId
    this.instante = estado.instante
  }

  preparar(): void {
    this.preparacoes++
  }

  temToken(): boolean {
    return this.token
  }

  aoMudarToken(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  /** Simula token concedido ou perdido (vencido, revogado, outra aba). */
  definirToken(valor: boolean): void {
    if (this.token === valor) return
    this.token = valor
    for (const ouvinte of this.ouvintes) ouvinte()
  }

  autorizar(opcoes: OpcoesAutorizacao): Promise<boolean> {
    this.pedidosAutorizacao.push(opcoes)
    if (this.modoAutorizacao === 'pendente') return new Promise<boolean>(() => undefined)
    const concedida = this.modoAutorizacao === 'concede'
    return Promise.resolve().then(() => {
      if (concedida) this.definirToken(true)
      return concedida
    })
  }

  revogar(): Promise<void> {
    if (this.token) this.revogacoes++
    this.definirToken(false)
    return Promise.resolve()
  }

  async obterEmail(): Promise<string | null> {
    await this.operacao()
    return this.email
  }

  async garantirPasta(pastaId: string | null): Promise<string> {
    return (
      (await this.acharPasta(pastaId)) ??
      this.criar(NOME_PASTA_NUVEM, MIME_PASTA, [], { ...APP_PROPERTIES_PASTA }, '').meta.id
    )
  }

  async acharPasta(pastaId: string | null): Promise<string | null> {
    await this.operacao()
    const atual = pastaId === null ? undefined : this.arquivos.get(pastaId)
    if (atual && !atual.lixeira) return atual.meta.id
    for (const arquivo of this.arquivos.values()) {
      if (
        !arquivo.lixeira &&
        arquivo.meta.mimeType === MIME_PASTA &&
        arquivo.meta.appProperties?.[CHAVE_MARCA] === MARCA_PASTA
      ) {
        return arquivo.meta.id
      }
    }
    return null
  }

  async listarBackups(pastaId: string): Promise<BackupNuvem[]> {
    await this.operacao()
    return interpretarBackupsDaPasta(this.doApp(pastaId).map((arquivo) => arquivo.meta))
  }

  async gravarBackup(dados: DadosGravacao): Promise<void> {
    await this.operacao()
    this.gravacoesEmAndamento++
    this.maxGravacoesSimultaneas = Math.max(this.maxGravacoesSimultaneas, this.gravacoesEmAndamento)
    try {
      if (this.atrasoGravacao) await this.atrasoGravacao
      const existente =
        dados.idExistente === null ? undefined : this.arquivos.get(dados.idExistente)
      if (existente && !existente.lixeira) {
        existente.conteudo = dados.conteudo
        existente.meta = {
          ...existente.meta,
          appProperties: dados.appProperties,
          modifiedTime: this.carimbo(),
          size: dados.conteudo.length,
        }
      } else {
        this.criar(dados.nome, MIME_BACKUP, [dados.pastaId], dados.appProperties, dados.conteudo)
      }
      this.gravacoes++
    } finally {
      this.gravacoesEmAndamento--
    }
  }

  async moverParaLixeira(id: string): Promise<void> {
    await this.operacao()
    const arquivo = this.arquivos.get(id)
    if (!arquivo) throw new ErroNuvem('falha', 'arquivo não encontrado')
    arquivo.lixeira = true
  }

  async baixarBackup(id: string): Promise<string> {
    await this.operacao()
    const arquivo = this.arquivos.get(id)
    if (!arquivo || arquivo.lixeira) throw new ErroNuvem('falha', 'arquivo não encontrado')
    if (!tamanhoNuvemAceito(arquivo.meta)) throw new ErroArquivoGrande()
    return arquivo.conteudo
  }

  /** Arquivos do app na pasta, fora da lixeira (o que o `drive.file` enxerga). */
  doApp(pastaId: string): ArquivoFalso[] {
    return [...this.arquivos.values()].filter(
      (arquivo) => !arquivo.lixeira && arquivo.pais.includes(pastaId),
    )
  }

  /** Coloca um backup antigo na pasta, como se tivesse sido enviado naquele dia. */
  semear(
    pastaId: string,
    nome: string,
    appProperties: Record<string, string>,
    conteudo = '{}',
  ): string {
    return this.criar(nome, MIME_BACKUP, [pastaId], appProperties, conteudo).meta.id
  }

  private criar(
    nome: string,
    mimeType: string,
    pais: string[],
    appProperties: Record<string, string>,
    conteudo: string,
  ): ArquivoFalso {
    const id = `falso${this.proximoId++}`
    const arquivo: ArquivoFalso = {
      meta: {
        id,
        name: nome,
        mimeType,
        modifiedTime: this.carimbo(),
        ...(mimeType === MIME_PASTA ? {} : { size: conteudo.length }),
        appProperties,
      },
      pais,
      lixeira: false,
      conteudo,
    }
    this.arquivos.set(id, arquivo)
    return arquivo
  }

  /** Relógio próprio, sempre crescente, para a ordem de modificação. */
  private carimbo(): string {
    this.instante += 1000
    return new Date(this.instante).toISOString()
  }

  /** Toda operação do Drive exige token e pode falhar pela fila de falhas. */
  private async operacao(): Promise<void> {
    await Promise.resolve()
    const falha = this.falhas.shift()
    if (falha === 'semAutorizacao') this.definirToken(false)
    if (falha) throw new ErroNuvem(falha)
    if (!this.token) throw new ErroNuvem('semAutorizacao')
  }
}
