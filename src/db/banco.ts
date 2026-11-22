import Dexie, { type EntityTable } from 'dexie'
import type {
  Configuracoes,
  ItemPlanejamento,
  Materia,
  Objetivo,
  Registro,
  SessaoAtiva,
} from './tipos'

export const NOME_BANCO = 'study-manager'
export const SCHEMA_VERSION = 1

export type BancoStudyManager = Dexie & {
  objetivos: EntityTable<Objetivo, 'id'>
  materias: EntityTable<Materia, 'id'>
  planejamento: EntityTable<ItemPlanejamento, 'materiaId'>
  registros: EntityTable<Registro, 'id'>
  sessaoAtiva: EntityTable<SessaoAtiva, 'id'>
  configuracoes: EntityTable<Configuracoes, 'id'>
}

export const db = new Dexie(NOME_BANCO) as BancoStudyManager

// Versão 1 do schema. Novas versões devem ser adicionadas abaixo com
// db.version(n).stores(...).upgrade(...), sem alterar esta.
db.version(1).stores({
  objetivos: 'id, &sigla, ordem',
  materias: 'id, &codigo, objetivoId, [objetivoId+ordem]',
  planejamento: 'materiaId',
  registros: 'id, data, materiaId, [materiaId+data]',
  sessaoAtiva: 'id',
  configuracoes: 'id',
})
