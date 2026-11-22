// Tipos das tabelas do IndexedDB, conforme a seção "Data model" da especificação.
// Datas-hora: ISO em UTC. Datas de calendário: `YYYY-MM-DD` no fuso configurado.

export interface Objetivo {
  id: string
  nome: string
  /** Única e imutável (RN01). */
  sigla: string
  ordem: number
  /** `false` = arquivado. */
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface Materia {
  id: string
  /** Imutável (RN02). */
  objetivoId: string
  nome: string
  /** `${nome.trim()}-${sigla}`, único (RN03). */
  codigo: string
  descricao: string | null
  cor: string
  ordem: number
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface ItemPlanejamento {
  materiaId: string
  peso: number
  adicionadoEm: string
}

export type OrigemRegistro = 'cronometro' | 'manual'
export type TipoEncerramento = 'concluido' | 'antecipado' | 'recuperado' | 'manual'

export interface Registro {
  id: string
  materiaId: string
  objetivoId: string
  /** Data de início no fuso configurado (RN22). */
  data: string
  inicio: string | null
  fim: string | null
  duracaoSeg: number
  duracaoPlanejadaMin: number | null
  origem: OrigemRegistro
  tipoEncerramento: TipoEncerramento
  /** Exclusão lógica (RN31). */
  excluidoEm: string | null
  criadoEm: string
  atualizadoEm: string
}

// A sessão ativa do cronômetro é o estado da máquina de estados do domínio.
export type {
  EstadoSessao,
  MotivoPausaAutomatica,
  Sessao as SessaoAtiva,
} from '@/domain/cronometro'

export interface Configuracoes {
  id: 'app'
  metaMensalHoras: number | null
  fusoHorario: string
  somAtivo: boolean
  somId: string
  volume: number
  notificacoesAtivas: boolean
  ultimoBackupEm: string | null
  schemaVersion: number
}
