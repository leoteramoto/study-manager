import { describe, expect, it } from 'vitest'
import {
  aplicarEdicaoManual,
  criarEsquemaLancamento,
  excluirLogicamente,
  materiaAceitaNoLancamento,
  minutosDoLancamento,
  montarLancamentoManual,
  podeEditar,
  podeExcluir,
} from './lancamentos'
import { dataNoFuso } from './tempo'

const ACRE = 'America/Rio_Branco'

function validar(hoje: string, dados: Record<string, unknown>) {
  return criarEsquemaLancamento(hoje).safeParse({
    data: '2026-11-22',
    minutos: 30,
    materiaId: 'm1',
    ...dados,
  })
}

function mensagem(resultado: ReturnType<typeof validar>): string | undefined {
  return resultado.success ? undefined : resultado.error.issues[0]?.message
}

describe('esquema do lançamento manual (RN30)', () => {
  it('aceita data de hoje e do passado, sem limite inferior', () => {
    expect(validar('2026-11-22', { data: '2026-11-22' }).success).toBe(true)
    expect(validar('2026-11-22', { data: '1990-01-01' }).success).toBe(true)
  })

  it('rejeita data futura', () => {
    expect(mensagem(validar('2026-11-22', { data: '2026-11-23' }))).toBe(
      'A data não pode estar no futuro.',
    )
  })

  it('rejeita data vazia, mal formada ou inexistente', () => {
    expect(mensagem(validar('2026-11-22', { data: '' }))).toBe('Informe a data.')
    expect(mensagem(validar('2026-11-22', { data: '22/11/2026' }))).toBe('Informe uma data válida.')
    expect(mensagem(validar('2026-11-22', { data: '2026-02-30' }))).toBe('Informe uma data válida.')
    expect(mensagem(validar('2026-11-22', { data: undefined }))).toBe('Informe a data.')
  })

  it('aceita de 1 a 480 minutos inteiros', () => {
    expect(validar('2026-11-22', { minutos: 1 }).success).toBe(true)
    expect(validar('2026-11-22', { minutos: 480 }).success).toBe(true)
    expect(mensagem(validar('2026-11-22', { minutos: 0 }))).toBe(
      'O tempo deve ser de no mínimo 1 minuto.',
    )
    expect(mensagem(validar('2026-11-22', { minutos: 481 }))).toBe(
      'O tempo deve ser de no máximo 480 minutos.',
    )
    expect(mensagem(validar('2026-11-22', { minutos: 1.5 }))).toBe(
      'O tempo deve ser um número inteiro de minutos.',
    )
    expect(mensagem(validar('2026-11-22', { minutos: Number.NaN }))).toBe(
      'Informe o tempo em minutos.',
    )
  })

  it('exige a matéria', () => {
    expect(mensagem(validar('2026-11-22', { materiaId: '' }))).toBe('Escolha a matéria.')
  })

  describe('no fuso do Acre (UTC−5)', () => {
    // 03:30 UTC do dia 23 ainda é 22:30 do dia 22 no Acre.
    const agora = new Date('2026-11-23T03:30:00.000Z')
    const hoje = dataNoFuso(agora, ACRE)

    it('"hoje" é o dia no fuso configurado, não em UTC', () => {
      expect(hoje).toBe('2026-11-22')
      expect(validar(hoje, { data: '2026-11-22' }).success).toBe(true)
      expect(mensagem(validar(hoje, { data: '2026-11-23' }))).toBe(
        'A data não pode estar no futuro.',
      )
    })

    it('a data é gravada exatamente como veio do formulário', () => {
      const dados = criarEsquemaLancamento(hoje).parse({
        data: '2026-11-22',
        minutos: 45,
        materiaId: 'm1',
      })
      const registro = montarLancamentoManual(dados, { id: 'r1', objetivoId: 'o1', agora })
      expect(registro.data).toBe('2026-11-22')
      // O que aconteceria com new Date(): meia-noite UTC vira o dia anterior no Acre.
      expect(dataNoFuso(new Date('2026-11-22'), ACRE)).toBe('2026-11-21')
    })
  })
})

describe('montarLancamentoManual', () => {
  it('grava sem início, fim e duração planejada, com origem e tipo manual', () => {
    const agora = new Date('2026-11-22T15:00:00.000Z')
    const registro = montarLancamentoManual(
      { data: '2026-11-20', minutos: 90, materiaId: 'm1' },
      { id: 'r1', objetivoId: 'o1', agora },
    )
    expect(registro).toEqual({
      id: 'r1',
      materiaId: 'm1',
      objetivoId: 'o1',
      data: '2026-11-20',
      inicio: null,
      fim: null,
      duracaoSeg: 5400,
      duracaoPlanejadaMin: null,
      origem: 'manual',
      tipoEncerramento: 'manual',
      excluidoEm: null,
      criadoEm: agora.toISOString(),
      atualizadoEm: agora.toISOString(),
    })
  })
})

describe('aplicarEdicaoManual (RN31)', () => {
  const criado = montarLancamentoManual(
    { data: '2026-11-20', minutos: 90, materiaId: 'm1' },
    { id: 'r1', objetivoId: 'o1', agora: new Date('2026-11-20T10:00:00.000Z') },
  )

  it('preserva id e criadoEm, atualiza atualizadoEm e recalcula o objetivo', () => {
    const agora = new Date('2026-11-22T15:00:00.000Z')
    const editado = aplicarEdicaoManual(
      criado,
      { data: '2026-11-21', minutos: 30, materiaId: 'm2' },
      { objetivoId: 'o2', agora },
    )
    expect(editado).toEqual({
      ...criado,
      materiaId: 'm2',
      objetivoId: 'o2',
      data: '2026-11-21',
      duracaoSeg: 1800,
      atualizadoEm: agora.toISOString(),
    })
    expect(editado.criadoEm).toBe('2026-11-20T10:00:00.000Z')
  })
})

describe('podeEditar e podeExcluir (RN31)', () => {
  it('só lançamentos manuais não excluídos podem ser editados', () => {
    expect(podeEditar({ origem: 'manual', excluidoEm: null })).toBe(true)
    expect(podeEditar({ origem: 'cronometro', excluidoEm: null })).toBe(false)
    expect(podeEditar({ origem: 'manual', excluidoEm: 'x' })).toBe(false)
  })

  it('qualquer registro não excluído pode ser excluído, inclusive do cronômetro', () => {
    expect(podeExcluir({ origem: 'cronometro', excluidoEm: null })).toBe(true)
    expect(podeExcluir({ origem: 'manual', excluidoEm: null })).toBe(true)
    expect(podeExcluir({ origem: 'manual', excluidoEm: 'x' })).toBe(false)
  })
})

describe('excluirLogicamente', () => {
  it('marca excluidoEm e atualizadoEm sem mudar o resto', () => {
    const agora = new Date('2026-11-22T15:00:00.000Z')
    const registro = { id: 'r1', duracaoSeg: 60, excluidoEm: null, atualizadoEm: 'antes' }
    expect(excluirLogicamente(registro, agora)).toEqual({
      id: 'r1',
      duracaoSeg: 60,
      excluidoEm: agora.toISOString(),
      atualizadoEm: agora.toISOString(),
    })
  })
})

describe('materiaAceitaNoLancamento (RN04, RN30)', () => {
  const ativa = { id: 'm1', ativo: true }
  const arquivada = { id: 'm1', ativo: false }

  it('aceita matéria ativa de objetivo ativo', () => {
    expect(materiaAceitaNoLancamento(ativa, true)).toBe(true)
  })

  it('rejeita matéria arquivada ou de objetivo arquivado', () => {
    expect(materiaAceitaNoLancamento(arquivada, true)).toBe(false)
    expect(materiaAceitaNoLancamento(ativa, false)).toBe(false)
  })

  it('na edição, aceita a matéria atual do registro mesmo arquivada', () => {
    expect(materiaAceitaNoLancamento(arquivada, false, 'm1')).toBe(true)
    expect(materiaAceitaNoLancamento(arquivada, true, 'outra')).toBe(false)
  })
})

describe('minutosDoLancamento', () => {
  it('converte a duração gravada de volta para minutos', () => {
    expect(minutosDoLancamento(5400)).toBe(90)
  })
})
