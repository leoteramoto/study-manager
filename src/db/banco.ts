import Dexie, { type EntityTable } from 'dexie'
import { VERSAO_SCHEMA } from '@/domain/backup'
import type {
  Configuracoes,
  ItemPlanejamento,
  Materia,
  Objetivo,
  Registro,
  SessaoAtiva,
} from './tipos'

export const NOME_BANCO = 'study-manager'
/** Versão do formato dos dados, a mesma do arquivo de backup (RN32). */
export const SCHEMA_VERSION = VERSAO_SCHEMA

export type BancoStudyManager = Dexie & {
  objetivos: EntityTable<Objetivo, 'id'>
  materias: EntityTable<Materia, 'id'>
  planejamento: EntityTable<ItemPlanejamento, 'materiaId'>
  registros: EntityTable<Registro, 'id'>
  sessaoAtiva: EntityTable<SessaoAtiva, 'id'>
  configuracoes: EntityTable<Configuracoes, 'id'>
}

/**
 * Cria uma conexão com o banco. O app usa uma só (`db`); os testes abrem uma
 * segunda para simular outra aba.
 */
export function criarBanco(nome = NOME_BANCO): BancoStudyManager {
  const banco = new Dexie(nome) as BancoStudyManager
  // Versão 1 do schema. Novas versões devem ser adicionadas abaixo com
  // banco.version(n).stores(...).upgrade(...), sem alterar esta.
  banco.version(1).stores({
    objetivos: 'id, &sigla, ordem',
    materias: 'id, &codigo, objetivoId, [objetivoId+ordem]',
    planejamento: 'materiaId',
    registros: 'id, data, materiaId, [materiaId+data]',
    sessaoAtiva: 'id',
    configuracoes: 'id',
  })
  return banco
}

export const db = criarBanco()
