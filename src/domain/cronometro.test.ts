import { describe, expect, it } from 'vitest'
import {
  decidirAoAssumir,
  esquemaDuracaoMin,
  formatarRelogio,
  intervaloNaoContadoSeg,
  montarRegistro,
  podeGravar,
  progresso,
  segundosEfetivos,
  tempoContadoMs,
  transicionar,
  type EventoCronometro,
  type Sessao,
} from './cronometro'

const T0 = Date.parse('2026-11-22T13:00:00.000Z')
const SEG = 1_000
const MIN = 60 * SEG

function em(msDepois: number): Date {
  return new Date(T0 + msDepois)
}

/** Aplica o evento e devolve a nova sessão (falha se ela sumir). */
function aplicar(sessao: Sessao | null, evento: EventoCronometro, quando: number): Sessao {
  const r = transicionar(sessao, evento, em(quando))
  if (!r.sessao) throw new Error('Sessão removida inesperadamente')
  return r.sessao
}

/** Sessão em andamento, com heartbeats a cada 5 s até `ate`. */
function rodando(duracaoMin: number, ate = 0): Sessao {
  let s = aplicar(null, { tipo: 'iniciar', materiaId: 'm1', duracaoMin }, 0)
  for (let t = 5 * SEG; t <= ate; t += 5 * SEG) s = aplicar(s, { tipo: 'heartbeat' }, t)
  return s
}

describe('iniciar', () => {
  it('cria a sessão em andamento a partir de agora', () => {
    const s = rodando(60)
    expect(s).toMatchObject({
      id: 'atual',
      materiaId: 'm1',
      duracaoPlanejadaMin: 60,
      estado: 'em_andamento',
      acumuladoSeg: 0,
      inicioEm: em(0).toISOString(),
      segmentoInicioEm: em(0).toISOString(),
      ultimoHeartbeatEm: em(0).toISOString(),
      tipoEncerramento: null,
      fimEm: null,
      motivoPausaAutomatica: null,
      pausaDetectadaEm: null,
    })
  })

  it('não cria uma segunda sessão (RN16)', () => {
    const s = rodando(60)
    const r = transicionar(s, { tipo: 'iniciar', materiaId: 'm2', duracaoMin: 10 }, em(1000))
    expect(r.alterada).toBe(false)
    expect(r.sessao).toBe(s)
  })

  it('eventos sem sessão são ignorados', () => {
    expect(transicionar(null, { tipo: 'pausar' }, em(0))).toEqual({
      sessao: null,
      efeitos: [],
      alterada: false,
    })
  })
})

describe('esquemaDuracaoMin', () => {
  it('aceita inteiros de 1 a 480', () => {
    expect(esquemaDuracaoMin.safeParse(1).success).toBe(true)
    expect(esquemaDuracaoMin.safeParse(480).success).toBe(true)
  })
  it.each([0, 481, 1.5, Number.NaN])('rejeita %s', (valor) => {
    expect(esquemaDuracaoMin.safeParse(valor).success).toBe(false)
  })
})

describe('tempo pelo relógio (RN17)', () => {
  it('conta acumulado + (agora − início do trecho)', () => {
    const s = rodando(60)
    expect(tempoContadoMs(s, em(90 * SEG))).toBe(90 * SEG)
    expect(segundosEfetivos(s, em(90.9 * SEG))).toBe(90)
    expect(progresso(s, em(30 * MIN))).toBeCloseTo(0.5)
  })

  it('pausar congela o tempo', () => {
    const s = aplicar(rodando(60, 10 * SEG), { tipo: 'pausar' }, 12 * SEG)
    expect(s.estado).toBe('pausado')
    expect(s.acumuladoSeg).toBe(12)
    expect(s.segmentoInicioEm).toBeNull()
    expect(s.ultimoHeartbeatEm).toBe(em(12 * SEG).toISOString())
    expect(tempoContadoMs(s, em(10 * MIN))).toBe(12 * SEG)
  })

  it('continuar abre um trecho novo e soma ao acumulado', () => {
    let s = aplicar(rodando(60), { tipo: 'pausar' }, 10 * SEG)
    s = aplicar(s, { tipo: 'continuar' }, 5 * MIN)
    expect(s.estado).toBe('em_andamento')
    expect(s.segmentoInicioEm).toBe(em(5 * MIN).toISOString())
    expect(s.ultimoHeartbeatEm).toBe(em(5 * MIN).toISOString())
    expect(tempoContadoMs(s, em(5 * MIN + 20 * SEG))).toBe(30 * SEG)
  })

  it('pausar uma sessão pausada ou continuar uma em andamento não faz nada', () => {
    const rodandoS = rodando(60)
    expect(transicionar(rodandoS, { tipo: 'continuar' }, em(SEG)).alterada).toBe(false)
    const pausada = aplicar(rodandoS, { tipo: 'pausar' }, SEG)
    expect(transicionar(pausada, { tipo: 'pausar' }, em(2 * SEG)).alterada).toBe(false)
    expect(transicionar(pausada, { tipo: 'heartbeat' }, em(2 * SEG)).alterada).toBe(false)
  })

  it('o tempo nunca passa do planejado', () => {
    const s = rodando(1)
    expect(tempoContadoMs(s, em(10 * MIN))).toBe(MIN)
  })
})

describe('heartbeat (RN18) e suspensão (RN19)', () => {
  it('heartbeat atualiza o último sinal', () => {
    const s = aplicar(rodando(60), { tipo: 'heartbeat' }, 5 * SEG)
    expect(s.ultimoHeartbeatEm).toBe(em(5 * SEG).toISOString())
  })

  it('tick sem novidade não altera nada', () => {
    const s = rodando(60, 20 * SEG)
    const r = transicionar(s, { tipo: 'tick' }, em(21 * SEG))
    expect(r).toEqual({ sessao: s, efeitos: [], alterada: false })
  })

  it('exatamente 30 s sem heartbeat ainda não é suspensão', () => {
    const s = rodando(60, 20 * SEG)
    expect(transicionar(s, { tipo: 'tick' }, em(50 * SEG)).alterada).toBe(false)
  })

  it('salto de 5 min pausa contando só até o último heartbeat', () => {
    const s = rodando(60, 20 * SEG)
    const r = transicionar(s, { tipo: 'tick' }, em(20 * SEG + 5 * MIN))
    expect(r.efeitos).toEqual(['pausaAutomatica'])
    expect(r.sessao).toMatchObject({
      estado: 'pausado',
      acumuladoSeg: 20,
      segmentoInicioEm: null,
      motivoPausaAutomatica: 'suspensao',
      ultimoHeartbeatEm: em(20 * SEG).toISOString(),
      pausaDetectadaEm: em(20 * SEG + 5 * MIN).toISOString(),
    })
    expect(intervaloNaoContadoSeg(r.sessao as Sessao)).toBe(300)
  })

  it('30,001 s sem heartbeat já é suspensão', () => {
    const s = rodando(60, 20 * SEG)
    const r = transicionar(s, { tipo: 'tick' }, em(50 * SEG + 1))
    expect(r.sessao?.estado).toBe('pausado')
  })

  it('um heartbeat atrasado não mascara a suspensão', () => {
    const s = rodando(60, 20 * SEG)
    const r = transicionar(s, { tipo: 'heartbeat' }, em(20 * SEG + 5 * MIN))
    expect(r.sessao?.estado).toBe('pausado')
    expect(r.sessao?.ultimoHeartbeatEm).toBe(em(20 * SEG).toISOString())
  })

  it('pausar logo depois de acordar conta só até o último heartbeat', () => {
    const s = rodando(60, 20 * SEG)
    const r = transicionar(s, { tipo: 'pausar' }, em(20 * SEG + 5 * MIN))
    expect(r.sessao?.acumuladoSeg).toBe(20)
    expect(r.sessao?.motivoPausaAutomatica).toBe('suspensao')
    expect(r.efeitos).toEqual(['pausaAutomatica'])
  })

  it('suspensão depois do fim planejado conclui no instante exato', () => {
    const s = rodando(1, 55 * SEG)
    const r = transicionar(s, { tipo: 'tick' }, em(10 * MIN))
    // O último heartbeat (55 s) ainda não alcançou 60 s: pausa.
    expect(r.sessao?.estado).toBe('pausado')
    // Heartbeat gravado exatamente no fim (o próprio heartbeat já concluiria;
    // aqui a sessão vem do banco nesse estado).
    const s2: Sessao = { ...rodando(1), ultimoHeartbeatEm: em(MIN).toISOString() }
    const r2 = transicionar(s2, { tipo: 'tick' }, em(10 * MIN))
    expect(r2.sessao).toMatchObject({
      estado: 'aguardando_confirmacao',
      tipoEncerramento: 'concluido',
      acumuladoSeg: 60,
      fimEm: em(MIN).toISOString(),
    })
    expect(r2.efeitos).toEqual(['alertaFim'])
  })
})

describe('fim do tempo planejado (RN15)', () => {
  it('vai para a confirmação como concluído, com o tempo limitado', () => {
    const s = rodando(1, 55 * SEG)
    const r = transicionar(s, { tipo: 'tick' }, em(61 * SEG))
    expect(r.efeitos).toEqual(['alertaFim'])
    expect(r.sessao).toMatchObject({
      estado: 'aguardando_confirmacao',
      tipoEncerramento: 'concluido',
      acumuladoSeg: 60,
      segmentoInicioEm: null,
      fimEm: em(MIN).toISOString(),
    })
  })

  it('o término é o instante exato do fim, com pausas no meio', () => {
    let s = aplicar(rodando(1), { tipo: 'pausar' }, 30 * SEG)
    s = aplicar(s, { tipo: 'continuar' }, 10 * MIN)
    s = aplicar(s, { tipo: 'heartbeat' }, 10 * MIN + 25 * SEG)
    const r = transicionar(s, { tipo: 'tick' }, em(10 * MIN + 31 * SEG))
    expect(r.sessao?.fimEm).toBe(em(10 * MIN + 30 * SEG).toISOString())
    expect(r.sessao?.acumuladoSeg).toBe(60)
  })

  it('o heartbeat no fim do tempo já conclui', () => {
    const r = transicionar(rodando(1, 55 * SEG), { tipo: 'heartbeat' }, em(60 * SEG))
    expect(r.sessao?.estado).toBe('aguardando_confirmacao')
    expect(r.efeitos).toEqual(['alertaFim'])
  })

  it('pausar depois do fim conclui em vez de pausar', () => {
    const s = rodando(1, 55 * SEG)
    const r = transicionar(s, { tipo: 'pausar' }, em(62 * SEG))
    expect(r.sessao?.estado).toBe('aguardando_confirmacao')
    expect(r.efeitos).toEqual(['alertaFim'])
  })

  it('encerrar depois do fim mantém o concluído', () => {
    const s = rodando(1, 55 * SEG)
    const r = transicionar(s, { tipo: 'encerrar' }, em(62 * SEG))
    expect(r.sessao?.tipoEncerramento).toBe('concluido')
  })
})

describe('evento do usuário logo após uma pausa automática', () => {
  // Heartbeats até 40 s, depois o computador dorme; o clique chega aos 10 min.
  const dormiu = () => rodando(60, 40 * SEG)
  const pausaEsperada = {
    estado: 'pausado',
    motivoPausaAutomatica: 'suspensao',
    acumuladoSeg: 40,
    ultimoHeartbeatEm: em(40 * SEG).toISOString(),
    pausaDetectadaEm: em(10 * MIN).toISOString(),
    tipoEncerramento: null,
    fimEm: null,
  }

  it('encerrar devolve só a pausa, sem ir para a confirmação', () => {
    const r = transicionar(dormiu(), { tipo: 'encerrar' }, em(10 * MIN))
    expect(r.sessao).toMatchObject(pausaEsperada)
    expect(r.efeitos).toEqual(['pausaAutomatica'])
    expect(r.alterada).toBe(true)
    expect(intervaloNaoContadoSeg(r.sessao as Sessao)).toBe(10 * 60 - 40)
  })

  it('continuar devolve só a pausa, sem apagar o aviso', () => {
    const r = transicionar(dormiu(), { tipo: 'continuar' }, em(10 * MIN))
    expect(r.sessao).toMatchObject({ ...pausaEsperada, segmentoInicioEm: null })
    expect(r.efeitos).toEqual(['pausaAutomatica'])
  })

  it('pausar devolve a pausa automática, não uma pausa manual', () => {
    const r = transicionar(dormiu(), { tipo: 'pausar' }, em(10 * MIN))
    expect(r.sessao).toMatchObject(pausaEsperada)
  })

  it('o evento seguinte, já com a sessão pausada, é aplicado normalmente', () => {
    const pausada = aplicar(dormiu(), { tipo: 'encerrar' }, 10 * MIN)
    const r = transicionar(pausada, { tipo: 'encerrar' }, em(10 * MIN + SEG))
    expect(r.sessao).toMatchObject({
      estado: 'aguardando_confirmacao',
      tipoEncerramento: 'antecipado',
      acumuladoSeg: 40,
      fimEm: em(40 * SEG).toISOString(),
    })
  })
})

describe('encerrar antes do fim', () => {
  it('em andamento: aos 23 de 60 min, conta 23 min e o término é o clique', () => {
    const comHeartbeat = rodando(60, 23 * MIN)
    const r2 = transicionar(comHeartbeat, { tipo: 'encerrar' }, em(23 * MIN))
    expect(r2.sessao).toMatchObject({
      estado: 'aguardando_confirmacao',
      tipoEncerramento: 'antecipado',
      acumuladoSeg: 23 * 60,
      fimEm: em(23 * MIN).toISOString(),
    })
  })

  it('pausada: o término é o instante da pausa', () => {
    let s = aplicar(rodando(60, 10 * SEG), { tipo: 'pausar' }, 10 * SEG)
    s = aplicar(s, { tipo: 'encerrar' }, 20 * MIN)
    expect(s.fimEm).toBe(em(10 * SEG).toISOString())
    expect(s.acumuladoSeg).toBe(10)
  })

  it('encerrar de novo não faz nada', () => {
    const s = aplicar(rodando(60, 5 * SEG), { tipo: 'encerrar' }, 5 * SEG)
    expect(transicionar(s, { tipo: 'encerrar' }, em(6 * SEG)).alterada).toBe(false)
  })
})

describe('descartar', () => {
  it.each(['em_andamento', 'pausado', 'aguardando_confirmacao'] as const)(
    'remove a sessão em %s',
    (estado) => {
      let s = rodando(60, 5 * SEG)
      if (estado === 'pausado') s = aplicar(s, { tipo: 'pausar' }, 5 * SEG)
      if (estado === 'aguardando_confirmacao') s = aplicar(s, { tipo: 'encerrar' }, 5 * SEG)
      expect(transicionar(s, { tipo: 'descartar' }, em(6 * SEG))).toEqual({
        sessao: null,
        efeitos: [],
        alterada: true,
      })
    },
  )
})

describe('recuperação (RN20)', () => {
  it('em andamento: pausa no último heartbeat com motivo recuperação', () => {
    const s = rodando(60, 40 * SEG)
    const r = transicionar(s, { tipo: 'recuperar' }, em(2 * 60 * MIN))
    expect(r.sessao).toMatchObject({
      estado: 'pausado',
      acumuladoSeg: 40,
      motivoPausaAutomatica: 'recuperacao',
      pausaDetectadaEm: em(2 * 60 * MIN).toISOString(),
    })
  })

  it('mesmo um F5 rápido pausa no último heartbeat', () => {
    const s = rodando(60, 40 * SEG)
    const r = transicionar(s, { tipo: 'recuperar' }, em(42 * SEG))
    expect(r.sessao?.acumuladoSeg).toBe(40)
    expect(intervaloNaoContadoSeg(r.sessao as Sessao)).toBe(2)
  })

  it('sem intervalo, não guarda pausa detectada', () => {
    const s = rodando(60, 40 * SEG)
    const r = transicionar(s, { tipo: 'recuperar' }, em(40 * SEG))
    expect(r.sessao?.pausaDetectadaEm).toBeNull()
  })

  it('pausada ou aguardando: não muda nada', () => {
    const pausada = aplicar(rodando(60, 5 * SEG), { tipo: 'pausar' }, 5 * SEG)
    expect(transicionar(pausada, { tipo: 'recuperar' }, em(MIN)).alterada).toBe(false)
    const aguardando = aplicar(rodando(60, 5 * SEG), { tipo: 'encerrar' }, 5 * SEG)
    expect(transicionar(aguardando, { tipo: 'recuperar' }, em(MIN)).alterada).toBe(false)
  })

  it('"Encerrar e revisar" vai para a confirmação como recuperado', () => {
    let s = aplicar(rodando(60, 40 * SEG), { tipo: 'recuperar' }, 10 * MIN)
    s = aplicar(s, { tipo: 'encerrarRecuperada' }, 11 * MIN)
    expect(s).toMatchObject({
      estado: 'aguardando_confirmacao',
      tipoEncerramento: 'recuperado',
      acumuladoSeg: 40,
      fimEm: em(40 * SEG).toISOString(),
      pausaDetectadaEm: null,
    })
  })

  it('"Encerrar e revisar" só vale para sessão pausada', () => {
    const s = rodando(60, 5 * SEG)
    expect(transicionar(s, { tipo: 'encerrarRecuperada' }, em(6 * SEG)).alterada).toBe(false)
  })

  it('"Continuar" volta a contar a partir de agora', () => {
    let s = aplicar(rodando(60, 40 * SEG), { tipo: 'recuperar' }, 10 * MIN)
    s = aplicar(s, { tipo: 'continuar' }, 11 * MIN)
    expect(s.motivoPausaAutomatica).toBeNull()
    expect(s.pausaDetectadaEm).toBeNull()
    expect(tempoContadoMs(s, em(12 * MIN))).toBe(40 * SEG + MIN)
  })
})

describe('"Contar esse tempo"', () => {
  it('soma o intervalo não contado e continua pausada', () => {
    let s = aplicar(rodando(60, 20 * SEG), { tipo: 'tick' }, 20 * SEG + 5 * MIN)
    s = aplicar(s, { tipo: 'contarIntervalo' }, 6 * MIN)
    expect(s).toMatchObject({
      estado: 'pausado',
      acumuladoSeg: 320,
      ultimoHeartbeatEm: em(20 * SEG + 5 * MIN).toISOString(),
      pausaDetectadaEm: null,
      motivoPausaAutomatica: null,
    })
    expect(intervaloNaoContadoSeg(s)).toBe(0)
    // Encerrada depois, o término é o fim do intervalo somado.
    s = aplicar(s, { tipo: 'encerrar' }, 7 * MIN)
    expect(s.fimEm).toBe(em(20 * SEG + 5 * MIN).toISOString())
  })

  it('limita ao planejado e conclui', () => {
    let s = aplicar(rodando(2, 20 * SEG), { tipo: 'tick' }, 20 * SEG + 5 * MIN)
    s = aplicar(s, { tipo: 'contarIntervalo' }, 6 * MIN)
    expect(s).toMatchObject({
      estado: 'aguardando_confirmacao',
      tipoEncerramento: 'concluido',
      acumuladoSeg: 120,
      fimEm: em(2 * MIN).toISOString(),
    })
  })

  it('sem pausa automática não faz nada', () => {
    const s = aplicar(rodando(60, 5 * SEG), { tipo: 'pausar' }, 5 * SEG)
    expect(transicionar(s, { tipo: 'contarIntervalo' }, em(MIN)).alterada).toBe(false)
    expect(intervaloNaoContadoSeg(rodando(60))).toBe(0)
  })
})

describe('decidirAoAssumir', () => {
  it('abertura com sessão em andamento: recupera e abre o modal', () => {
    expect(decidirAoAssumir('abertura', rodando(60))).toEqual({
      evento: { tipo: 'recuperar' },
      abrirRecuperacao: true,
    })
  })

  it('abertura com sessão pausada: só abre o modal', () => {
    const s = aplicar(rodando(60), { tipo: 'pausar' }, SEG)
    expect(decidirAoAssumir('abertura', s)).toEqual({ evento: null, abrirRecuperacao: true })
  })

  it('abertura aguardando confirmação: a confirmação abre pelo estado', () => {
    const s = aplicar(rodando(60), { tipo: 'encerrar' }, SEG)
    expect(decidirAoAssumir('abertura', s)).toEqual({ evento: null, abrirRecuperacao: false })
  })

  it('abertura sem sessão e sucessão: nada', () => {
    expect(decidirAoAssumir('abertura', null)).toEqual({ evento: null, abrirRecuperacao: false })
    expect(decidirAoAssumir('sucessao', rodando(60))).toEqual({
      evento: null,
      abrirRecuperacao: false,
    })
  })
})

describe('montarRegistro e podeGravar (RN21, RN22)', () => {
  const dados = { id: 'r1', objetivoId: 'o1', fuso: 'America/Sao_Paulo', agora: em(30 * MIN) }

  it('monta o registro do cronômetro', () => {
    const s = aplicar(rodando(60, 23 * MIN), { tipo: 'encerrar' }, 23 * MIN)
    expect(podeGravar(s)).toBe(true)
    expect(montarRegistro(s, dados)).toEqual({
      id: 'r1',
      materiaId: 'm1',
      objetivoId: 'o1',
      data: '2026-11-22',
      inicio: em(0).toISOString(),
      fim: em(23 * MIN).toISOString(),
      duracaoSeg: 23 * 60,
      duracaoPlanejadaMin: 60,
      origem: 'cronometro',
      tipoEncerramento: 'antecipado',
      excluidoEm: null,
      criadoEm: em(30 * MIN).toISOString(),
      atualizadoEm: em(30 * MIN).toISOString(),
    })
  })

  it('arredonda os segundos para baixo', () => {
    const s = aplicar(rodando(60, 60 * SEG), { tipo: 'encerrar' }, 61.9 * SEG)
    expect(montarRegistro(s, dados)?.duracaoSeg).toBe(61)
  })

  it('menos de 60 s não pode ser gravado', () => {
    const s = aplicar(rodando(60, 55 * SEG), { tipo: 'encerrar' }, 59.9 * SEG)
    expect(podeGravar(s)).toBe(false)
    expect(montarRegistro(s, dados)).toBeNull()
  })

  it('fora da confirmação não pode ser gravado', () => {
    const s = rodando(60, 5 * MIN)
    expect(podeGravar(s)).toBe(false)
    expect(montarRegistro(s, dados)).toBeNull()
  })

  it('sessão que cruza a meia-noite conta para o dia do início, no fuso', () => {
    // 23:50 em Brasília (02:50 UTC do dia seguinte).
    const inicio = Date.parse('2026-11-23T02:50:00.000Z')
    let s = transicionar(
      null,
      { tipo: 'iniciar', materiaId: 'm1', duracaoMin: 30 },
      new Date(inicio),
    ).sessao as Sessao
    for (let t = 5 * SEG; t <= 30 * MIN; t += 5 * SEG) {
      s = transicionar(s, { tipo: 'heartbeat' }, new Date(inicio + t)).sessao as Sessao
    }
    s = transicionar(s, { tipo: 'tick' }, new Date(inicio + 30 * MIN)).sessao as Sessao
    const agora = new Date(inicio + 31 * MIN)
    expect(montarRegistro(s, { ...dados, agora })?.data).toBe('2026-11-22')
    expect(montarRegistro(s, { ...dados, agora, fuso: 'America/Noronha' })?.data).toBe('2026-11-23')
    expect(montarRegistro(s, { ...dados, agora, fuso: 'America/Rio_Branco' })?.data).toBe(
      '2026-11-22',
    )
  })
})

describe('formatarRelogio', () => {
  it.each([
    [0, '00:00'],
    [59_999, '00:59'],
    [61_000, '01:01'],
    [59 * MIN + 59 * SEG, '59:59'],
    [60 * MIN, '1:00:00'],
    [8 * 60 * MIN, '8:00:00'],
    [-5, '00:00'],
  ])('%s ms → %s', (valor, esperado) => {
    expect(formatarRelogio(valor)).toBe(esperado)
  })
})
