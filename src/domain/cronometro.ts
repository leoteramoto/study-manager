// Máquina de estados do cronômetro (RN15–RN22). Funções puras: recebem a sessão,
// o evento e o instante atual e devolvem a nova sessão, sem tocar no banco.
//
// O tempo vem sempre do relógio (RN17): acumuladoSeg + (agora − segmentoInicioEm).
// Nenhuma função conta ticks; o tick só pede "verifique agora".
import { z } from 'zod'
import { dataNoFuso } from './tempo'

export const DURACAO_MINIMA_MIN = 1
export const DURACAO_MAXIMA_MIN = 480
/** Intervalo de atualização da tela (RN17). */
export const INTERVALO_TICK_MS = 1_000
/** Intervalo de gravação do heartbeat (RN18). */
export const INTERVALO_HEARTBEAT_MS = 5_000
/** Acima deste intervalo sem heartbeat, a sessão é tratada como suspensa (RN19). */
export const LIMITE_SUSPENSAO_MS = 30_000
/** Sessões mais curtas não podem ser gravadas (RN21). */
export const DURACAO_MINIMA_REGISTRO_SEG = 60

export type EstadoSessao = 'em_andamento' | 'pausado' | 'aguardando_confirmacao'
export type MotivoPausaAutomatica = 'suspensao' | 'recuperacao'
export type TipoEncerramentoSessao = 'concluido' | 'antecipado' | 'recuperado'

export interface Sessao {
  id: 'atual'
  materiaId: string
  duracaoPlanejadaMin: number
  /** Primeiro início. */
  inicioEm: string
  /** `null` enquanto pausada ou aguardando confirmação. */
  segmentoInicioEm: string | null
  /** Tempo dos trechos já fechados, em segundos (pode ter fração). */
  acumuladoSeg: number
  /**
   * Em andamento: último sinal de vida (RN18). Pausada: fim do último trecho
   * contado (instante da pausa), usado como término se encerrada pausada.
   */
  ultimoHeartbeatEm: string
  estado: EstadoSessao
  tipoEncerramento: TipoEncerramentoSessao | null
  fimEm: string | null
  motivoPausaAutomatica: MotivoPausaAutomatica | null
  /**
   * Instante em que o app percebeu uma pausa automática. O intervalo entre
   * `ultimoHeartbeatEm` e ele não foi contado e pode ser somado pelo usuário
   * ("Contar esse tempo"). Campo fora da especificação (ver CLAUDE.md).
   */
  pausaDetectadaEm: string | null
}

export type EventoCronometro =
  | { tipo: 'iniciar'; materiaId: string; duracaoMin: number }
  | { tipo: 'pausar' }
  | { tipo: 'continuar' }
  | { tipo: 'tick' }
  | { tipo: 'heartbeat' }
  | { tipo: 'encerrar' }
  | { tipo: 'recuperar' }
  | { tipo: 'encerrarRecuperada' }
  | { tipo: 'contarIntervalo' }
  | { tipo: 'descartar' }

export type EfeitoCronometro = 'alertaFim' | 'pausaAutomatica'

export interface ResultadoTransicao {
  sessao: Sessao | null
  efeitos: EfeitoCronometro[]
  /** `false` quando nada mudou (evento não se aplica ao estado ou tick sem novidade). */
  alterada: boolean
}

/** Duração planejada em minutos inteiros (RN15). */
export const esquemaDuracaoMin = z
  .number({ error: 'Informe a duração em minutos.' })
  .refine(Number.isFinite, 'Informe a duração em minutos.')
  .pipe(
    z
      .number()
      .int('A duração deve ser um número inteiro de minutos.')
      .min(DURACAO_MINIMA_MIN, 'A duração deve ser de no mínimo 1 minuto.')
      .max(DURACAO_MAXIMA_MIN, 'A duração deve ser de no máximo 480 minutos.'),
  )

function ms(iso: string): number {
  return Date.parse(iso)
}

function iso(instante: number): string {
  return new Date(instante).toISOString()
}

function planejadoMs(sessao: Sessao): number {
  return sessao.duracaoPlanejadaMin * 60_000
}

/** Segundos sem ruído de ponto flutuante (ex.: 1379,9999999998 → 1380). */
function semRuido(valor: number): number {
  return Number(valor.toPrecision(12))
}

/** Tempo contado da sessão, em milissegundos, limitado ao planejado (RN15, RN17). */
export function tempoContadoMs(sessao: Sessao, agora: Date): number {
  let contado = sessao.acumuladoSeg * 1000
  if (sessao.estado === 'em_andamento' && sessao.segmentoInicioEm) {
    contado += Math.max(0, agora.getTime() - ms(sessao.segmentoInicioEm))
  }
  return Math.min(contado, planejadoMs(sessao))
}

/** Segundos inteiros efetivos (para baixo), como serão gravados no registro. */
export function segundosEfetivos(sessao: Sessao, agora: Date): number {
  return Math.floor(semRuido(tempoContadoMs(sessao, agora) / 1000))
}

/** Fração do planejado já cumprida, de 0 a 1 (barra de progresso). */
export function progresso(sessao: Sessao, agora: Date): number {
  return tempoContadoMs(sessao, agora) / planejadoMs(sessao)
}

/** Intervalo não contado de uma pausa automática, em segundos (0 se não houver). */
export function intervaloNaoContadoSeg(sessao: Sessao): number {
  if (sessao.estado !== 'pausado' || !sessao.pausaDetectadaEm) return 0
  return Math.max(0, (ms(sessao.pausaDetectadaEm) - ms(sessao.ultimoHeartbeatEm)) / 1000)
}

/** Sessão pronta para virar registro: aguardando confirmação e com pelo menos 60 s (RN21). */
export function podeGravar(sessao: Sessao): boolean {
  return (
    sessao.estado === 'aguardando_confirmacao' &&
    Math.floor(semRuido(sessao.acumuladoSeg)) >= DURACAO_MINIMA_REGISTRO_SEG
  )
}

/** Leva a sessão à confirmação como `concluido`, com o tempo exatamente no planejado. */
function concluir(sessao: Sessao, fimMs: number): Sessao {
  return {
    ...sessao,
    estado: 'aguardando_confirmacao',
    tipoEncerramento: 'concluido',
    acumuladoSeg: sessao.duracaoPlanejadaMin * 60,
    segmentoInicioEm: null,
    fimEm: iso(fimMs),
    motivoPausaAutomatica: null,
    pausaDetectadaEm: null,
  }
}

/**
 * Fecha o trecho em andamento no instante `fechamentoMs`. Se o planejado já
 * tiver sido alcançado antes disso, conclui no instante exato em que acabou.
 */
function fecharTrecho(
  sessao: Sessao,
  fechamentoMs: number,
): { sessao: Sessao; concluida: boolean } {
  const inicioTrecho = sessao.segmentoInicioEm ? ms(sessao.segmentoInicioEm) : fechamentoMs
  const acumuladoMs = sessao.acumuladoSeg * 1000
  const faltamMs = planejadoMs(sessao) - acumuladoMs
  const trechoMs = Math.max(0, fechamentoMs - inicioTrecho)
  if (trechoMs >= faltamMs) {
    return { sessao: concluir(sessao, inicioTrecho + faltamMs), concluida: true }
  }
  return {
    sessao: {
      ...sessao,
      acumuladoSeg: (acumuladoMs + trechoMs) / 1000,
      segmentoInicioEm: null,
      ultimoHeartbeatEm: iso(fechamentoMs),
    },
    concluida: false,
  }
}

/**
 * Pausa automática no último heartbeat (RN19, RN20): conta só até ele e guarda
 * o instante em que a pausa foi percebida, para o "Contar esse tempo".
 */
function pausarNoHeartbeat(
  sessao: Sessao,
  agoraMs: number,
  motivo: MotivoPausaAutomatica,
): ResultadoTransicao {
  const heartbeatMs = ms(sessao.ultimoHeartbeatEm)
  const fechado = fecharTrecho(sessao, heartbeatMs)
  if (fechado.concluida) {
    return { sessao: fechado.sessao, efeitos: ['alertaFim'], alterada: true }
  }
  return {
    sessao: {
      ...fechado.sessao,
      estado: 'pausado',
      motivoPausaAutomatica: motivo,
      pausaDetectadaEm: agoraMs > heartbeatMs ? iso(agoraMs) : null,
    },
    efeitos: ['pausaAutomatica'],
    alterada: true,
  }
}

/**
 * Verificação de cada tick sobre uma sessão em andamento: primeiro a
 * suspensão (RN19), depois o fim do tempo planejado (RN15).
 */
function verificar(sessao: Sessao, agoraMs: number): ResultadoTransicao {
  if (sessao.estado !== 'em_andamento') return { sessao, efeitos: [], alterada: false }
  if (agoraMs - ms(sessao.ultimoHeartbeatEm) > LIMITE_SUSPENSAO_MS) {
    return pausarNoHeartbeat(sessao, agoraMs, 'suspensao')
  }
  const inicioTrecho = sessao.segmentoInicioEm ? ms(sessao.segmentoInicioEm) : agoraMs
  const faltamMs = planejadoMs(sessao) - sessao.acumuladoSeg * 1000
  if (agoraMs - inicioTrecho >= faltamMs) {
    return {
      sessao: concluir(sessao, inicioTrecho + faltamMs),
      efeitos: ['alertaFim'],
      alterada: true,
    }
  }
  return { sessao, efeitos: [], alterada: false }
}

function nada(sessao: Sessao | null): ResultadoTransicao {
  return { sessao, efeitos: [], alterada: false }
}

/** Junta a verificação prévia com o resultado do evento. */
function apos(previo: ResultadoTransicao, resultado: ResultadoTransicao): ResultadoTransicao {
  return {
    sessao: resultado.sessao,
    efeitos: [...previo.efeitos, ...resultado.efeitos],
    alterada: previo.alterada || resultado.alterada,
  }
}

/**
 * Aplica um evento à sessão no instante `agora` (estado + evento + agora → novo estado).
 * Eventos que não se aplicam ao estado atual são ignorados (`alterada = false`),
 * o que torna repetições inofensivas (clique duplo, duas abas).
 */
export function transicionar(
  atual: Sessao | null,
  evento: EventoCronometro,
  agora: Date,
): ResultadoTransicao {
  const agoraMs = agora.getTime()
  const agoraIso = agora.toISOString()

  if (evento.tipo === 'iniciar') {
    if (atual) return nada(atual)
    const sessao: Sessao = {
      id: 'atual',
      materiaId: evento.materiaId,
      duracaoPlanejadaMin: evento.duracaoMin,
      inicioEm: agoraIso,
      segmentoInicioEm: agoraIso,
      acumuladoSeg: 0,
      ultimoHeartbeatEm: agoraIso,
      estado: 'em_andamento',
      tipoEncerramento: null,
      fimEm: null,
      motivoPausaAutomatica: null,
      pausaDetectadaEm: null,
    }
    return { sessao, efeitos: [], alterada: true }
  }

  if (!atual) return nada(null)
  if (evento.tipo === 'descartar') return { sessao: null, efeitos: [], alterada: true }

  if (evento.tipo === 'recuperar') {
    // RN20: a sessão estava em andamento sem nenhuma aba cuidando dela.
    if (atual.estado !== 'em_andamento') return nada(atual)
    return pausarNoHeartbeat(atual, agoraMs, 'recuperacao')
  }

  // Todo evento passa antes pela verificação: um clique logo depois de acordar
  // o computador não pode contar o tempo em que ele dormiu.
  const previo = verificar(atual, agoraMs)
  // Se a verificação acabou de aplicar uma pausa automática, o evento do
  // usuário não é aplicado: a sessão fica pausada, com o aviso e o "Contar esse
  // tempo", e a decisão volta para o usuário (ex.: encerrar não vai direto para
  // a confirmação; continuar não apaga o aviso).
  if (previo.efeitos.includes('pausaAutomatica')) return previo
  const sessao = previo.sessao ?? atual

  switch (evento.tipo) {
    case 'tick':
      return previo

    case 'heartbeat':
      if (sessao.estado !== 'em_andamento') return previo
      return apos(previo, {
        sessao: { ...sessao, ultimoHeartbeatEm: agoraIso },
        efeitos: [],
        alterada: true,
      })

    case 'pausar': {
      if (sessao.estado !== 'em_andamento') return previo
      const fechado = fecharTrecho(sessao, agoraMs)
      return apos(previo, {
        sessao: fechado.concluida
          ? fechado.sessao
          : {
              ...fechado.sessao,
              estado: 'pausado',
              motivoPausaAutomatica: null,
              pausaDetectadaEm: null,
            },
        efeitos: fechado.concluida ? ['alertaFim'] : [],
        alterada: true,
      })
    }

    case 'continuar':
      if (sessao.estado !== 'pausado') return previo
      return apos(previo, {
        sessao: {
          ...sessao,
          estado: 'em_andamento',
          segmentoInicioEm: agoraIso,
          ultimoHeartbeatEm: agoraIso,
          motivoPausaAutomatica: null,
          pausaDetectadaEm: null,
        },
        efeitos: [],
        alterada: true,
      })

    case 'encerrar':
      return apos(previo, encerrar(sessao, agoraMs, 'antecipado'))

    case 'encerrarRecuperada':
      if (sessao.estado !== 'pausado') return previo
      return apos(previo, encerrar(sessao, agoraMs, 'recuperado'))

    case 'contarIntervalo': {
      const intervaloMs = intervaloNaoContadoSeg(sessao) * 1000
      if (intervaloMs <= 0) return previo
      const acumuladoMs = sessao.acumuladoSeg * 1000
      const somaMs = Math.min(intervaloMs, planejadoMs(sessao) - acumuladoMs)
      const fimTrechoMs = ms(sessao.ultimoHeartbeatEm) + somaMs
      if (acumuladoMs + somaMs >= planejadoMs(sessao)) {
        return apos(previo, { sessao: concluir(sessao, fimTrechoMs), efeitos: [], alterada: true })
      }
      return apos(previo, {
        sessao: {
          ...sessao,
          acumuladoSeg: (acumuladoMs + somaMs) / 1000,
          ultimoHeartbeatEm: iso(fimTrechoMs),
          motivoPausaAutomatica: null,
          pausaDetectadaEm: null,
        },
        efeitos: [],
        alterada: true,
      })
    }
  }
}

function encerrar(
  sessao: Sessao,
  agoraMs: number,
  tipo: Exclude<TipoEncerramentoSessao, 'concluido'>,
): ResultadoTransicao {
  if (sessao.estado === 'aguardando_confirmacao') return nada(sessao)
  // Em andamento, o trecho termina agora; pausada, terminou no instante da pausa.
  const fechado =
    sessao.estado === 'em_andamento' ? fecharTrecho(sessao, agoraMs) : { sessao, concluida: false }
  if (fechado.concluida) return { sessao: fechado.sessao, efeitos: ['alertaFim'], alterada: true }
  return {
    sessao: {
      ...fechado.sessao,
      estado: 'aguardando_confirmacao',
      tipoEncerramento: tipo,
      fimEm: fechado.sessao.ultimoHeartbeatEm,
      motivoPausaAutomatica: null,
      pausaDetectadaEm: null,
    },
    efeitos: [],
    alterada: true,
  }
}

export type ModoAssuncao = 'abertura' | 'sucessao'

export interface DecisaoAssuncao {
  /** Evento a aplicar antes de qualquer outro. */
  evento: EventoCronometro | null
  /** Abrir o modal "Sessão interrompida encontrada". */
  abrirRecuperacao: boolean
}

/**
 * O que a aba faz ao virar a líder do cronômetro.
 * - `abertura`: nenhuma aba estava com a sessão (app reaberto, F5 na única aba):
 *   aplica a recuperação (RN20) e abre o modal.
 * - `sucessao`: outra aba líder fechou e esta assumiu: segue normalmente,
 *   sem modal e sem pausa (o tick continua valendo, inclusive o RN19).
 */
export function decidirAoAssumir(modo: ModoAssuncao, sessao: Sessao | null): DecisaoAssuncao {
  if (modo === 'sucessao' || !sessao) return { evento: null, abrirRecuperacao: false }
  switch (sessao.estado) {
    case 'em_andamento':
      return { evento: { tipo: 'recuperar' }, abrirRecuperacao: true }
    case 'pausado':
      return { evento: null, abrirRecuperacao: true }
    case 'aguardando_confirmacao':
      // A confirmação abre sozinha a partir do estado (RN20).
      return { evento: null, abrirRecuperacao: false }
  }
}

export interface DadosRegistroCronometro {
  id: string
  materiaId: string
  objetivoId: string
  data: string
  inicio: string
  fim: string
  duracaoSeg: number
  duracaoPlanejadaMin: number
  origem: 'cronometro'
  tipoEncerramento: TipoEncerramentoSessao
  excluidoEm: null
  criadoEm: string
  atualizadoEm: string
}

/**
 * Monta o registro de uma sessão aguardando confirmação (RN21, RN22).
 * A data é a do início, no fuso configurado. Retorna `null` se a sessão
 * não puder ser gravada (menos de 60 s ou fora da confirmação).
 */
export function montarRegistro(
  sessao: Sessao,
  dados: { id: string; objetivoId: string; fuso: string; agora: Date },
): DadosRegistroCronometro | null {
  if (!podeGravar(sessao) || !sessao.tipoEncerramento || !sessao.fimEm) return null
  const agoraIso = dados.agora.toISOString()
  return {
    id: dados.id,
    materiaId: sessao.materiaId,
    objetivoId: dados.objetivoId,
    data: dataNoFuso(new Date(sessao.inicioEm), dados.fuso),
    inicio: sessao.inicioEm,
    fim: sessao.fimEm,
    duracaoSeg: Math.min(
      Math.floor(semRuido(sessao.acumuladoSeg)),
      sessao.duracaoPlanejadaMin * 60,
    ),
    duracaoPlanejadaMin: sessao.duracaoPlanejadaMin,
    origem: 'cronometro',
    tipoEncerramento: sessao.tipoEncerramento,
    excluidoEm: null,
    criadoEm: agoraIso,
    atualizadoEm: agoraIso,
  }
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0')
}

/** Tempo do cronômetro: `MM:SS` abaixo de 1 hora, `H:MM:SS` a partir dela. */
export function formatarRelogio(milissegundos: number): string {
  const totalSeg = Math.floor(semRuido(Math.max(0, milissegundos) / 1000))
  const horas = Math.floor(totalSeg / 3600)
  const minutos = Math.floor((totalSeg % 3600) / 60)
  const segundos = totalSeg % 60
  return horas > 0
    ? `${horas}:${doisDigitos(minutos)}:${doisDigitos(segundos)}`
    : `${doisDigitos(minutos)}:${doisDigitos(segundos)}`
}

export const ROTULOS_ENCERRAMENTO: Record<TipoEncerramentoSessao, string> = {
  concluido: 'Concluído',
  antecipado: 'Encerrado antes do fim',
  recuperado: 'Recuperado',
}
