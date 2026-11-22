import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './banco'
import { garantirConfiguracoesPadrao, obterConfiguracoes } from './configuracoesRepositorio'
import { criarObjetivo } from './objetivosRepositorio'
import { popularDadosDeTeste } from './seedDesenvolvimento'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
})

afterEach(() => {
  db.close()
})

describe('popularDadosDeTeste', () => {
  it('cria o cenário de teste com o banco vazio', async () => {
    await popularDadosDeTeste(new Date('2026-01-15T15:00:00Z'))
    expect(await db.objetivos.count()).toBe(2)
    expect(await db.materias.count()).toBe(4)
    expect(await db.planejamento.count()).toBe(3)
    expect((await obterConfiguracoes())?.metaMensalHoras).toBe(100)
    const datas = (await db.registros.toArray()).map((r) => r.data)
    expect(datas).toContain('2025-12-01')
    expect(datas).toContain('2026-01-15')
    expect(await db.registros.filter((r) => r.excluidoEm !== null).count()).toBe(1)
  })

  it('recusa rodar com dados existentes e não apaga nada', async () => {
    await criarObjetivo({ nome: 'Meu objetivo', sigla: 'MEU' })
    await expect(popularDadosDeTeste()).rejects.toThrow('banco vazio')
    expect((await db.objetivos.toArray()).map((o) => o.sigla)).toEqual(['MEU'])
  })
})
