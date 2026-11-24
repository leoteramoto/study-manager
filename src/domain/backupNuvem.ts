// Backup automático no Google Drive (Fase 7, RN40–RN53). Funções puras: nomes
// e marcas dos arquivos, leitura das respostas da API (dado não confiável),
// retenção, proteção contra sobrescrever um backup bom (RN45) e as transições
// do estado guardado no banco da nuvem. Quem fala com o Google e quem grava o
// estado ficam fora do domínio.
import { z } from 'zod'
import { type ResumoBackup, tamanhoBackupAceito } from './backup'
import { dataNoFuso, dataValida } from './tempo'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Único escopo pedido ao Google (RN41): só os arquivos criados pelo app. */
export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive.file'

export const NOME_PASTA_NUVEM = 'Study Manager'
export const MIME_PASTA = 'application/vnd.google-apps.folder'
export const MIME_BACKUP = 'application/json'

/** Quantidade de dias mantidos no Drive (RN46). */
export const DIAS_RETENCAO_NUVEM = 30

/** Espera depois do último gatilho automático antes de enviar (RN43). */
export const ESPERA_AGRUPAMENTO_MS = 5_000

/** Tempo limite do popup do Google sem resposta (RN41). */
export const TEMPO_LIMITE_AUTORIZACAO_MS = 2 * 60 * 1000

/** O token é tratado como vencido um pouco antes do `expires_in`. */
export const MARGEM_EXPIRACAO_TOKEN_MS = 60 * 1000

/** Marca gravada em `appProperties` (propriedades privadas do app no Drive). */
export const CHAVE_MARCA = 'studyManager'
export const MARCA_PASTA = 'pasta'
export const MARCA_BACKUP = 'backup'

export const MENSAGEM_SUSPENSAO =
  'Os dados deste navegador têm menos registros que o último backup no Drive. O envio automático foi suspenso para não sobrescrever o backup.'

// ---------------------------------------------------------------------------
// Nomes e marcas
// ---------------------------------------------------------------------------

/** Dia do arquivo no Drive: a data de agora no fuso configurado (RN46). */
export function diaDoBackupNuvem(agora: Date, fuso: string): string {
  return dataNoFuso(agora, fuso)
}

/** `study-manager-backup-YYYY-MM-DD.json`: um arquivo por dia (RN46). */
export function nomeArquivoNuvem(dia: string): string {
  return `study-manager-backup-${dia}.json`
}

export const APP_PROPERTIES_PASTA: Readonly<Record<string, string>> = {
  [CHAVE_MARCA]: MARCA_PASTA,
}

/** Marca e resumo gravados no arquivo do dia (RN46, RN47). Valores do Drive são texto. */
export function appPropertiesDoBackup(dia: string, resumo: ResumoBackup): Record<string, string> {
  return {
    [CHAVE_MARCA]: MARCA_BACKUP,
    dia,
    exportadoEm: resumo.exportadoEm,
    objetivos: String(resumo.objetivos),
    materias: String(resumo.materias),
    registros: String(resumo.registros),
    registrosExcluidos: String(resumo.registrosExcluidos),
  }
}

// ---------------------------------------------------------------------------
// Consultas da API (sintaxe `q` do Drive)
// ---------------------------------------------------------------------------

/** Escapa um texto para uso entre aspas simples numa consulta do Drive. */
export function escaparConsulta(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function filtroMarca(valor: string): string {
  return `appProperties has { key='${CHAVE_MARCA}' and value='${valor}' }`
}

/** Pasta do app, pela marca (o usuário pode tê-la renomeado). */
export function consultaPasta(): string {
  return `mimeType = '${MIME_PASTA}' and ${filtroMarca(MARCA_PASTA)} and trashed = false`
}

/** Backups do app dentro da pasta. */
export function consultaBackups(pastaId: string): string {
  return `'${escaparConsulta(pastaId)}' in parents and ${filtroMarca(MARCA_BACKUP)} and trashed = false`
}

// ---------------------------------------------------------------------------
// Respostas da API: dado não confiável (RN51)
// ---------------------------------------------------------------------------

const idDrive = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
const instante = z.iso.datetime({ offset: true })
const contagem = z
  .string()
  .regex(/^(0|[1-9]\d{0,8})$/)
  .transform(Number)

const esquemaArquivoDrive = z.object({
  id: idDrive,
  name: z.string().max(1000),
  mimeType: z.string().max(255),
  modifiedTime: instante,
  size: z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .optional(),
  appProperties: z.record(z.string(), z.string()).optional(),
})

export type ArquivoDrive = z.output<typeof esquemaArquivoDrive>

/** Um arquivo (metadados) devolvido pela API, ou `null` se não for válido. */
export function interpretarArquivoDrive(resposta: unknown): ArquivoDrive | null {
  const resultado = esquemaArquivoDrive.safeParse(resposta)
  return resultado.success ? resultado.data : null
}

export interface PaginaArquivos {
  arquivos: ArquivoDrive[]
  proximaPagina: string | null
}

const esquemaLista = z.object({
  files: z.array(z.unknown()),
  nextPageToken: z.string().min(1).max(4096).optional(),
})

/**
 * Página de `files.list`. Itens inválidos são descartados um a um; uma
 * resposta sem o formato de lista devolve `null`.
 */
export function interpretarListaArquivos(resposta: unknown): PaginaArquivos | null {
  const lista = esquemaLista.safeParse(resposta)
  if (!lista.success) return null
  const arquivos = lista.data.files
    .map(interpretarArquivoDrive)
    .filter((arquivo): arquivo is ArquivoDrive => arquivo !== null)
  return { arquivos, proximaPagina: lista.data.nextPageToken ?? null }
}

const esquemaSobre = z.object({ user: z.object({ emailAddress: z.email() }) })

/** E-mail da conta conectada (`about.get`), ou `null` se a resposta não o trouxer. */
export function interpretarEmail(resposta: unknown): string | null {
  const resultado = esquemaSobre.safeParse(resposta)
  return resultado.success ? resultado.data.user.emailAddress : null
}

export interface TokenAcesso {
  token: string
  /** Instante (ms desde a época) em que o Google diz que o token vence. */
  expiraEm: number
}

const esquemaToken = z.object({
  access_token: z.string().regex(/^[\x21-\x7e]{1,4096}$/),
  expires_in: z.union([
    z.number().int().positive(),
    z
      .string()
      .regex(/^[1-9]\d{0,6}$/)
      .transform(Number),
  ]),
  scope: z.string(),
})

/**
 * Resposta do token client do GIS. Só aceita token que tenha o escopo
 * `drive.file`; erro, formato inválido ou escopo negado devolvem `null`.
 */
export function interpretarRespostaToken(resposta: unknown, agora: Date): TokenAcesso | null {
  const resultado = esquemaToken.safeParse(resposta)
  if (!resultado.success) return null
  const { access_token, expires_in, scope } = resultado.data
  if (!scope.split(' ').includes(ESCOPO_DRIVE)) return null
  return { token: access_token, expiraEm: agora.getTime() + expires_in * 1000 }
}

/** Token ainda utilizável, com a margem antes do vencimento. */
export function tokenValido(token: TokenAcesso | null, agora: Date): token is TokenAcesso {
  return token !== null && token.expiraEm - MARGEM_EXPIRACAO_TOKEN_MS > agora.getTime()
}

/**
 * Endereço da sessão de upload resumable (cabeçalho `Location`). Só é aceito
 * se apontar para o endpoint de upload do Drive.
 */
export function urlSessaoUploadValida(url: string | null): url is string {
  if (url === null) return false
  try {
    const endereco = new URL(url)
    return (
      endereco.protocol === 'https:' &&
      endereco.host === 'www.googleapis.com' &&
      endereco.pathname.startsWith('/upload/drive/v3/files')
    )
  } catch {
    return false
  }
}

/** Tamanho informado nos metadados, conferido antes de baixar (RN47). */
export function tamanhoNuvemAceito(arquivo: ArquivoDrive): boolean {
  return arquivo.size !== undefined && tamanhoBackupAceito(arquivo.size)
}

// ---------------------------------------------------------------------------
// Backups da pasta: lista, retenção e referência
// ---------------------------------------------------------------------------

/** Resumo lido do `appProperties`: só informação, nunca usado para restaurar. */
export interface ResumoNuvem {
  exportadoEm: string
  objetivos: number
  materias: number
  registros: number
  registrosExcluidos: number
}

export interface BackupNuvem {
  id: string
  nome: string
  dia: string
  modificadoEm: string
  tamanhoBytes: number | null
  resumo: ResumoNuvem | null
}

const esquemaMarcaBackup = z.object({
  [CHAVE_MARCA]: z.literal(MARCA_BACKUP),
  dia: z.string().refine(dataValida),
})

const esquemaResumoNuvem = z
  .object({
    exportadoEm: instante,
    objetivos: contagem,
    materias: contagem,
    registros: contagem,
    registrosExcluidos: contagem,
  })
  .refine((resumo) => resumo.registrosExcluidos <= resumo.registros)

function compararBackups(a: BackupNuvem, b: BackupNuvem): number {
  if (a.dia !== b.dia) return a.dia < b.dia ? 1 : -1
  const porModificacao = Date.parse(b.modificadoEm) - Date.parse(a.modificadoEm)
  if (porModificacao !== 0) return porModificacao
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Backups do app entre os arquivos da pasta, do mais recente para o mais
 * antigo (dia, depois modificação). Arquivos sem a marca do app ou com o dia
 * inválido ficam de fora: o app não os mostra nem os apaga.
 */
export function interpretarBackupsDaPasta(arquivos: readonly ArquivoDrive[]): BackupNuvem[] {
  const backups: BackupNuvem[] = []
  for (const arquivo of arquivos) {
    const marca = esquemaMarcaBackup.safeParse(arquivo.appProperties)
    if (!marca.success || arquivo.mimeType === MIME_PASTA) continue
    const resumo = esquemaResumoNuvem.safeParse(arquivo.appProperties)
    backups.push({
      id: arquivo.id,
      nome: arquivo.name,
      dia: marca.data.dia,
      modificadoEm: arquivo.modifiedTime,
      tamanhoBytes: arquivo.size ?? null,
      resumo: resumo.success ? resumo.data : null,
    })
  }
  return backups.sort(compararBackups)
}

/** Arquivo do dia a sobrescrever (o mais recente daquele dia), se existir. */
export function backupDoDia(backups: readonly BackupNuvem[], dia: string): BackupNuvem | null {
  return [...backups].sort(compararBackups).find((backup) => backup.dia === dia) ?? null
}

/** Backups além dos `dias` dias mais recentes: vão para a lixeira (RN46). */
export function backupsParaLixeira(
  backups: readonly BackupNuvem[],
  dias: number = DIAS_RETENCAO_NUVEM,
): BackupNuvem[] {
  const diasMantidos = new Set(
    [...new Set(backups.map((backup) => backup.dia))].sort().reverse().slice(0, dias),
  )
  return backups.filter((backup) => !diasMantidos.has(backup.dia))
}

/**
 * Contagem de referência do RN45 lida do Drive ao conectar: a quantidade de
 * registros do backup **mais recente**. Se ela faltar ou for inválida, não há
 * referência (não se procura em backups mais antigos).
 */
export function referenciaDoDrive(backups: readonly BackupNuvem[]): number | null {
  const maisRecente = [...backups].sort(compararBackups)[0]
  return maisRecente?.resumo?.registros ?? null
}

// ---------------------------------------------------------------------------
// Proteção contra sobrescrever um backup bom (RN45)
// ---------------------------------------------------------------------------

/**
 * O envio automático é suspenso quando há menos registros (contando os
 * excluídos logicamente) que no último envio com sucesso. Sem referência, libera.
 */
export function envioSuspenso(totalRegistros: number, referencia: number | null): boolean {
  return referencia !== null && totalRegistros < referencia
}

// ---------------------------------------------------------------------------
// Estado guardado no banco da nuvem
// ---------------------------------------------------------------------------

export type SituacaoNuvem = 'ok' | 'pendente' | 'erro'
export type MotivoErroNuvem = 'suspenso' | 'falha'

export const ID_ESTADO_NUVEM = 'drive'

export interface EstadoNuvem {
  id: typeof ID_ESTADO_NUVEM
  conectado: boolean
  email: string | null
  pastaId: string | null
  ultimoEnvioEm: string | null
  /** Último gatilho: um envio iniciado antes dele não deixa a situação em `ok`. */
  ultimoGatilhoEm: string | null
  situacao: SituacaoNuvem
  mensagemErro: string | null
  motivoErro: MotivoErroNuvem | null
  registrosUltimoEnvio: number | null
}

export function estadoInicialNuvem(): EstadoNuvem {
  return {
    id: ID_ESTADO_NUVEM,
    conectado: false,
    email: null,
    pastaId: null,
    ultimoEnvioEm: null,
    ultimoGatilhoEm: null,
    situacao: 'ok',
    mensagemErro: null,
    motivoErro: null,
    registrosUltimoEnvio: null,
  }
}

const SEM_ERRO = { mensagemErro: null, motivoErro: null } as const

interface DadosConexao {
  email: string | null
  pastaId: string
  /** Contagem do backup mais recente no Drive (`referenciaDoDrive`). */
  referenciaDrive: number | null
}

/**
 * Conexão bem-sucedida. A referência do Drive só é usada quando não há
 * referência local (primeira conexão ou depois de desconectar): assim uma
 * restauração deliberada de um backup mais antigo continua valendo.
 */
export function aoConectar(estado: EstadoNuvem, dados: DadosConexao): EstadoNuvem {
  return {
    ...estado,
    conectado: true,
    email: dados.email,
    pastaId: dados.pastaId,
    registrosUltimoEnvio: estado.registrosUltimoEnvio ?? dados.referenciaDrive,
  }
}

/** "Desconectar": limpa todo o estado local (nada é apagado no Drive). */
export function aoDesconectar(): EstadoNuvem {
  return estadoInicialNuvem()
}

/**
 * Gatilho de envio (RN43), gravado na hora. Com o envio suspenso (RN45), a
 * suspensão continua visível: o envio agendado confere de novo a contagem.
 */
export function aoGatilho(estado: EstadoNuvem, agora: Date): EstadoNuvem {
  if (!estado.conectado) return estado
  const ultimoGatilhoEm = agora.toISOString()
  if (estado.motivoErro === 'suspenso') return { ...estado, ultimoGatilhoEm }
  return { ...estado, ...SEM_ERRO, situacao: 'pendente', ultimoGatilhoEm }
}

interface DadosEnvio {
  /** Instante em que o envio começou (antes de ler os dados). */
  iniciadoEm: Date
  concluidoEm: Date
  totalRegistros: number
  pastaId: string
}

/**
 * Envio com sucesso. Se houve gatilho depois que o envio começou, os dados
 * enviados podem estar desatualizados: a situação continua `pendente`.
 */
export function aoEnviar(estado: EstadoNuvem, dados: DadosEnvio): EstadoNuvem {
  const gatilhoDepois =
    estado.ultimoGatilhoEm !== null &&
    Date.parse(estado.ultimoGatilhoEm) >= dados.iniciadoEm.getTime()
  return {
    ...estado,
    ...SEM_ERRO,
    pastaId: dados.pastaId,
    situacao: gatilhoDepois ? 'pendente' : 'ok',
    ultimoEnvioEm: dados.concluidoEm.toISOString(),
    registrosUltimoEnvio: dados.totalRegistros,
  }
}

/** Envio automático suspenso pelo RN45 (aparece também no cabeçalho, RN53). */
export function aoSuspender(estado: EstadoNuvem): EstadoNuvem {
  return {
    ...estado,
    situacao: 'erro',
    motivoErro: 'suspenso',
    mensagemErro: MENSAGEM_SUSPENSAO,
  }
}

/** Falha da API ou da validação: a mensagem já vem pronta, em português. */
export function aoFalhar(estado: EstadoNuvem, mensagem: string): EstadoNuvem {
  return { ...estado, situacao: 'erro', motivoErro: 'falha', mensagemErro: mensagem }
}

/**
 * Restauração bem-sucedida (de arquivo ou do Drive): a referência passa a ser
 * a dos dados restaurados. Conectado, os dados restaurados ainda não estão no
 * Drive, então fica `pendente` e qualquer erro (inclusive a suspensão) sai.
 */
export function aoRestaurar(estado: EstadoNuvem, totalRegistros: number, agora: Date): EstadoNuvem {
  if (!estado.conectado) return { ...estado, registrosUltimoEnvio: totalRegistros }
  return {
    ...estado,
    ...SEM_ERRO,
    situacao: 'pendente',
    ultimoGatilhoEm: agora.toISOString(),
    registrosUltimoEnvio: totalRegistros,
  }
}

export type IndicadorNuvem = 'suspenso' | 'reconectar' | null

/**
 * Indicador do cabeçalho: a suspensão (RN53) tem prioridade sobre
 * "Reconectar Google Drive" (RN49), que só aparece com envio pendente e sem
 * token válido nesta aba.
 */
export function indicadorCabecalho(estado: EstadoNuvem, temToken: boolean): IndicadorNuvem {
  if (!estado.conectado) return null
  if (estado.motivoErro === 'suspenso') return 'suspenso'
  if (estado.situacao === 'pendente' && !temToken) return 'reconectar'
  return null
}

/** Último backup considerado pelo lembrete (RN50): o mais recente dos dois. */
export function ultimoBackupConsiderado(
  ultimoBackupEm: string | null,
  ultimoEnvioNuvemEm: string | null,
): string | null {
  if (ultimoBackupEm === null) return ultimoEnvioNuvemEm
  if (ultimoEnvioNuvemEm === null) return ultimoBackupEm
  return Date.parse(ultimoEnvioNuvemEm) > Date.parse(ultimoBackupEm)
    ? ultimoEnvioNuvemEm
    : ultimoBackupEm
}
