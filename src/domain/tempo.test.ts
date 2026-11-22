import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  arredondarSemRuido,
  dataNoFuso,
  formatarDataCurta,
  formatarDataLonga,
  formatarDuracaoCurta,
  formatarHoraNoFuso,
  formatarHoras,
  formatarHorasParaCima,
  formatarMinutos,
  intervaloDoMes,
  mesNoFuso,
} from './tempo'

afterEach(() => {
  vi.useRealTimers()
})

describe('dataNoFuso e mesNoFuso', () => {
  it('usa o fuso configurado, não o UTC, na virada do mês', () => {
    vi.useFakeTimers()
    // 30/11 23:30 em Brasília = 01/12 02:30 em UTC.
    vi.setSystemTime(new Date('2026-12-01T02:30:00Z'))
    const agora = new Date()
    expect(dataNoFuso(agora, 'America/Sao_Paulo')).toBe('2026-11-30')
    expect(mesNoFuso(agora, 'America/Sao_Paulo')).toEqual({ ano: 2026, mes: 11 })
    expect(dataNoFuso(agora, 'UTC')).toBe('2026-12-01')
    expect(mesNoFuso(agora, 'UTC')).toEqual({ ano: 2026, mes: 12 })
  })

  it('considera Noronha (UTC−2) e Rio Branco (UTC−5)', () => {
    const instante = new Date('2026-12-01T03:30:00Z')
    expect(dataNoFuso(instante, 'America/Noronha')).toBe('2026-12-01')
    expect(dataNoFuso(instante, 'America/Sao_Paulo')).toBe('2026-12-01')
    expect(dataNoFuso(instante, 'America/Manaus')).toBe('2026-11-30')
    expect(dataNoFuso(instante, 'America/Rio_Branco')).toBe('2026-11-30')
  })

  it('vira o ano no fuso configurado', () => {
    const instante = new Date('2027-01-01T04:59:59Z')
    expect(mesNoFuso(instante, 'America/Rio_Branco')).toEqual({ ano: 2026, mes: 12 })
    expect(mesNoFuso(new Date('2027-01-01T05:00:00Z'), 'America/Rio_Branco')).toEqual({
      ano: 2027,
      mes: 1,
    })
  })
})

describe('intervaloDoMes', () => {
  it('vai do dia 1 ao último dia do mês', () => {
    expect(intervaloDoMes({ ano: 2026, mes: 11 })).toEqual({
      inicio: '2026-11-01',
      fim: '2026-11-30',
    })
    expect(intervaloDoMes({ ano: 2026, mes: 12 })).toEqual({
      inicio: '2026-12-01',
      fim: '2026-12-31',
    })
  })

  it('trata fevereiro em ano bissexto e comum', () => {
    expect(intervaloDoMes({ ano: 2028, mes: 2 }).fim).toBe('2028-02-29')
    expect(intervaloDoMes({ ano: 2026, mes: 2 }).fim).toBe('2026-02-28')
  })
})

describe('formatarDataLonga', () => {
  it('escreve a data por extenso em português', () => {
    expect(formatarDataLonga('2026-11-22')).toBe('22 de novembro de 2026')
    expect(formatarDataLonga('2027-01-01')).toBe('1 de janeiro de 2027')
  })
})

describe('formatarHoras (para baixo)', () => {
  it('usa o formato 4h27', () => {
    expect(formatarHoras(4 * 3600 + 27 * 60)).toBe('4h27')
    expect(formatarHoras(50 * 3600)).toBe('50h00')
    expect(formatarHoras(0)).toBe('0h00')
  })

  it('arredonda os minutos para baixo', () => {
    expect(formatarHoras(4 * 3600 + 27 * 60 + 59)).toBe('4h27')
    expect(formatarHoras(59)).toBe('0h00')
  })

  it('não perde um minuto por ruído de ponto flutuante', () => {
    // 100 h × 1/3 = 33h20 exatas, mas o cálculo em ponto flutuante pode ficar 1e-10 abaixo.
    expect(formatarHoras((100 * 3600) / 3)).toBe('33h20')
    expect(formatarHoras(1200 - 1e-9)).toBe('0h20')
  })

  it('separa milhares nas horas e trata negativos como zero', () => {
    expect(formatarHoras(1234 * 3600 + 5 * 60)).toBe('1.234h05')
    expect(formatarHoras(-30)).toBe('0h00')
  })
})

describe('formatarHorasParaCima', () => {
  it('mostra 0h01 quando faltam 40 segundos', () => {
    expect(formatarHorasParaCima(40)).toBe('0h01')
  })

  it('arredonda os minutos para cima e mantém minutos exatos', () => {
    expect(formatarHorasParaCima(25 * 3600 + 1)).toBe('25h01')
    expect(formatarHorasParaCima(25 * 3600)).toBe('25h00')
    expect(formatarHorasParaCima(0)).toBe('0h00')
  })

  it('não ganha um minuto por ruído de ponto flutuante', () => {
    expect(formatarHorasParaCima(1200 + 1e-9)).toBe('0h20')
  })
})

describe('formatarMinutos', () => {
  it('mostra minutos inteiros para baixo, no formato pt-BR', () => {
    expect(formatarMinutos(23 * 60 + 59)).toBe('23')
    expect(formatarMinutos(1234 * 60)).toBe('1.234')
    expect(formatarMinutos(-1)).toBe('0')
  })
})

describe('arredondarSemRuido', () => {
  it('arredonda meios para cima mesmo com ruído', () => {
    expect(arredondarSemRuido(1.15 * 10)).toBe(12)
    expect(arredondarSemRuido(49.5)).toBe(50)
    expect(arredondarSemRuido(49.4)).toBe(49)
  })
})

describe('formatarHoraNoFuso, formatarDataCurta e formatarDuracaoCurta', () => {
  it('mostra a hora no fuso configurado', () => {
    expect(formatarHoraNoFuso('2026-11-22T13:05:00.000Z', 'America/Sao_Paulo')).toBe('10:05')
    expect(formatarHoraNoFuso('2026-11-22T13:05:00.000Z', 'America/Rio_Branco')).toBe('08:05')
    expect(formatarHoraNoFuso('2026-11-23T02:50:00.000Z', 'America/Sao_Paulo')).toBe('23:50')
  })

  it('formata a data curta', () => {
    expect(formatarDataCurta('2026-11-02')).toBe('02/11/2026')
  })

  it('formata durações curtas', () => {
    expect(formatarDuracaoCurta(0)).toBe('0 s')
    expect(formatarDuracaoCurta(59.9)).toBe('59 s')
    expect(formatarDuracaoCurta(60)).toBe('1 min')
    expect(formatarDuracaoCurta(300.5)).toBe('5 min')
    expect(formatarDuracaoCurta(-3)).toBe('0 s')
  })
})
