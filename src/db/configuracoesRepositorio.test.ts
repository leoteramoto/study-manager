import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, SCHEMA_VERSION } from './banco'
import {
  criarConfiguracoesPadrao,
  definirFuso,
  definirSom,
  garantirConfiguracoesPadrao,
  ID_CONFIGURACOES,
  obterConfiguracoes,
} from './configuracoesRepositorio'
import { popularDadosDeTeste } from './seedDesenvolvimento'

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

describe('definirFuso (RN37)', () => {
  beforeEach(async () => {
    await garantirConfiguracoesPadrao()
    await db.configuracoes.update(ID_CONFIGURACOES, { fusoHorario: 'America/Sao_Paulo' })
  })

  it('grava o fuso canônico e recusa fuso desconhecido', async () => {
    expect(await definirFuso('america/manaus')).toBe('America/Manaus')
    expect((await obterConfiguracoes())?.fusoHorario).toBe('America/Manaus')
    await expect(definirFuso('Lua/Cratera')).rejects.toThrow('Fuso horário desconhecido')
    expect((await obterConfiguracoes())?.fusoHorario).toBe('America/Manaus')
  })

  it('trocar o fuso não altera a data de nenhum registro', async () => {
    // Registro do cronômetro iniciado às 23:30 de Brasília: em Rio Branco seria 21:30,
    // em Noronha 00:30 do dia seguinte. A data gravada não muda em nenhum caso.
    await popularDadosDeTeste(new Date('2026-11-22T02:30:00.000Z'))
    const antes = await db.registros.toArray()
    for (const fuso of [
      'America/Noronha',
      'America/Rio_Branco',
      'Asia/Tokyo',
      'Pacific/Kiritimati',
    ]) {
      await definirFuso(fuso)
      expect(await db.registros.toArray()).toEqual(antes)
    }
  })
})

describe('definirSom (RN38)', () => {
  beforeEach(async () => {
    await garantirConfiguracoesPadrao()
  })

  it('grava só os campos informados', async () => {
    await definirSom({ somId: 'digital' })
    await definirSom({ volume: 0.35, somAtivo: false })
    expect(await obterConfiguracoes()).toMatchObject({
      somId: 'digital',
      volume: 0.35,
      somAtivo: false,
    })
  })

  it('recusa som desconhecido e volume fora de 0 a 1', async () => {
    await expect(definirSom({ somId: 'buzina' as 'sino' })).rejects.toThrow('Som desconhecido.')
    await expect(definirSom({ volume: 1.5 })).rejects.toThrow('Volume inválido.')
    expect((await obterConfiguracoes())?.volume).toBe(0.7)
  })
})
