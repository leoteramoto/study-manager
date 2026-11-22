import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './banco'
import {
  definirMetaMensal,
  garantirConfiguracoesPadrao,
  obterConfiguracoes,
} from './configuracoesRepositorio'
import { arquivarMateria, criarMateria } from './materiasRepositorio'
import { arquivarObjetivo, criarObjetivo } from './objetivosRepositorio'
import {
  alterarPeso,
  definirPlanejamento,
  listarPlanejamento,
  removerDoPlanejamento,
} from './planejamentoRepositorio'
import { listarRegistrosDoIntervalo } from './registrosRepositorio'
import type { Registro } from './tipos'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  db.close()
})

async function criarCenario() {
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
  const mat = await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  const dir = await criarMateria(pf.id, { nome: 'Direito', descricao: '', cor: '#2563eb' })
  const port = await criarMateria(cf.id, { nome: 'Português', descricao: '', cor: '#0891b2' })
  return { pf, cf, mat, dir, port }
}

function registro(materiaId: string, objetivoId: string, data: string): Registro {
  const agora = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    materiaId,
    objetivoId,
    data,
    inicio: null,
    fim: null,
    duracaoSeg: 600,
    duracaoPlanejadaMin: null,
    origem: 'manual',
    tipoEncerramento: 'manual',
    excluidoEm: null,
    criadoEm: agora,
    atualizadoEm: agora,
  }
}

describe('planejamento (RF03)', () => {
  it('adiciona matérias de objetivos diferentes com peso 1', async () => {
    const { mat, port } = await criarCenario()
    await definirPlanejamento([mat.id, port.id])
    const plano = await listarPlanejamento()
    expect(plano.map((i) => i.materiaId).sort()).toEqual([mat.id, port.id].sort())
    expect(plano.every((i) => i.peso === 1)).toBe(true)
  })

  it('mantém o peso das que continuam e remove as desmarcadas', async () => {
    const { mat, dir, port } = await criarCenario()
    await definirPlanejamento([mat.id, dir.id])
    await alterarPeso(mat.id, 2)
    await definirPlanejamento([mat.id, port.id])
    const plano = await listarPlanejamento()
    expect(plano.find((i) => i.materiaId === mat.id)?.peso).toBe(2)
    expect(plano.find((i) => i.materiaId === dir.id)).toBeUndefined()
    expect(plano.find((i) => i.materiaId === port.id)?.peso).toBe(1)
  })

  it('remover do planejamento não apaga registros (RN06)', async () => {
    const { pf, mat } = await criarCenario()
    await db.registros.add(registro(mat.id, pf.id, '2026-11-10'))
    await definirPlanejamento([mat.id])
    await removerDoPlanejamento(mat.id)
    expect(await listarPlanejamento()).toEqual([])
    expect(await db.registros.count()).toBe(1)
  })

  it('não aceita matéria arquivada nem de objetivo arquivado (RN04)', async () => {
    const { cf, mat, port } = await criarCenario()
    await arquivarMateria(mat.id)
    await expect(definirPlanejamento([mat.id])).rejects.toThrow(
      'A matéria Matemática-PF está arquivada e não pode entrar no planejamento.',
    )
    await arquivarObjetivo(cf.id)
    await expect(definirPlanejamento([port.id])).rejects.toThrow('arquivada')
    expect(await listarPlanejamento()).toEqual([])
  })

  it('rejeita matéria inexistente sem alterar o plano', async () => {
    const { mat } = await criarCenario()
    await definirPlanejamento([mat.id])
    await expect(definirPlanejamento(['nao-existe'])).rejects.toThrow('Matéria não encontrada.')
    expect((await listarPlanejamento()).map((i) => i.materiaId)).toEqual([mat.id])
  })
})

describe('peso (RN07)', () => {
  it('arredonda para 0,1 e devolve o valor gravado', async () => {
    const { mat } = await criarCenario()
    await definirPlanejamento([mat.id])
    expect(await alterarPeso(mat.id, 1.25)).toBe(1.3)
    expect((await db.planejamento.get(mat.id))?.peso).toBe(1.3)
  })

  it('rejeita zero, negativo e acima de 100 sem gravar', async () => {
    const { mat } = await criarCenario()
    await definirPlanejamento([mat.id])
    await alterarPeso(mat.id, 3)
    for (const peso of [0, -1, 101]) {
      await expect(alterarPeso(mat.id, peso)).rejects.toThrow('O peso deve ser')
    }
    expect((await db.planejamento.get(mat.id))?.peso).toBe(3)
  })

  it('aceita gravar o mesmo peso e falha se a matéria saiu do plano', async () => {
    const { mat } = await criarCenario()
    await definirPlanejamento([mat.id])
    expect(await alterarPeso(mat.id, 1)).toBe(1)
    await removerDoPlanejamento(mat.id)
    await expect(alterarPeso(mat.id, 2)).rejects.toThrow('não está mais no planejamento')
  })
})

describe('meta mensal (RN08)', () => {
  it('grava valores válidos e rejeita os inválidos', async () => {
    await garantirConfiguracoesPadrao()
    await definirMetaMensal(80.5)
    expect((await obterConfiguracoes())?.metaMensalHoras).toBe(80.5)
    await expect(definirMetaMensal(0.4)).rejects.toThrow('no mínimo 0,5')
    await expect(definirMetaMensal(745)).rejects.toThrow('no máximo 744')
    expect((await obterConfiguracoes())?.metaMensalHoras).toBe(80.5)
  })
})

describe('registros por intervalo', () => {
  it('busca pelo índice de data, com os limites inclusivos', async () => {
    const { pf, mat } = await criarCenario()
    await db.registros.bulkAdd([
      registro(mat.id, pf.id, '2026-10-31'),
      registro(mat.id, pf.id, '2026-11-01'),
      registro(mat.id, pf.id, '2026-11-30'),
      registro(mat.id, pf.id, '2026-12-01'),
    ])
    const datas = (await listarRegistrosDoIntervalo('2026-11-01', '2026-11-30')).map((r) => r.data)
    expect(datas.sort()).toEqual(['2026-11-01', '2026-11-30'])
  })
})
