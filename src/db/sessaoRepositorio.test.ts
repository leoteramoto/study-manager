import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarBanco, db } from './banco'
import { garantirConfiguracoesPadrao } from './configuracoesRepositorio'
import { arquivarMateria, criarMateria } from './materiasRepositorio'
import { criarObjetivo } from './objetivosRepositorio'
import { definirPlanejamento } from './planejamentoRepositorio'
import { aplicarEvento, confirmarSessao, iniciarSessao, obterSessao } from './sessaoRepositorio'
import type { Materia } from './tipos'

const T0 = Date.parse('2026-11-22T13:00:00.000Z')
const MIN = 60_000

function em(ms: number): Date {
  return new Date(T0 + ms)
}

let materia: Materia

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  materia = await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  await definirPlanejamento([materia.id])
})

afterEach(() => {
  db.close()
})

/** Sessão de 60 min encerrada aos 23 min, aguardando confirmação. */
async function sessaoAguardando() {
  await iniciarSessao(materia.id, 60, em(0))
  for (let t = 20_000; t < 23 * MIN; t += 20_000) await aplicarEvento({ tipo: 'heartbeat' }, em(t))
  await aplicarEvento({ tipo: 'encerrar' }, em(23 * MIN))
}

describe('iniciarSessao', () => {
  it('cria a sessão em andamento', async () => {
    await iniciarSessao(materia.id, 60, em(0))
    expect(await obterSessao()).toMatchObject({ materiaId: materia.id, estado: 'em_andamento' })
  })

  it('valida a duração', async () => {
    await expect(iniciarSessao(materia.id, 0)).rejects.toThrow('no mínimo 1 minuto')
    await expect(iniciarSessao(materia.id, 481)).rejects.toThrow('no máximo 480')
    await expect(iniciarSessao(materia.id, 2.5)).rejects.toThrow('número inteiro')
  })

  it('exige matéria do planejamento', async () => {
    await definirPlanejamento([])
    await expect(iniciarSessao(materia.id, 30)).rejects.toThrow('não está no planejamento')
  })

  it('não aceita matéria arquivada nem inexistente', async () => {
    await arquivarMateria(materia.id)
    await expect(iniciarSessao(materia.id, 30)).rejects.toThrow('está arquivada')
    await expect(iniciarSessao('nao-existe', 30)).rejects.toThrow('não encontrada')
  })

  it('não permite duas sessões (RN16)', async () => {
    await iniciarSessao(materia.id, 60)
    await expect(iniciarSessao(materia.id, 30)).rejects.toThrow('Já existe uma sessão')
  })

  it('bloqueia arquivar a matéria da sessão (RN04)', async () => {
    await iniciarSessao(materia.id, 60)
    await expect(arquivarMateria(materia.id)).rejects.toThrow('sessão ativa')
  })
})

describe('aplicarEvento', () => {
  it('grava cada mudança de estado na hora', async () => {
    await iniciarSessao(materia.id, 60, em(0))
    await aplicarEvento({ tipo: 'pausar' }, em(10_000))
    expect(await obterSessao()).toMatchObject({ estado: 'pausado', acumuladoSeg: 10 })
  })

  it('evento que não se aplica não grava', async () => {
    await iniciarSessao(materia.id, 60, em(0))
    const antes = await obterSessao()
    const r = await aplicarEvento({ tipo: 'continuar' }, em(1000))
    expect(r.alterada).toBe(false)
    expect(await obterSessao()).toEqual(antes)
  })

  it('descartar apaga a sessão e não grava registro', async () => {
    await sessaoAguardando()
    await aplicarEvento({ tipo: 'descartar' })
    expect(await obterSessao()).toBeNull()
    expect(await db.registros.count()).toBe(0)
  })
})

describe('confirmarSessao', () => {
  it('grava o registro e apaga a sessão', async () => {
    await sessaoAguardando()
    expect(await confirmarSessao(em(24 * MIN))).toBe('confirmada')
    expect(await obterSessao()).toBeNull()
    const registros = await db.registros.toArray()
    expect(registros).toHaveLength(1)
    expect(registros[0]).toMatchObject({
      materiaId: materia.id,
      objetivoId: materia.objetivoId,
      data: '2026-11-22',
      duracaoSeg: 23 * 60,
      origem: 'cronometro',
      tipoEncerramento: 'antecipado',
      excluidoEm: null,
    })
  })

  it('clique duplo grava exatamente 1 registro', async () => {
    await sessaoAguardando()
    const resultados = await Promise.all([confirmarSessao(), confirmarSessao()])
    expect(resultados.sort()).toEqual(['confirmada', 'ja_confirmada'])
    expect(await db.registros.count()).toBe(1)
  })

  it('duas abas confirmando ao mesmo tempo gravam exatamente 1 registro', async () => {
    await sessaoAguardando()
    const outraAba = criarBanco()
    await outraAba.open()
    try {
      const resultados = await Promise.all([
        confirmarSessao(new Date(), outraAba),
        confirmarSessao(new Date(), db),
        confirmarSessao(new Date(), outraAba),
      ])
      expect(resultados.filter((r) => r === 'confirmada')).toHaveLength(1)
      expect(await db.registros.count()).toBe(1)
    } finally {
      outraAba.close()
    }
  })

  it('confirmar depois de descartar não grava nada', async () => {
    await sessaoAguardando()
    await aplicarEvento({ tipo: 'descartar' })
    expect(await confirmarSessao()).toBe('ja_confirmada')
    expect(await db.registros.count()).toBe(0)
  })

  it('sessão em andamento não é confirmada', async () => {
    await iniciarSessao(materia.id, 60)
    expect(await confirmarSessao()).toBe('ja_confirmada')
    expect(await db.registros.count()).toBe(0)
  })

  it('menos de 60 s não é gravado', async () => {
    await iniciarSessao(materia.id, 60, em(0))
    // Heartbeat recente: sem ele, encerrar aos 59 s seria tratado como suspensão.
    await aplicarEvento({ tipo: 'heartbeat' }, em(55_000))
    await aplicarEvento({ tipo: 'encerrar' }, em(59_000))
    await expect(confirmarSessao()).rejects.toThrow('menos de 1 minuto')
    expect(await db.registros.count()).toBe(0)
    expect(await obterSessao()).not.toBeNull()
  })
})
