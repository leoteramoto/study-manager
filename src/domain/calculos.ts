// Metas, percentuais, tempo restante e totais do mês (RN06–RN14). Funções puras.
// Nada daqui é gravado no banco: tudo é recalculado a partir dos dados-base.
import { z } from 'zod'
import type { IntervaloDatas } from './tempo'
import { arredondarSemRuido } from './tempo'

export const PESO_MINIMO = 0.1
export const PESO_MAXIMO = 100
export const PESO_PADRAO = 1
export const META_MINIMA_HORAS = 0.5
export const META_MAXIMA_HORAS = 744

/**
 * Diferença abaixo da qual a meta conta como atingida. Absorve o ruído de
 * ponto flutuante da divisão proporcional (ex.: 100 h × 1/3).
 */
const TOLERANCIA_SEG = 1e-6

const PADRAO_NUMERO = /^\d+(?:[.,]\d+)?$/

/**
 * Converte o texto de um campo numérico. Aceita vírgula ou ponto como
 * separador decimal (os campos não têm separador de milhar). Retorna `null`
 * para texto vazio ou inválido.
 */
export function interpretarNumeroBr(texto: string): number | null {
  const limpo = texto.trim()
  if (!PADRAO_NUMERO.test(limpo)) return null
  const valor = Number(limpo.replace(',', '.'))
  return Number.isFinite(valor) ? valor : null
}

/** Arredonda o peso para 0,1 (1,25 → 1,3; 1,15 → 1,2), sem erro de ponto flutuante. */
export function arredondarPeso(valor: number): number {
  return arredondarSemRuido(valor * 10) / 10
}

/** Peso do planejamento (RN07): arredondado para 0,1 e depois limitado a 0,1–100. */
export const esquemaPeso = z
  .number({ error: 'Informe o peso.' })
  .refine(Number.isFinite, 'Informe o peso.')
  .transform(arredondarPeso)
  .pipe(
    z
      .number()
      .min(PESO_MINIMO, 'O peso deve ser no mínimo 0,1.')
      .max(PESO_MAXIMO, 'O peso deve ser no máximo 100.'),
  )

/** Meta mensal em horas (RN08). */
export const esquemaMetaMensal = z
  .number({ error: 'Informe a meta mensal.' })
  .refine(Number.isFinite, 'Informe a meta mensal.')
  .pipe(
    z
      .number()
      .min(META_MINIMA_HORAS, 'A meta mensal deve ser de no mínimo 0,5 hora.')
      .max(META_MAXIMA_HORAS, 'A meta mensal deve ser de no máximo 744 horas.'),
  )

// Formas mínimas dos dados-base usadas nos cálculos (sem depender do Dexie).
export interface RegistroParaSoma {
  materiaId: string
  data: string
  duracaoSeg: number
  excluidoEm: string | null
}

export interface ItemPlanejamentoParaCalculo {
  materiaId: string
  peso: number
}

export interface MateriaParaCalculo {
  id: string
  objetivoId: string
  nome: string
  codigo: string
  cor: string
  ordem: number
}

export interface ObjetivoParaCalculo {
  id: string
  ordem: number
}

export interface SomaDoPeriodo {
  /** Segundos estudados por matéria. */
  porMateria: Map<string, number>
  totalSeg: number
}

/**
 * Soma, em segundos, os registros não excluídos cuja `data` cai no intervalo
 * (RN12). Inclui lançamentos manuais e matérias fora do planejamento.
 */
export function somarSegundosPorMateria(
  registros: readonly RegistroParaSoma[],
  intervalo: IntervaloDatas,
): SomaDoPeriodo {
  const porMateria = new Map<string, number>()
  let totalSeg = 0
  for (const registro of registros) {
    if (registro.excluidoEm !== null) continue
    if (registro.data < intervalo.inicio || registro.data > intervalo.fim) continue
    porMateria.set(
      registro.materiaId,
      (porMateria.get(registro.materiaId) ?? 0) + registro.duracaoSeg,
    )
    totalSeg += registro.duracaoSeg
  }
  return { porMateria, totalSeg }
}

/** Meta da matéria em segundos = meta mensal × (peso ÷ soma dos pesos) (RN09). */
export function calcularMetaIndividualSeg(
  metaMensalHoras: number,
  peso: number,
  somaPesos: number,
): number {
  return (metaMensalHoras * 3600 * peso) / somaPesos
}

/** % concluída com precisão total; pode passar de 100 (RN10). `null` sem meta. */
export function calcularPercentual(estudadoSeg: number, metaSeg: number): number | null {
  if (metaSeg <= 0) return null
  return (estudadoSeg / metaSeg) * 100
}

/**
 * % para exibição: sem casas decimais, arredondamento padrão (RN10). Nunca
 * mostra 100% (ou mais) enquanto a meta não estiver atingida: 99,6% vira 99%.
 */
export function arredondarPercentual(percentual: number, atingida: boolean): number {
  const arredondado = arredondarSemRuido(percentual)
  return !atingida && arredondado >= 100 ? 99 : arredondado
}

export interface Restante {
  /** Nunca negativo (RN11). */
  restanteSeg: number
  atingida: boolean
}

/** Tempo restante = meta − estudado; negativo vira 0 e marca "meta atingida" (RN11). */
export function calcularRestante(metaSeg: number, estudadoSeg: number): Restante {
  const diferenca = metaSeg - estudadoSeg
  if (diferenca <= TOLERANCIA_SEG) return { restanteSeg: 0, atingida: true }
  return { restanteSeg: diferenca, atingida: false }
}

export interface LinhaPlanejamento {
  materiaId: string
  objetivoId: string
  codigo: string
  nome: string
  cor: string
  peso: number
  estudadoSeg: number
  /** `null` quando a meta mensal não foi definida (RN13). */
  metaSeg: number | null
  percentual: number | null
  restanteSeg: number | null
  atingida: boolean
}

export interface EntradaLinhas {
  planejamento: readonly ItemPlanejamentoParaCalculo[]
  materias: readonly MateriaParaCalculo[]
  objetivos: readonly ObjetivoParaCalculo[]
  segundosPorMateria: ReadonlyMap<string, number>
  metaMensalHoras: number | null
}

/**
 * Linhas da tabela principal (RF05): só as matérias do planejamento,
 * na ordem do objetivo e depois na ordem da matéria (RN05).
 */
export function montarLinhasPlanejamento({
  planejamento,
  materias,
  objetivos,
  segundosPorMateria,
  metaMensalHoras,
}: EntradaLinhas): LinhaPlanejamento[] {
  const materiaPorId = new Map(materias.map((m) => [m.id, m]))
  const ordemObjetivo = new Map(objetivos.map((o) => [o.id, o.ordem]))
  const itens = planejamento.flatMap((item) => {
    const materia = materiaPorId.get(item.materiaId)
    const ordem = materia ? ordemObjetivo.get(materia.objetivoId) : undefined
    return materia && ordem !== undefined ? [{ item, materia, ordemObjetivo: ordem }] : []
  })
  const somaPesos = itens.reduce((soma, { item }) => soma + item.peso, 0)

  return itens
    .sort((a, b) => a.ordemObjetivo - b.ordemObjetivo || a.materia.ordem - b.materia.ordem)
    .map(({ item, materia }) => {
      const estudadoSeg = segundosPorMateria.get(materia.id) ?? 0
      const metaSeg =
        metaMensalHoras === null || somaPesos <= 0
          ? null
          : calcularMetaIndividualSeg(metaMensalHoras, item.peso, somaPesos)
      const restante = metaSeg === null ? null : calcularRestante(metaSeg, estudadoSeg)
      return {
        materiaId: materia.id,
        objetivoId: materia.objetivoId,
        codigo: materia.codigo,
        nome: materia.nome,
        cor: materia.cor,
        peso: item.peso,
        estudadoSeg,
        metaSeg,
        percentual: metaSeg === null ? null : calcularPercentual(estudadoSeg, metaSeg),
        restanteSeg: restante?.restanteSeg ?? null,
        atingida: restante?.atingida ?? false,
      }
    })
}

export interface Painel {
  metaSeg: number | null
  estudadoSeg: number
  restanteSeg: number | null
  atingida: boolean
  percentual: number | null
  quantidadeMaterias: number
  aviso: 'defina_meta' | 'adicione_materias' | null
}

/**
 * Indicadores do painel (RF04). O tempo estudado é **todo** o tempo do mês,
 * inclusive de matérias fora do planejamento. Sem meta, % e restante ficam
 * vazios (RN13). Com meta e planejamento vazio, % e restante são calculados
 * normalmente e o aviso "Adicione matérias ao planejamento" continua.
 */
export function calcularPainel(
  metaMensalHoras: number | null,
  totalSeg: number,
  quantidadeMaterias: number,
): Painel {
  const metaSeg = metaMensalHoras === null ? null : metaMensalHoras * 3600
  const aviso =
    metaSeg === null ? 'defina_meta' : quantidadeMaterias === 0 ? 'adicione_materias' : null
  const restante = metaSeg === null ? null : calcularRestante(metaSeg, totalSeg)
  return {
    metaSeg,
    estudadoSeg: totalSeg,
    restanteSeg: restante?.restanteSeg ?? null,
    atingida: restante?.atingida ?? false,
    percentual: metaSeg === null ? null : calcularPercentual(totalSeg, metaSeg),
    quantidadeMaterias,
    aviso,
  }
}
