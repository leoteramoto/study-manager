import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './banco'
import {
  arquivarMateria,
  criarMateria,
  desarquivarMateria,
  editarMateria,
  listarMateriasDisponiveis,
  moverMateria,
} from './materiasRepositorio'
import {
  arquivarObjetivo,
  criarObjetivo,
  desarquivarObjetivo,
  listarObjetivos,
  moverObjetivo,
  renomearObjetivo,
} from './objetivosRepositorio'
import type { Registro, SessaoAtiva } from './tipos'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  db.close()
})

const COR = '#4f46e5'

function materia(nome: string, extra: { descricao?: string; cor?: string } = {}) {
  return { nome, descricao: extra.descricao ?? '', cor: extra.cor ?? COR }
}

function sessaoCom(materiaId: string): SessaoAtiva {
  const agora = new Date().toISOString()
  return {
    id: 'atual',
    materiaId,
    duracaoPlanejadaMin: 60,
    inicioEm: agora,
    segmentoInicioEm: agora,
    acumuladoSeg: 0,
    ultimoHeartbeatEm: agora,
    estado: 'em_andamento',
    tipoEncerramento: null,
    fimEm: null,
    motivoPausaAutomatica: null,
    pausaDetectadaEm: null,
  }
}

async function adicionarAoPlano(materiaId: string) {
  await db.planejamento.add({ materiaId, peso: 1, adicionadoEm: new Date().toISOString() })
}

describe('objetivos (RF01)', () => {
  it('cria com sigla em maiúsculas e ordem no fim', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'pf' })
    const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
    expect(pf).toMatchObject({ sigla: 'PF', ordem: 1, ativo: true })
    expect(cf.ordem).toBe(2)
  })

  it('bloqueia uma segunda sigla "PF", mesmo com o primeiro arquivado', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    await expect(criarObjetivo({ nome: 'Outro', sigla: 'pf' })).rejects.toThrow(
      'Já existe um objetivo com a sigla PF.',
    )
    await arquivarObjetivo(pf.id)
    await expect(criarObjetivo({ nome: 'Outro', sigla: 'PF' })).rejects.toThrow(/sigla PF/)
    expect(await db.objetivos.count()).toBe(1)
  })

  it('rejeita dados inválidos com a mensagem do esquema', async () => {
    await expect(criarObjetivo({ nome: '', sigla: 'PF' })).rejects.toThrow('Informe o nome.')
    await expect(criarObjetivo({ nome: 'X', sigla: 'P F' })).rejects.toThrow(/apenas letras/)
  })

  it('renomear não altera a sigla nem os códigos das matérias', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const mat = await criarMateria(pf.id, materia('Matemática'))
    await renomearObjetivo(pf.id, '  PF 2026 ')
    expect(await db.objetivos.get(pf.id)).toMatchObject({ nome: 'PF 2026', sigla: 'PF' })
    expect((await db.materias.get(mat.id))?.codigo).toBe('Matemática-PF')
  })

  it('falha ao renomear objetivo inexistente', async () => {
    await expect(renomearObjetivo('x', 'Nome')).rejects.toThrow('Objetivo não encontrado.')
  })

  it('sobe e desce, ignorando arquivados ocultos', async () => {
    const a = await criarObjetivo({ nome: 'A', sigla: 'A' })
    const b = await criarObjetivo({ nome: 'B', sigla: 'B' })
    const c = await criarObjetivo({ nome: 'C', sigla: 'C' })
    await arquivarObjetivo(b.id)

    await moverObjetivo(c.id, 'subir', false)
    expect((await listarObjetivos()).map((o) => o.sigla)).toEqual(['C', 'B', 'A'])

    await moverObjetivo(a.id, 'subir', true)
    expect((await listarObjetivos()).map((o) => o.sigla)).toEqual(['C', 'A', 'B'])

    await moverObjetivo(b.id, 'descer', true)
    expect((await listarObjetivos()).map((o) => o.sigla)).toEqual(['C', 'A', 'B'])
  })

  it('arquivar arquiva as matérias e as tira do planejamento', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
    const m1 = await criarMateria(pf.id, materia('Matemática'))
    const m2 = await criarMateria(pf.id, materia('Português'))
    const m3 = await criarMateria(cf.id, materia('Contabilidade'))
    for (const m of [m1, m2, m3]) await adicionarAoPlano(m.id)

    await arquivarObjetivo(pf.id)

    expect((await db.objetivos.get(pf.id))?.ativo).toBe(false)
    expect((await db.materias.get(m1.id))?.ativo).toBe(false)
    expect((await db.materias.get(m2.id))?.ativo).toBe(false)
    expect((await db.planejamento.toArray()).map((p) => p.materiaId)).toEqual([m3.id])
  })

  it('o objetivo arquivado some da seleção do planejamento', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
    await criarMateria(pf.id, materia('Matemática'))
    await criarMateria(cf.id, materia('Matemática'))
    await arquivarObjetivo(pf.id)
    expect((await listarMateriasDisponiveis()).map((m) => m.codigo)).toEqual(['Matemática-CF'])
  })

  it('não arquiva com uma matéria na sessão ativa', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const mat = await criarMateria(pf.id, materia('Matemática'))
    await db.sessaoAtiva.put(sessaoCom(mat.id))
    await expect(arquivarObjetivo(pf.id)).rejects.toThrow(/sessão ativa/)
    expect((await db.objetivos.get(pf.id))?.ativo).toBe(true)
    expect((await db.materias.get(mat.id))?.ativo).toBe(true)
  })

  it('desarquivar devolve objetivo e matérias, sem voltar ao planejamento', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const mat = await criarMateria(pf.id, materia('Matemática'))
    await adicionarAoPlano(mat.id)
    await arquivarObjetivo(pf.id)
    await desarquivarObjetivo(pf.id)
    expect((await db.objetivos.get(pf.id))?.ativo).toBe(true)
    expect((await db.materias.get(mat.id))?.ativo).toBe(true)
    expect(await db.planejamento.count()).toBe(0)
  })
})

describe('matérias (RF02)', () => {
  it('"Matemática" em PF gera Matemática-PF, com ordem dentro do objetivo', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
    const m1 = await criarMateria(pf.id, materia(' Matemática ', { descricao: '  ' }))
    const m2 = await criarMateria(cf.id, materia('Matemática'))
    const m3 = await criarMateria(pf.id, materia('Português'))
    expect(m1).toMatchObject({ codigo: 'Matemática-PF', nome: 'Matemática', descricao: null })
    expect(m2).toMatchObject({ codigo: 'Matemática-CF', ordem: 1 })
    expect(m3.ordem).toBe(2)
  })

  it('bloqueia código duplicado sem diferenciar maiúsculas', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    await criarMateria(pf.id, materia('Matemática'))
    await expect(criarMateria(pf.id, materia('MATEMÁTICA'))).rejects.toThrow(
      'Já existe uma matéria com o código MATEMÁTICA-PF.',
    )
  })

  it('não cria em objetivo arquivado ou inexistente', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    await arquivarObjetivo(pf.id)
    await expect(criarMateria(pf.id, materia('Matemática'))).rejects.toThrow(/arquivado/)
    await expect(criarMateria('x', materia('Matemática'))).rejects.toThrow(/não encontrado/)
  })

  it('renomear recalcula o código e o histórico passa a mostrar o novo', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const mat = await criarMateria(pf.id, materia('Matemática'))
    const registro: Registro = {
      id: 'r1',
      materiaId: mat.id,
      objetivoId: pf.id,
      data: '2026-11-01',
      inicio: null,
      fim: null,
      duracaoSeg: 3600,
      duracaoPlanejadaMin: null,
      origem: 'manual',
      tipoEncerramento: 'manual',
      excluidoEm: null,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    }
    await db.registros.add(registro)

    await editarMateria(
      mat.id,
      materia('Matemática Básica', { descricao: 'Edital', cor: '#DC2626' }),
    )

    const salvo = await db.registros.get('r1')
    const resolvida = await db.materias.get(salvo?.materiaId ?? '')
    expect(resolvida).toMatchObject({
      codigo: 'Matemática Básica-PF',
      descricao: 'Edital',
      cor: '#dc2626',
      objetivoId: pf.id,
    })
  })

  it('renomear para um código existente é bloqueado', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    await criarMateria(pf.id, materia('Matemática'))
    const port = await criarMateria(pf.id, materia('Português'))
    await expect(editarMateria(port.id, materia('matemática'))).rejects.toThrow(/código/)
    expect((await db.materias.get(port.id))?.codigo).toBe('Português-PF')
  })

  it('pode mudar só a caixa do próprio nome', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const mat = await criarMateria(pf.id, materia('matemática'))
    await editarMateria(mat.id, materia('Matemática'))
    expect((await db.materias.get(mat.id))?.codigo).toBe('Matemática-PF')
  })

  it('falha ao editar matéria inexistente', async () => {
    await expect(editarMateria('x', materia('A'))).rejects.toThrow('Matéria não encontrada.')
  })

  it('reordena dentro do objetivo', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const a = await criarMateria(pf.id, materia('A'))
    const b = await criarMateria(pf.id, materia('B'))
    const c = await criarMateria(pf.id, materia('C'))
    await arquivarMateria(b.id)
    await moverMateria(c.id, 'subir', false)
    expect((await listarMateriasDisponiveis()).map((m) => m.nome)).toEqual(['C', 'A'])
    await moverMateria(a.id, 'descer', true)
    const ordens = (await db.materias.toArray()).sort((x, y) => x.ordem - y.ordem)
    expect(ordens.map((m) => m.nome)).toEqual(['C', 'B', 'A'])
  })

  it('arquivar tira do planejamento e bloqueia com sessão ativa', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const mat = await criarMateria(pf.id, materia('Matemática'))
    const outra = await criarMateria(pf.id, materia('Português'))
    await adicionarAoPlano(mat.id)
    await adicionarAoPlano(outra.id)

    await db.sessaoAtiva.put(sessaoCom(outra.id))
    await expect(arquivarMateria(outra.id)).rejects.toThrow(/sessão ativa/)

    await arquivarMateria(mat.id)
    expect((await db.materias.get(mat.id))?.ativo).toBe(false)
    expect((await db.planejamento.toArray()).map((p) => p.materiaId)).toEqual([outra.id])
    expect((await listarMateriasDisponiveis()).map((m) => m.id)).toEqual([outra.id])
  })

  it('desarquivar é bloqueado com o objetivo arquivado', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const mat = await criarMateria(pf.id, materia('Matemática'))
    await arquivarObjetivo(pf.id)
    await expect(desarquivarMateria(mat.id)).rejects.toThrow('Desarquive o objetivo primeiro.')

    await desarquivarObjetivo(pf.id)
    await arquivarMateria(mat.id)
    await desarquivarMateria(mat.id)
    expect((await db.materias.get(mat.id))?.ativo).toBe(true)
    expect(await db.planejamento.count()).toBe(0)
  })
})
