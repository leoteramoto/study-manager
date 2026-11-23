import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './banco'
import { criarConfiguracoesPadrao } from './configuracoesRepositorio'
import { arquivarMateria, criarMateria } from './materiasRepositorio'
import { arquivarObjetivo, criarObjetivo } from './objetivosRepositorio'
import {
  editarManual,
  excluirRegistro,
  lancarManual,
  listarAnosComRegistros,
  listarRegistrosDoIntervalo,
} from './registrosRepositorio'
import type { Registro } from './tipos'

const ACRE = 'America/Rio_Branco'
// 03:30 UTC do dia 23 = 22:30 do dia 22 no Acre.
const AGORA = new Date('2026-11-23T03:30:00.000Z')

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.configuracoes.add(criarConfiguracoesPadrao(ACRE))
})

afterEach(() => {
  db.close()
})

async function criarCenario() {
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
  const mat = await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  const port = await criarMateria(cf.id, { nome: 'Português', descricao: '', cor: '#0891b2' })
  return { pf, cf, mat, port }
}

function registroCronometro(materiaId: string, objetivoId: string, data: string): Registro {
  return {
    id: crypto.randomUUID(),
    materiaId,
    objetivoId,
    data,
    inicio: `${data}T12:00:00.000Z`,
    fim: `${data}T13:00:00.000Z`,
    duracaoSeg: 3600,
    duracaoPlanejadaMin: 60,
    origem: 'cronometro',
    tipoEncerramento: 'concluido',
    excluidoEm: null,
    criadoEm: `${data}T13:00:00.000Z`,
    atualizadoEm: `${data}T13:00:00.000Z`,
  }
}

describe('lancarManual (RN30)', () => {
  it('grava a data do formulário como veio, com hoje no fuso configurado', async () => {
    const { mat, pf } = await criarCenario()
    const registro = await lancarManual(
      { data: '2026-11-22', minutos: 45, materiaId: mat.id },
      AGORA,
    )
    expect(await db.registros.get(registro.id)).toEqual({
      id: registro.id,
      materiaId: mat.id,
      objetivoId: pf.id,
      data: '2026-11-22',
      inicio: null,
      fim: null,
      duracaoSeg: 2700,
      duracaoPlanejadaMin: null,
      origem: 'manual',
      tipoEncerramento: 'manual',
      excluidoEm: null,
      criadoEm: AGORA.toISOString(),
      atualizadoEm: AGORA.toISOString(),
    })
  })

  it('rejeita data futura no fuso configurado, mesmo que já seja o dia em UTC', async () => {
    const { mat } = await criarCenario()
    await expect(
      lancarManual({ data: '2026-11-23', minutos: 45, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('A data não pode estar no futuro.')
    expect(await db.registros.count()).toBe(0)
  })

  it('rejeita tempo fora de 1 a 480 minutos', async () => {
    const { mat } = await criarCenario()
    await expect(
      lancarManual({ data: '2026-11-22', minutos: 481, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('no máximo 480')
  })

  it('aceita matéria fora do planejamento', async () => {
    const { port } = await criarCenario()
    await lancarManual({ data: '2026-11-01', minutos: 10, materiaId: port.id }, AGORA)
    expect(await db.registros.count()).toBe(1)
  })

  it('rejeita matéria arquivada ou de objetivo arquivado (RN04)', async () => {
    const { mat, port, cf } = await criarCenario()
    await arquivarMateria(mat.id)
    await expect(
      lancarManual({ data: '2026-11-22', minutos: 10, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('A matéria Matemática-PF está arquivada.')
    await arquivarObjetivo(cf.id)
    await expect(
      lancarManual({ data: '2026-11-22', minutos: 10, materiaId: port.id }, AGORA),
    ).rejects.toThrow('A matéria Português-CF está arquivada.')
  })

  it('rejeita matéria inexistente', async () => {
    await criarCenario()
    await expect(
      lancarManual({ data: '2026-11-22', minutos: 10, materiaId: 'nao-existe' }, AGORA),
    ).rejects.toThrow('Matéria não encontrada.')
  })
})

describe('editarManual (RN31)', () => {
  it('altera data, tempo e matéria, preserva criadoEm e recalcula o objetivo', async () => {
    const { mat, port, cf } = await criarCenario()
    const criado = await lancarManual(
      { data: '2026-11-20', minutos: 45, materiaId: mat.id },
      new Date('2026-11-21T12:00:00.000Z'),
    )
    const editado = await editarManual(
      criado.id,
      { data: '2026-11-22', minutos: 90, materiaId: port.id },
      AGORA,
    )
    expect(editado).toEqual({
      ...criado,
      materiaId: port.id,
      objetivoId: cf.id,
      data: '2026-11-22',
      duracaoSeg: 5400,
      atualizadoEm: AGORA.toISOString(),
    })
    expect(await db.registros.get(criado.id)).toEqual(editado)
  })

  it('aplica as mesmas validações do lançamento', async () => {
    const { mat } = await criarCenario()
    const criado = await lancarManual({ data: '2026-11-20', minutos: 45, materiaId: mat.id }, AGORA)
    await expect(
      editarManual(criado.id, { data: '2026-11-23', minutos: 45, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('A data não pode estar no futuro.')
    expect((await db.registros.get(criado.id))?.data).toBe('2026-11-20')
  })

  it('mantém a matéria atual arquivada, mas não troca para outra arquivada', async () => {
    const { mat, port } = await criarCenario()
    const criado = await lancarManual({ data: '2026-11-20', minutos: 45, materiaId: mat.id }, AGORA)
    await arquivarMateria(mat.id)
    const editado = await editarManual(
      criado.id,
      { data: '2026-11-21', minutos: 30, materiaId: mat.id },
      AGORA,
    )
    expect(editado).toMatchObject({ data: '2026-11-21', duracaoSeg: 1800, materiaId: mat.id })

    const outro = await lancarManual({ data: '2026-11-20', minutos: 5, materiaId: port.id }, AGORA)
    await expect(
      editarManual(outro.id, { data: '2026-11-20', minutos: 5, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('A matéria Matemática-PF está arquivada.')
  })

  it('não edita registro do cronômetro', async () => {
    const { mat, pf } = await criarCenario()
    const cron = registroCronometro(mat.id, pf.id, '2026-11-20')
    await db.registros.add(cron)
    await expect(
      editarManual(cron.id, { data: '2026-11-20', minutos: 5, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('Registros do cronômetro não podem ser editados')
    expect(await db.registros.get(cron.id)).toEqual(cron)
  })

  it('não edita registro excluído nem inexistente', async () => {
    const { mat } = await criarCenario()
    const criado = await lancarManual({ data: '2026-11-20', minutos: 45, materiaId: mat.id }, AGORA)
    await excluirRegistro(criado.id, AGORA)
    await expect(
      editarManual(criado.id, { data: '2026-11-20', minutos: 5, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('Este registro foi excluído ou não existe mais.')
    await expect(
      editarManual('nao-existe', { data: '2026-11-20', minutos: 5, materiaId: mat.id }, AGORA),
    ).rejects.toThrow('Este registro foi excluído ou não existe mais.')
  })
})

describe('excluirRegistro (RN31)', () => {
  it('é lógica: o registro continua no banco, mas sai das somas', async () => {
    const { mat, pf } = await criarCenario()
    const manual = await lancarManual({ data: '2026-11-20', minutos: 45, materiaId: mat.id }, AGORA)
    const cron = registroCronometro(mat.id, pf.id, '2026-11-21')
    await db.registros.add(cron)

    await excluirRegistro(manual.id, AGORA)
    await excluirRegistro(cron.id, AGORA)

    expect(await db.registros.count()).toBe(2)
    expect(await db.registros.get(cron.id)).toEqual({
      ...cron,
      excluidoEm: AGORA.toISOString(),
      atualizadoEm: AGORA.toISOString(),
    })
    const doMes = await listarRegistrosDoIntervalo('2026-11-01', '2026-11-30')
    expect(doMes.filter((r) => r.excluidoEm === null)).toEqual([])
  })

  it('não exclui de novo', async () => {
    const { mat } = await criarCenario()
    const manual = await lancarManual({ data: '2026-11-20', minutos: 45, materiaId: mat.id }, AGORA)
    await excluirRegistro(manual.id, AGORA)
    await expect(excluirRegistro(manual.id, new Date())).rejects.toThrow(
      'Este registro foi excluído ou não existe mais.',
    )
    expect((await db.registros.get(manual.id))?.excluidoEm).toBe(AGORA.toISOString())
  })
})

describe('listarAnosComRegistros (RN27)', () => {
  it('lista os anos com registros não excluídos', async () => {
    const { mat, pf } = await criarCenario()
    await db.registros.bulkAdd([
      registroCronometro(mat.id, pf.id, '2026-01-10'),
      registroCronometro(mat.id, pf.id, '2026-05-10'),
      registroCronometro(mat.id, pf.id, '2027-01-10'),
      { ...registroCronometro(mat.id, pf.id, '2024-03-01'), excluidoEm: AGORA.toISOString() },
    ])
    expect((await listarAnosComRegistros()).sort()).toEqual([2026, 2027])
  })

  it('sem registros, devolve lista vazia', async () => {
    expect(await listarAnosComRegistros()).toEqual([])
  })
})
