import { describe, expect, it } from 'vitest'
import {
  arredondarPercentual,
  arredondarPeso,
  calcularMetaIndividualSeg,
  calcularPainel,
  calcularPercentual,
  calcularRestante,
  esquemaMetaMensal,
  esquemaPeso,
  interpretarNumeroBr,
  montarLinhasPlanejamento,
  somarSegundosPorMateria,
  type EntradaLinhas,
  type RegistroParaSoma,
} from './calculos'
import { formatarHoras, formatarHorasParaCima, intervaloDoMes } from './tempo'

const H = 3600

describe('interpretarNumeroBr', () => {
  it('aceita vírgula e ponto como separador decimal', () => {
    expect(interpretarNumeroBr('1,5')).toBe(1.5)
    expect(interpretarNumeroBr('1.5')).toBe(1.5)
    expect(interpretarNumeroBr(' 100 ')).toBe(100)
  })

  it('rejeita texto vazio, sinais e formatos inválidos', () => {
    for (const texto of ['', '  ', '-1', 'abc', '1,', ',5', '1,2,3', '1.000,5', '1e3']) {
      expect(interpretarNumeroBr(texto)).toBeNull()
    }
  })
})

describe('arredondarPeso', () => {
  it('arredonda para 0,1 sem erro de ponto flutuante', () => {
    expect(arredondarPeso(1.15)).toBe(1.2)
    expect(arredondarPeso(1.05)).toBe(1.1)
    expect(arredondarPeso(2.25)).toBe(2.3)
    expect(arredondarPeso(1.24)).toBe(1.2)
    expect(arredondarPeso(1)).toBe(1)
  })

  it('arredonda "1,25" digitado para 1,3', () => {
    expect(arredondarPeso(interpretarNumeroBr('1,25') ?? 0)).toBe(1.3)
  })
})

describe('esquemaPeso', () => {
  it('arredonda e aceita valores de 0,1 a 100', () => {
    expect(esquemaPeso.parse(1.25)).toBe(1.3)
    expect(esquemaPeso.parse(0.1)).toBe(0.1)
    expect(esquemaPeso.parse(100)).toBe(100)
    expect(esquemaPeso.parse(0.05)).toBe(0.1)
  })

  it('rejeita zero, negativos, acima de 100 e não numéricos', () => {
    for (const valor of [0, 0.04, -1, 100.1, Number.NaN, Infinity]) {
      expect(esquemaPeso.safeParse(valor).success).toBe(false)
    }
    expect(esquemaPeso.safeParse('1').success).toBe(false)
  })
})

describe('esquemaMetaMensal', () => {
  it('aceita de 0,5 a 744 horas', () => {
    expect(esquemaMetaMensal.parse(0.5)).toBe(0.5)
    expect(esquemaMetaMensal.parse(744)).toBe(744)
    expect(esquemaMetaMensal.parse(80.25)).toBe(80.25)
  })

  it('rejeita fora da faixa e não numéricos', () => {
    for (const valor of [0, 0.4, 744.1, Number.NaN]) {
      expect(esquemaMetaMensal.safeParse(valor).success).toBe(false)
    }
  })
})

describe('somarSegundosPorMateria', () => {
  const novembro = intervaloDoMes({ ano: 2026, mes: 11 })
  const registro = (
    materiaId: string,
    data: string,
    duracaoSeg: number,
    excluidoEm: string | null = null,
  ): RegistroParaSoma => ({ materiaId, data, duracaoSeg, excluidoEm })

  it('soma só o mês, ignora excluídos e inclui matérias fora do planejamento', () => {
    const soma = somarSegundosPorMateria(
      [
        registro('a', '2026-11-01', 600),
        registro('a', '2026-11-30', 300),
        registro('b', '2026-11-15', 120),
        registro('a', '2026-10-31', 999),
        registro('a', '2026-12-01', 999),
        registro('b', '2026-11-16', 999, '2026-11-17T00:00:00.000Z'),
      ],
      novembro,
    )
    expect(soma.porMateria.get('a')).toBe(900)
    expect(soma.porMateria.get('b')).toBe(120)
    expect(soma.totalSeg).toBe(1020)
  })

  it('retorna zero sem registros', () => {
    const soma = somarSegundosPorMateria([], novembro)
    expect(soma.totalSeg).toBe(0)
    expect(soma.porMateria.size).toBe(0)
  })
})

describe('meta, percentual e restante', () => {
  it('divide a meta pelos pesos (RN09)', () => {
    expect(calcularMetaIndividualSeg(100, 2, 4)).toBe(50 * H)
    expect(calcularMetaIndividualSeg(100, 1, 4)).toBe(25 * H)
  })

  it('calcula % acima de 100 e arredonda só na exibição (RN10)', () => {
    const percentual = calcularPercentual(30 * H, 20 * H)
    expect(percentual).toBe(150)
    expect(calcularPercentual(1, 3)).toBeCloseTo(33.3333333, 6)
    expect(arredondarPercentual(49.5, false)).toBe(50)
    expect(arredondarPercentual(49.49, false)).toBe(49)
    expect(calcularPercentual(10, 0)).toBeNull()
  })

  it('nunca mostra 100% enquanto a meta não estiver atingida', () => {
    expect(arredondarPercentual(99.6, false)).toBe(99)
    expect(arredondarPercentual(99.5, false)).toBe(99)
    expect(arredondarPercentual(99.4, false)).toBe(99)
    expect(arredondarPercentual(100, true)).toBe(100)
    expect(arredondarPercentual(150.4, true)).toBe(150)
    // Ruído de ponto flutuante com a meta atingida continua mostrando 100%.
    expect(arredondarPercentual(99.99999999999, true)).toBe(100)
  })

  it('99,6% estudado mostra 99% e a meta não está atingida', () => {
    const metaSeg = 1000 * 60
    const estudadoSeg = 996 * 60
    const restante = calcularRestante(metaSeg, estudadoSeg)
    const percentual = calcularPercentual(estudadoSeg, metaSeg) ?? 0
    expect(restante.atingida).toBe(false)
    expect(arredondarPercentual(percentual, restante.atingida)).toBe(99)
  })

  it('restante negativo vira zero com "meta atingida" (RN11)', () => {
    expect(calcularRestante(20 * H, 30 * H)).toEqual({ restanteSeg: 0, atingida: true })
    expect(calcularRestante(20 * H, 20 * H)).toEqual({ restanteSeg: 0, atingida: true })
    expect(calcularRestante(20 * H, 19 * H)).toEqual({ restanteSeg: H, atingida: false })
  })

  it('faltando 40 s mostra 0h01 e a meta não está atingida', () => {
    const restante = calcularRestante(H, H - 40)
    expect(restante.atingida).toBe(false)
    expect(formatarHorasParaCima(restante.restanteSeg)).toBe('0h01')
  })

  it('não considera ruído de ponto flutuante como tempo restante', () => {
    const metaSeg = calcularMetaIndividualSeg(1, 1, 3) * 3
    expect(calcularRestante(metaSeg, 3600).atingida).toBe(true)
  })
})

describe('montarLinhasPlanejamento', () => {
  const objetivos = [
    { id: 'cf', ordem: 2 },
    { id: 'pf', ordem: 1 },
  ]
  const materia = (id: string, objetivoId: string, ordem: number) => ({
    id,
    objetivoId,
    ordem,
    nome: id,
    codigo: `${id}-${objetivoId.toUpperCase()}`,
    cor: '#4f46e5',
  })
  const materias = [
    materia('port', 'cf', 1),
    materia('mat', 'pf', 2),
    materia('dir', 'pf', 1),
    materia('fora', 'pf', 3),
  ]
  const base: EntradaLinhas = {
    planejamento: [
      { materiaId: 'port', peso: 1 },
      { materiaId: 'mat', peso: 2 },
      { materiaId: 'dir', peso: 1 },
    ],
    materias,
    objetivos,
    segundosPorMateria: new Map([
      ['mat', 30 * H],
      ['fora', 5 * H],
    ]),
    metaMensalHoras: 100,
  }

  it('RF03: 100 h com pesos 2, 1 e 1 dá 50h00, 25h00 e 25h00', () => {
    const linhas = montarLinhasPlanejamento(base)
    const metas = Object.fromEntries(
      linhas.map((l) => [l.materiaId, formatarHoras(l.metaSeg ?? -1)]),
    )
    expect(metas).toEqual({ mat: '50h00', dir: '25h00', port: '25h00' })
  })

  it('RF03: mudar a meta para 80 h recalcula', () => {
    const linhas = montarLinhasPlanejamento({ ...base, metaMensalHoras: 80 })
    expect(linhas.map((l) => formatarHoras(l.metaSeg ?? -1))).toEqual(['20h00', '40h00', '20h00'])
  })

  it('ordena pela ordem do objetivo e depois pela ordem da matéria', () => {
    expect(montarLinhasPlanejamento(base).map((l) => l.materiaId)).toEqual(['dir', 'mat', 'port'])
  })

  it('RF05: 20 h de meta e 30 h estudadas mostram 150%', () => {
    const linhas = montarLinhasPlanejamento({
      ...base,
      planejamento: [{ materiaId: 'mat', peso: 1 }],
      metaMensalHoras: 20,
    })
    expect(linhas[0]?.percentual).toBe(150)
    expect(linhas[0]?.restanteSeg).toBe(0)
    expect(linhas[0]?.atingida).toBe(true)
  })

  it('sem meta, meta, % e restante ficam vazios (RN13)', () => {
    const [linha] = montarLinhasPlanejamento({ ...base, metaMensalHoras: null })
    expect(linha).toMatchObject({ metaSeg: null, percentual: null, restanteSeg: null })
    expect(linha?.atingida).toBe(false)
  })

  it('ignora itens cuja matéria ou objetivo não existem', () => {
    const linhas = montarLinhasPlanejamento({
      ...base,
      planejamento: [
        { materiaId: 'dir', peso: 1 },
        { materiaId: 'inexistente', peso: 3 },
      ],
      objetivos: [{ id: 'pf', ordem: 1 }],
      materias: [...materias, materia('orfa', 'sumiu', 1)],
    })
    expect(linhas.map((l) => l.materiaId)).toEqual(['dir'])
    expect(linhas[0]?.metaSeg).toBe(100 * H)
  })

  it('plano vazio produz tabela vazia', () => {
    expect(montarLinhasPlanejamento({ ...base, planejamento: [] })).toEqual([])
  })
})

describe('calcularPainel', () => {
  it('usa todo o tempo do mês contra a meta mensal', () => {
    const painel = calcularPainel(100, 35 * H, 3)
    expect(painel).toMatchObject({
      metaSeg: 100 * H,
      estudadoSeg: 35 * H,
      restanteSeg: 65 * H,
      atingida: false,
      percentual: 35,
      quantidadeMaterias: 3,
      aviso: null,
    })
  })

  it('marca meta atingida quando passa da meta', () => {
    const painel = calcularPainel(10, 12 * H, 1)
    expect(painel.restanteSeg).toBe(0)
    expect(painel.atingida).toBe(true)
    expect(painel.percentual).toBe(120)
  })

  it('sem meta pede para definir a meta (RN13)', () => {
    const painel = calcularPainel(null, 3 * H, 2)
    expect(painel).toMatchObject({
      metaSeg: null,
      percentual: null,
      restanteSeg: null,
      aviso: 'defina_meta',
      estudadoSeg: 3 * H,
    })
  })

  it('sem matérias no planejamento avisa, mas calcula % e restante com todo o tempo do mês', () => {
    const painel = calcularPainel(100, 3 * H, 0)
    expect(painel).toMatchObject({
      metaSeg: 100 * H,
      estudadoSeg: 3 * H,
      percentual: 3,
      restanteSeg: 97 * H,
      atingida: false,
      aviso: 'adicione_materias',
    })
  })
})
