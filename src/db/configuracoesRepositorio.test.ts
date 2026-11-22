import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, SCHEMA_VERSION } from './banco'
import {
  criarConfiguracoesPadrao,
  garantirConfiguracoesPadrao,
  ID_CONFIGURACOES,
  obterConfiguracoes,
} from './configuracoesRepositorio'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  db.close()
})

describe('schema v1', () => {
  it('cria todas as tabelas da especificação', () => {
    expect(db.verno).toBe(1)
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'configuracoes',
      'materias',
      'objetivos',
      'planejamento',
      'registros',
      'sessaoAtiva',
    ])
  })

  it('declara os índices únicos de sigla e código', () => {
    expect(db.objetivos.schema.idxByName.sigla?.unique).toBe(true)
    expect(db.materias.schema.idxByName.codigo?.unique).toBe(true)
    expect(db.materias.schema.idxByName['[objetivoId+ordem]']).toBeDefined()
    expect(db.registros.schema.idxByName['[materiaId+data]']).toBeDefined()
  })
})

describe('configurações padrão', () => {
  it('cria a linha "app" com os valores padrão na primeira execução', async () => {
    expect(await garantirConfiguracoesPadrao()).toBe(true)
    const config = await obterConfiguracoes()
    expect(config).toEqual({
      id: ID_CONFIGURACOES,
      metaMensalHoras: null,
      fusoHorario: expect.any(String) as string,
      somAtivo: true,
      somId: 'sino',
      volume: 0.7,
      notificacoesAtivas: false,
      ultimoBackupEm: null,
      schemaVersion: SCHEMA_VERSION,
    })
  })

  it('não sobrescreve configurações existentes', async () => {
    await db.configuracoes.add({ ...criarConfiguracoesPadrao('America/Manaus'), volume: 0.2 })
    expect(await garantirConfiguracoesPadrao()).toBe(false)
    const config = await obterConfiguracoes()
    expect(config?.volume).toBe(0.2)
    expect(config?.fusoHorario).toBe('America/Manaus')
    expect(await db.configuracoes.count()).toBe(1)
  })
})
