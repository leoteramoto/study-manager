// Datas no fuso configurado e formatação de durações (RN12, RN14). Funções puras.
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export interface MesAno {
  ano: number
  /** 1 a 12. */
  mes: number
}

export interface IntervaloDatas {
  /** `YYYY-MM-DD`, inclusivo. */
  inicio: string
  /** `YYYY-MM-DD`, inclusivo. */
  fim: string
}

const formatoInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/**
 * Arredonda para o inteiro mais próximo descartando o ruído de ponto flutuante
 * (ex.: 11,499999999999998 vira 11,5 antes de arredondar, e daí 12).
 */
export function arredondarSemRuido(valor: number): number {
  return Math.round(Number(valor.toPrecision(12)))
}

/** Data de calendário `YYYY-MM-DD` de um instante, no fuso informado. */
export function dataNoFuso(instante: Date, fuso: string): string {
  return format(new TZDate(instante, fuso), 'yyyy-MM-dd')
}

/** Mês e ano de um instante, no fuso informado. */
export function mesNoFuso(instante: Date, fuso: string): MesAno {
  const data = new TZDate(instante, fuso)
  return { ano: data.getFullYear(), mes: data.getMonth() + 1 }
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0')
}

/** Primeiro e último dia do mês, como datas de calendário (filtro da virada do mês, RN12). */
export function intervaloDoMes({ ano, mes }: MesAno): IntervaloDatas {
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const prefixo = `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}`
  return { inicio: `${prefixo}-01`, fim: `${prefixo}-${doisDigitos(ultimoDia)}` }
}

/** Primeiro e último dia do ano, como datas de calendário. */
export function intervaloDoAno(ano: number): IntervaloDatas {
  const prefixo = String(ano).padStart(4, '0')
  return { inicio: `${prefixo}-01-01`, fim: `${prefixo}-12-31` }
}

/** Ano de uma data `YYYY-MM-DD`, lido do texto (sem passar por `Date`). */
export function anoDaData(data: string): number {
  return Number(data.slice(0, 4))
}

/**
 * Indica se o texto é uma data de calendário `YYYY-MM-DD` que existe
 * (rejeita 2026-02-30). A conferência usa UTC, então não depende do fuso.
 */
export function dataValida(data: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!partes) return false
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  const instante = new Date(Date.UTC(ano, mes - 1, dia))
  instante.setUTCFullYear(ano) // anos 0–99 não podem virar 1900–1999
  return (
    instante.getUTCFullYear() === ano &&
    instante.getUTCMonth() === mes - 1 &&
    instante.getUTCDate() === dia
  )
}

/** "22 de novembro de 2026", a partir de uma data `YYYY-MM-DD`. */
export function formatarDataLonga(data: string): string {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number)
  return format(new Date(ano, mes - 1, dia), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
}

function formatarMinutosTotais(minutosTotais: number): string {
  const horas = Math.floor(minutosTotais / 60)
  const minutos = minutosTotais % 60
  return `${formatoInteiro.format(horas)}h${doisDigitos(minutos)}`
}

/** Minutos inteiros de uma duração, arredondados para cima sem ruído de ponto flutuante. */
function minutosParaCima(segundos: number): number {
  return Math.ceil(Number((segundos / 60).toPrecision(12)))
}

/** Minutos inteiros de uma duração, arredondados para baixo sem ruído de ponto flutuante. */
function minutosParaBaixo(segundos: number): number {
  return Math.floor(Number((segundos / 60).toPrecision(12)))
}

/** Duração no formato `4h27`, com os minutos arredondados para baixo (RN14). */
export function formatarHoras(segundos: number): string {
  return formatarMinutosTotais(minutosParaBaixo(Math.max(0, segundos)))
}

/**
 * Duração no formato `4h27`, com os minutos arredondados **para cima**.
 * Usada no tempo restante, para nunca mostrar `0h00` sem a meta estar atingida.
 */
export function formatarHorasParaCima(segundos: number): string {
  return formatarMinutosTotais(minutosParaCima(Math.max(0, segundos)))
}

/** Minutos inteiros (para baixo), no formato pt-BR (`1.234`), para colunas em minutos (RN14). */
export function formatarMinutos(segundos: number): string {
  return formatoInteiro.format(minutosParaBaixo(Math.max(0, segundos)))
}

/** Hora `HH:mm` de um instante ISO, no fuso informado. */
export function formatarHoraNoFuso(instanteIso: string, fuso: string): string {
  return format(new TZDate(new Date(instanteIso), fuso), 'HH:mm')
}

/** `22/11/2026`, a partir de uma data `YYYY-MM-DD`. */
export function formatarDataCurta(data: string): string {
  const [ano = '', mes = '', dia = ''] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Duração curta para avisos: `40 s` abaixo de 1 minuto, senão `5 min` (para baixo). */
export function formatarDuracaoCurta(segundos: number): string {
  const inteiro = Math.floor(Number(Math.max(0, segundos).toPrecision(12)))
  return inteiro < 60 ? `${inteiro} s` : `${formatarMinutos(inteiro)} min`
}
