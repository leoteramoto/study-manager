// Backup e restauração (RN32, RN33). Funções puras: montam e conferem o
// arquivo. Quem lê e grava o banco é o repositório (`db/backupRepositorio`).
//
// Todo arquivo importado é dado não confiável: nada aqui confia no conteúdo
// antes de passar pelo Zod, pelo checksum e pela integridade referencial.
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { z } from 'zod'
import { arredondarPeso, esquemaMetaMensal, PESO_MAXIMO, PESO_MINIMO } from './calculos'
import { TAMANHO_MAXIMO_DESCRICAO, TAMANHO_MAXIMO_NOME } from './cadastro'
import { chaveComparacao, gerarCodigo, normalizarNome, validarSigla } from './codigo'
import { DURACAO_MAXIMA_MIN, DURACAO_MINIMA_MIN, DURACAO_MINIMA_REGISTRO_SEG } from './cronometro'
import { dataValida } from './tempo'

export const APP_BACKUP = 'study-manager'

/** Versão atual do formato dos dados (igual à versão do schema do banco). */
export const VERSAO_SCHEMA = 1

/** Limite conferido antes de ler o arquivo, para não travar a aba. */
export const TAMANHO_MAXIMO_BACKUP_BYTES = 50 * 1024 * 1024

export const MENSAGENS_BACKUP = {
  grande: 'O arquivo é grande demais para ser um backup do Study Manager (limite de 50 MB).',
  json: 'O arquivo não pôde ser lido: o conteúdo não é um JSON válido.',
  outroApp: 'Este arquivo não é um backup do Study Manager.',
  checksum: 'O arquivo foi alterado ou está corrompido: o checksum não confere.',
} as const

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

const instante = z.iso.datetime()
const id = z.uuid()

const nome = z
  .string()
  .min(1)
  .max(TAMANHO_MAXIMO_NOME)
  .refine((texto) => normalizarNome(texto) === texto, 'o nome tem espaços sobrando')

/** Contexto que vem de fora do domínio (lista de sons e validação de fuso do `Intl`). */
export interface ContextoBackup {
  idsSons: readonly string[]
  fusoValido: (fuso: string) => boolean
}

function criarEsquemaDados({ idsSons, fusoValido }: ContextoBackup) {
  const objetivo = z.strictObject({
    id,
    nome,
    sigla: z.string().refine((sigla) => validarSigla(sigla) === null, 'sigla inválida'),
    ordem: z.number(),
    ativo: z.boolean(),
    criadoEm: instante,
    atualizadoEm: instante,
  })

  const materia = z.strictObject({
    id,
    objetivoId: id,
    nome,
    codigo: z.string().min(1),
    descricao: z
      .string()
      .min(1)
      .max(TAMANHO_MAXIMO_DESCRICAO)
      .refine((texto) => texto.trim() === texto, 'a descrição tem espaços sobrando')
      .nullable(),
    cor: z.string().regex(/^#[0-9a-f]{6}$/, 'cor inválida'),
    ordem: z.number(),
    ativo: z.boolean(),
    criadoEm: instante,
    atualizadoEm: instante,
  })

  const itemPlanejamento = z.strictObject({
    materiaId: id,
    peso: z
      .number()
      .min(PESO_MINIMO)
      .max(PESO_MAXIMO)
      .refine((peso) => arredondarPeso(peso) === peso, 'o peso tem mais de uma casa decimal'),
    adicionadoEm: instante,
  })

  const registro = z
    .strictObject({
      id,
      materiaId: id,
      objetivoId: id,
      data: z.string().refine(dataValida, 'data inválida'),
      inicio: instante.nullable(),
      fim: instante.nullable(),
      duracaoSeg: z.number().int().min(DURACAO_MINIMA_REGISTRO_SEG),
      duracaoPlanejadaMin: z
        .number()
        .int()
        .min(DURACAO_MINIMA_MIN)
        .max(DURACAO_MAXIMA_MIN)
        .nullable(),
      origem: z.enum(['cronometro', 'manual']),
      tipoEncerramento: z.enum(['concluido', 'antecipado', 'recuperado', 'manual']),
      excluidoEm: instante.nullable(),
      criadoEm: instante,
      atualizadoEm: instante,
    })
    .superRefine((r, ctx) => {
      const manual = r.origem === 'manual'
      if (manual !== (r.tipoEncerramento === 'manual')) {
        ctx.addIssue({
          code: 'custom',
          message: 'a origem não combina com o tipo de encerramento',
        })
      }
      const campos = [r.inicio, r.fim, r.duracaoPlanejadaMin]
      if (manual && campos.some((campo) => campo !== null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'lançamento manual não pode ter início, término nem tempo planejado',
        })
      }
      if (!manual && campos.some((campo) => campo === null)) {
        ctx.addIssue({
          code: 'custom',
          message: 'registro do cronômetro precisa de início, término e tempo planejado',
        })
      }
    })

  const configuracoes = z.strictObject({
    id: z.literal('app'),
    metaMensalHoras: esquemaMetaMensal.nullable(),
    fusoHorario: z.string().refine(fusoValido, 'fuso horário desconhecido'),
    somAtivo: z.boolean(),
    somId: z.string().refine((som) => idsSons.includes(som), 'som desconhecido'),
    volume: z.number().min(0).max(1),
    notificacoesAtivas: z.boolean(),
    ultimoBackupEm: instante.nullable(),
    schemaVersion: z.number().int().min(1),
  })

  return z.strictObject({
    objetivos: z.array(objetivo),
    materias: z.array(materia),
    planejamento: z.array(itemPlanejamento),
    registros: z.array(registro),
    configuracoes,
  })
}

export type DadosBackup = z.output<ReturnType<typeof criarEsquemaDados>>

const esquemaEnvelope = z.strictObject({
  app: z.literal(APP_BACKUP),
  schemaVersion: z.number().int().min(1),
  exportadoEm: instante,
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  dados: z.record(z.string(), z.unknown()),
})

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

/** SHA-256 em hexadecimal (Web Crypto). */
export async function calcularChecksum(texto: string): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** `study-manager-backup-YYYY-MM-DD-HHmm.json`, no fuso configurado (RN32). */
export function nomeArquivoBackup(agora: Date, fuso: string): string {
  return `study-manager-backup-${format(new TZDate(agora, fuso), 'yyyy-MM-dd-HHmm')}.json`
}

export interface ArquivoBackup {
  nome: string
  conteudo: string
  exportadoEm: string
}

/**
 * Monta o arquivo de backup (RN32). O `ultimoBackupEm` gravado no arquivo já é
 * o instante desta exportação: assim a restauração reproduz os dados
 * exatamente e o lembrete (RN34) não reaparece logo depois dela.
 *
 * O checksum é o SHA-256 do `JSON.stringify(dados)` compacto. O arquivo sai
 * indentado; a indentação não entra no checksum.
 */
export async function montarArquivoBackup(
  dados: DadosBackup,
  agora: Date,
  fuso: string,
): Promise<ArquivoBackup> {
  const exportadoEm = agora.toISOString()
  const dadosFinais: DadosBackup = {
    ...dados,
    configuracoes: { ...dados.configuracoes, ultimoBackupEm: exportadoEm },
  }
  const checksum = await calcularChecksum(JSON.stringify(dadosFinais))
  const envelope = {
    app: APP_BACKUP,
    schemaVersion: VERSAO_SCHEMA,
    exportadoEm,
    checksum,
    dados: dadosFinais,
  }
  return {
    nome: nomeArquivoBackup(agora, fuso),
    conteudo: `${JSON.stringify(envelope, null, 2)}\n`,
    exportadoEm,
  }
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

/** Confere o tamanho antes de ler o conteúdo do arquivo. */
export function tamanhoBackupAceito(bytes: number): boolean {
  return bytes <= TAMANHO_MAXIMO_BACKUP_BYTES
}

/** Migração de `n` para `n + 1`, indexada por `n`. */
export type Migracao = (dados: unknown) => unknown

/** Nenhuma migração ainda: só existe a versão 1. */
export const MIGRACOES: Readonly<Record<number, Migracao>> = {}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string }

/** Aplica as migrações em sequência, da versão do arquivo até a atual (RN33, passo 4). */
export function migrarDados(
  dados: unknown,
  de: number,
  para: number,
  migracoes: Readonly<Record<number, Migracao>> = MIGRACOES,
): Resultado<unknown> {
  if (de > para) {
    return {
      ok: false,
      erro: `Este backup foi feito por uma versão mais nova do app (formato ${de}). Atualize o app para restaurá-lo.`,
    }
  }
  let atual = dados
  for (let versao = de; versao < para; versao++) {
    const migracao = migracoes[versao]
    if (!migracao) {
      return { ok: false, erro: `Não há como converter backups do formato ${versao}.` }
    }
    atual = migracao(atual)
  }
  return { ok: true, valor: atual }
}

function descreverCaminho(caminho: readonly PropertyKey[]): string {
  return caminho.reduce<string>((texto, parte) => {
    if (typeof parte === 'number') return `${texto}[${parte}]`
    const nomeParte = String(parte)
    return texto ? `${texto}.${nomeParte}` : nomeParte
  }, '')
}

function mensagemDoZod(erro: z.ZodError): string {
  const problema = erro.issues[0]
  const caminho = problema ? descreverCaminho(problema.path) : ''
  const detalhe = problema?.code === 'custom' ? `: ${problema.message}` : ''
  const local = caminho ? ` (campo ${caminho}${detalhe})` : ''
  return `O arquivo não é um backup válido${local}.`
}

function primeiroDuplicado(chaves: readonly string[]): string | null {
  const vistas = new Set<string>()
  for (const chave of chaves) {
    if (vistas.has(chave)) return chave
    vistas.add(chave)
  }
  return null
}

/**
 * Confere a integridade referencial e as unicidades (RN33, passo 5).
 * Retorna a lista de problemas encontrados (vazia quando está tudo certo).
 */
export function verificarIntegridade(dados: DadosBackup): string[] {
  const problemas: string[] = []

  const tabelas = [
    ['objetivos', dados.objetivos.map((o) => o.id)],
    ['matérias', dados.materias.map((m) => m.id)],
    ['planejamento', dados.planejamento.map((p) => p.materiaId)],
    ['registros', dados.registros.map((r) => r.id)],
  ] as const
  for (const [tabela, ids] of tabelas) {
    if (primeiroDuplicado(ids)) problemas.push(`Há identificadores repetidos em ${tabela}.`)
  }

  const siglaRepetida = primeiroDuplicado(dados.objetivos.map((o) => chaveComparacao(o.sigla)))
  if (siglaRepetida)
    problemas.push(`A sigla "${siglaRepetida.toUpperCase()}" aparece mais de uma vez.`)

  const objetivos = new Map(dados.objetivos.map((o) => [o.id, o]))
  const materias = new Map(dados.materias.map((m) => [m.id, m]))

  for (const materia of dados.materias) {
    const objetivo = objetivos.get(materia.objetivoId)
    if (!objetivo) {
      problemas.push(`A matéria "${materia.codigo}" aponta para um objetivo que não existe.`)
    } else if (materia.codigo !== gerarCodigo(materia.nome, objetivo.sigla)) {
      problemas.push(`O código "${materia.codigo}" não corresponde ao nome e à sigla da matéria.`)
    }
  }

  const codigoRepetido = primeiroDuplicado(dados.materias.map((m) => chaveComparacao(m.codigo)))
  if (codigoRepetido) problemas.push(`O código "${codigoRepetido}" aparece mais de uma vez.`)

  for (const item of dados.planejamento) {
    const materia = materias.get(item.materiaId)
    if (!materia) {
      problemas.push('O planejamento tem uma matéria que não existe.')
    } else if (!materia.ativo || !objetivos.get(materia.objetivoId)?.ativo) {
      problemas.push(`A matéria arquivada "${materia.codigo}" está no planejamento.`)
    }
  }

  for (const registro of dados.registros) {
    const materia = materias.get(registro.materiaId)
    if (!materia) {
      problemas.push(`O registro de ${registro.data} aponta para uma matéria que não existe.`)
    } else if (registro.objetivoId !== materia.objetivoId) {
      problemas.push(
        `O registro de ${registro.data} (${materia.codigo}) aponta para o objetivo errado.`,
      )
    }
  }

  return problemas
}

export interface BackupValidado {
  exportadoEm: string
  /** Versão do arquivo antes da migração. */
  schemaVersionOriginal: number
  dados: DadosBackup
}

/**
 * Valida o texto de um arquivo de backup, sem tocar no banco (RN33, passos 2 a 5):
 * JSON → envelope (Zod) → checksum → versão e migração → dados (Zod) → integridade.
 */
export async function validarArquivoBackup(
  texto: string,
  contexto: ContextoBackup,
  versaoAtual: number = VERSAO_SCHEMA,
  migracoes: Readonly<Record<number, Migracao>> = MIGRACOES,
): Promise<Resultado<BackupValidado>> {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto) as unknown
  } catch {
    return { ok: false, erro: MENSAGENS_BACKUP.json }
  }

  const app: unknown =
    typeof bruto === 'object' && bruto !== null ? Reflect.get(bruto, 'app') : undefined
  if (app !== APP_BACKUP) return { ok: false, erro: MENSAGENS_BACKUP.outroApp }

  const envelope = esquemaEnvelope.safeParse(bruto)
  if (!envelope.success) return { ok: false, erro: mensagemDoZod(envelope.error) }

  const { checksum, dados, exportadoEm, schemaVersion } = envelope.data
  if ((await calcularChecksum(JSON.stringify(dados))) !== checksum) {
    return { ok: false, erro: MENSAGENS_BACKUP.checksum }
  }

  const migrado = migrarDados(dados, schemaVersion, versaoAtual, migracoes)
  if (!migrado.ok) return migrado

  const conteudo = criarEsquemaDados(contexto).safeParse(migrado.valor)
  if (!conteudo.success) return { ok: false, erro: mensagemDoZod(conteudo.error) }

  const problemas = verificarIntegridade(conteudo.data)
  if (problemas.length > 0) {
    return { ok: false, erro: `O backup tem dados inconsistentes. ${problemas[0]}` }
  }

  return {
    ok: true,
    valor: { exportadoEm, schemaVersionOriginal: schemaVersion, dados: conteudo.data },
  }
}

export interface ResumoBackup {
  exportadoEm: string
  objetivos: number
  materias: number
  registros: number
  registrosExcluidos: number
}

/** Resumo mostrado antes da confirmação (RN33, passo 6). */
export function resumirBackup({ exportadoEm, dados }: BackupValidado): ResumoBackup {
  return {
    exportadoEm,
    objetivos: dados.objetivos.length,
    materias: dados.materias.length,
    registros: dados.registros.length,
    registrosExcluidos: dados.registros.filter((r) => r.excluidoEm !== null).length,
  }
}

// ---------------------------------------------------------------------------
// Lembrete (RN34)
// ---------------------------------------------------------------------------

export const DIAS_LEMBRETE_BACKUP = 7
const LIMITE_LEMBRETE_MS = DIAS_LEMBRETE_BACKUP * 24 * 60 * 60 * 1000

/** Lembrete quando nunca houve backup ou o último tem mais de 7 dias (RN34). */
export function precisaLembreteBackup(ultimoBackupEm: string | null, agora: Date): boolean {
  if (ultimoBackupEm === null) return true
  return agora.getTime() - Date.parse(ultimoBackupEm) > LIMITE_LEMBRETE_MS
}
