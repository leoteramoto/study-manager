import { describe, expect, it } from 'vitest'
import { calcularPainel, montarLinhasPlanejamento, somarSegundosPorMateria } from './calculos'
import {
  anosDisponiveis,
  MATERIA_DESCONHECIDA,
  montarHistorico,
  montarRanking,
  totaisPorMes,
  totalDoPeriodo,
  type RegistroParaHistorico,
} from './estatisticas'
import { intervaloDoAno, intervaloDoMes } from './tempo'

const H = 3600

let contador = 0
function registro(dados: Partial<RegistroParaHistorico> & { data: string }): RegistroParaHistorico {
  contador += 1
  return {
    id: `r${String(contador).padStart(3, '0')}`,
    materiaId: 'mat-pf',
    duracaoSeg: H,
    excluidoEm: null,
    inicio: null,
    origem: 'manual',
    criadoEm: '2026-01-01T00:00:00.000Z',
    ...dados,
  }
}

const materias = [
  { id: 'mat-pf', codigo: 'Matemática-PF', cor: '#ff0000' },
  { id: 'mat-cf', codigo: 'Matemática-CF', cor: '#00ff00' },
  { id: 'port-pf', codigo: 'Português-PF', cor: '#0000ff' },
]

describe('anosDisponiveis (RN27)', () => {
  it('lista os anos com registros e o ano atual, do mais recente ao mais antigo', () => {
    const anos = anosDisponiveis(
      [registro({ data: '2026-01-10' }), registro({ data: '2027-01-10' })],
      2025,
    )
    expect(anos).toEqual([2027, 2026, 2025])
  })

  it('sem registros, mostra só o ano atual', () => {
    expect(anosDisponiveis([], 2026)).toEqual([2026])
  })

  it('não conta anos que só têm registros excluídos', () => {
    const anos = anosDisponiveis([registro({ data: '2024-05-01', excluidoEm: 'x' })], 2026)
    expect(anos).toEqual([2026])
  })

  it('mantém o ano selecionado mesmo sem registros', () => {
    const anos = anosDisponiveis([registro({ data: '2024-05-01', excluidoEm: 'x' })], 2026, 2024)
    expect(anos).toEqual([2026, 2024])
  })

  it('não repete anos', () => {
    const anos = anosDisponiveis(
      [registro({ data: '2026-01-10' }), registro({ data: '2026-12-31' })],
      2026,
      2026,
    )
    expect(anos).toEqual([2026])
  })
})

describe('totaisPorMes (RN29)', () => {
  it('devolve os 12 meses, inclusive os zerados, sem excluídos e sem outros anos', () => {
    const totais = totaisPorMes(
      [
        registro({ data: '2026-01-31', duracaoSeg: 100 }),
        registro({ data: '2026-02-01', duracaoSeg: 200 }),
        registro({ data: '2026-02-28', duracaoSeg: 300 }),
        registro({ data: '2026-12-31', duracaoSeg: 400 }),
        registro({ data: '2026-12-15', duracaoSeg: 999, excluidoEm: 'x' }),
        registro({ data: '2027-01-01', duracaoSeg: 999 }),
        registro({ data: '2025-12-31', duracaoSeg: 999 }),
      ],
      2026,
    )
    expect(totais).toHaveLength(12)
    expect(totais.map((t) => t.totalSeg)).toEqual([100, 500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400])
    expect(totais[0]?.mes).toBe(1)
    expect(totais[11]?.mes).toBe(12)
  })

  it('a soma dos meses é o total do ano', () => {
    const registros = [
      registro({ data: '2026-03-10', duracaoSeg: 61 }),
      registro({ data: '2026-07-10', duracaoSeg: 59 }),
    ]
    const soma = totaisPorMes(registros, 2026).reduce((s, t) => s + t.totalSeg, 0)
    expect(soma).toBe(totalDoPeriodo(registros, intervaloDoAno(2026)))
  })
})

describe('montarRanking (RN28, RN29)', () => {
  const janeiro = intervaloDoMes({ ano: 2026, mes: 1 })

  it('separa Matemática-PF de Matemática-CF e ordena do maior para o menor (RF07)', () => {
    const ranking = montarRanking(
      [
        registro({ data: '2026-01-05', materiaId: 'mat-pf', duracaoSeg: 2 * H }),
        registro({ data: '2026-01-06', materiaId: 'mat-cf', duracaoSeg: 3 * H }),
        registro({ data: '2026-01-07', materiaId: 'mat-pf', duracaoSeg: 2 * H }),
      ],
      janeiro,
      materias,
    )
    expect(ranking).toEqual([
      { materiaId: 'mat-pf', codigo: 'Matemática-PF', cor: '#ff0000', totalSeg: 4 * H },
      { materiaId: 'mat-cf', codigo: 'Matemática-CF', cor: '#00ff00', totalSeg: 3 * H },
    ])
  })

  it('desempata pelo código e ignora excluídos e outros meses', () => {
    const ranking = montarRanking(
      [
        registro({ data: '2026-01-05', materiaId: 'port-pf', duracaoSeg: H }),
        registro({ data: '2026-01-05', materiaId: 'mat-pf', duracaoSeg: H }),
        registro({ data: '2026-01-05', materiaId: 'mat-cf', duracaoSeg: H, excluidoEm: 'x' }),
        registro({ data: '2026-02-01', materiaId: 'mat-cf', duracaoSeg: H }),
      ],
      janeiro,
      materias,
    )
    expect(ranking.map((i) => i.codigo)).toEqual(['Matemática-PF', 'Português-PF'])
  })

  it('não mostra matérias com tempo zero', () => {
    const ranking = montarRanking(
      [registro({ data: '2026-01-05', materiaId: 'mat-pf', duracaoSeg: 0 })],
      janeiro,
      materias,
    )
    expect(ranking).toEqual([])
  })

  it('mantém o tempo de uma matéria que não está na lista, com código genérico', () => {
    const ranking = montarRanking(
      [registro({ data: '2026-01-05', materiaId: 'sumiu', duracaoSeg: H })],
      janeiro,
      materias,
    )
    expect(ranking).toEqual([{ materiaId: 'sumiu', ...MATERIA_DESCONHECIDA, totalSeg: H }])
  })
})

describe('montarHistorico (RN28)', () => {
  const novembro = intervaloDoMes({ ano: 2026, mes: 11 })

  it('ordena por data e início, mais recente primeiro; no mesmo dia, manuais depois', () => {
    const cron1 = registro({
      data: '2026-11-10',
      origem: 'cronometro',
      inicio: '2026-11-10T12:00:00.000Z',
    })
    const cron2 = registro({
      data: '2026-11-10',
      origem: 'cronometro',
      inicio: '2026-11-10T18:00:00.000Z',
    })
    const manualAntigo = registro({ data: '2026-11-10', criadoEm: '2026-11-11T10:00:00.000Z' })
    const manualNovo = registro({ data: '2026-11-10', criadoEm: '2026-11-12T10:00:00.000Z' })
    const outroDia = registro({ data: '2026-11-11', criadoEm: '2026-11-01T00:00:00.000Z' })
    const historico = montarHistorico([manualAntigo, cron1, outroDia, manualNovo, cron2], novembro)
    expect(historico).toEqual([outroDia, cron2, cron1, manualNovo, manualAntigo])
  })

  it('não mostra excluídos nem registros fora do período', () => {
    const dentro = registro({ data: '2026-11-01' })
    const historico = montarHistorico(
      [
        dentro,
        registro({ data: '2026-11-02', excluidoEm: '2026-11-03T00:00:00.000Z' }),
        registro({ data: '2026-10-31' }),
        registro({ data: '2026-12-01' }),
      ],
      novembro,
    )
    expect(historico).toEqual([dentro])
  })

  it('empate total é decidido pelo id, sempre na mesma ordem', () => {
    const a = registro({ id: 'a', data: '2026-11-01' })
    const b = registro({ id: 'b', data: '2026-11-01' })
    expect(montarHistorico([a, b], novembro)).toEqual([b, a])
    expect(montarHistorico([b, a], novembro)).toEqual([b, a])
  })
})

describe('Principal e Estatísticas somam os mesmos registros', () => {
  it('total do mês, ranking e tabela principal batem', () => {
    const novembro = intervaloDoMes({ ano: 2026, mes: 11 })
    const registros = [
      registro({ data: '2026-11-01', materiaId: 'mat-pf', duracaoSeg: 3601 }),
      registro({
        data: '2026-11-21',
        materiaId: 'mat-pf',
        duracaoSeg: 1799,
        origem: 'cronometro',
        inicio: '2026-11-22T02:30:00.000Z',
      }),
      registro({ data: '2026-11-30', materiaId: 'mat-cf', duracaoSeg: 61 }),
      // fora do planejamento: entra no total, mas não na tabela principal
      registro({ data: '2026-11-15', materiaId: 'port-pf', duracaoSeg: 7200 }),
      registro({ data: '2026-11-15', materiaId: 'mat-cf', duracaoSeg: 500, excluidoEm: 'x' }),
      registro({ data: '2026-10-31', materiaId: 'mat-pf', duracaoSeg: 999 }),
      registro({ data: '2026-12-01', materiaId: 'mat-pf', duracaoSeg: 999 }),
    ]

    const soma = somarSegundosPorMateria(registros, novembro)
    const painel = calcularPainel(10, soma.totalSeg, 2)
    const linhas = montarLinhasPlanejamento({
      planejamento: [
        { materiaId: 'mat-pf', peso: 1 },
        { materiaId: 'mat-cf', peso: 1 },
      ],
      materias: materias.map((m, i) => ({ ...m, objetivoId: 'o', nome: m.codigo, ordem: i })),
      objetivos: [{ id: 'o', ordem: 0 }],
      segundosPorMateria: soma.porMateria,
      metaMensalHoras: 10,
    })

    const totalEstatisticas = totalDoPeriodo(registros, novembro)
    const ranking = montarRanking(registros, novembro, materias)
    const totaisDoAno = totaisPorMes(registros, 2026)

    expect(totalEstatisticas).toBe(painel.estudadoSeg)
    expect(totalEstatisticas).toBe(3601 + 1799 + 61 + 7200)
    expect(totaisDoAno[10]?.totalSeg).toBe(painel.estudadoSeg)
    expect(ranking.reduce((s, i) => s + i.totalSeg, 0)).toBe(painel.estudadoSeg)
    for (const linha of linhas) {
      const item = ranking.find((i) => i.materiaId === linha.materiaId)
      expect(item?.totalSeg).toBe(linha.estudadoSeg)
    }
  })
})
