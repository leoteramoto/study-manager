// Estatísticas do ano e do mês (RN27–RN29). Funções puras.
//
// As somas usam a mesma função da tela Principal (`somarSegundosPorMateria`)
// sobre o mesmo filtro de datas (`intervaloDoMes`), para os totais baterem.
// Os agrupamentos usam só a `data` gravada no registro: mudar o fuso não move
// nenhum registro de mês (RN37).
import { somarSegundosPorMateria, type RegistroParaSoma } from './calculos'
import { anoDaData, intervaloDoMes, type IntervaloDatas } from './tempo'

export const MESES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const

export const NOMES_MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** Código e cor exibidos para uma matéria que não existe mais no banco. */
export const MATERIA_DESCONHECIDA = { codigo: 'Matéria não encontrada', cor: '#94a3b8' } as const

export interface RegistroParaHistorico extends RegistroParaSoma {
  id: string
  inicio: string | null
  origem: 'cronometro' | 'manual'
  criadoEm: string
}

export interface MateriaParaEstatistica {
  id: string
  codigo: string
  cor: string
}

export interface TotalDoMes {
  /** 1 a 12. */
  mes: number
  totalSeg: number
}

export interface ItemRanking {
  materiaId: string
  codigo: string
  cor: string
  totalSeg: number
}

/**
 * Anos do seletor (RN27): os anos com pelo menos um registro não excluído,
 * o ano atual e o ano selecionado (que continua na lista enquanto estiver
 * selecionado, mesmo que tenha ficado sem registros). Do mais recente ao mais antigo.
 */
export function anosDisponiveis(
  registros: Iterable<Pick<RegistroParaSoma, 'data' | 'excluidoEm'>>,
  anoAtual: number,
  anoSelecionado: number | null = null,
): number[] {
  const anos = new Set<number>([anoAtual])
  if (anoSelecionado !== null) anos.add(anoSelecionado)
  for (const registro of registros) {
    if (registro.excluidoEm === null) anos.add(anoDaData(registro.data))
  }
  return [...anos].sort((a, b) => b - a)
}

/** Total de cada um dos 12 meses do ano, inclusive os zerados (RN29). */
export function totaisPorMes(registros: readonly RegistroParaSoma[], ano: number): TotalDoMes[] {
  return MESES.map((_, indice) => {
    const mes = indice + 1
    return {
      mes,
      totalSeg: somarSegundosPorMateria(registros, intervaloDoMes({ ano, mes })).totalSeg,
    }
  })
}

function compararCodigo(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR')
}

/**
 * Ranking do período (RN28, RN29): matérias com tempo maior que zero, inclusive
 * arquivadas (RN04), da que mais estudou para a que menos; empates pelo código.
 */
export function montarRanking(
  registros: readonly RegistroParaSoma[],
  intervalo: IntervaloDatas,
  materias: readonly MateriaParaEstatistica[],
): ItemRanking[] {
  const materiaPorId = new Map(materias.map((m) => [m.id, m]))
  const { porMateria } = somarSegundosPorMateria(registros, intervalo)
  const itens: ItemRanking[] = []
  for (const [materiaId, totalSeg] of porMateria) {
    if (totalSeg <= 0) continue
    const materia = materiaPorId.get(materiaId) ?? MATERIA_DESCONHECIDA
    itens.push({ materiaId, codigo: materia.codigo, cor: materia.cor, totalSeg })
  }
  return itens.sort((a, b) => b.totalSeg - a.totalSeg || compararCodigo(a.codigo, b.codigo))
}

function compararDecrescente(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0
}

/**
 * Histórico do período (RN28): registros não excluídos, do mais recente para o
 * mais antigo. No mesmo dia, primeiro os do cronômetro (início mais recente
 * primeiro), depois os lançamentos manuais (lançado mais recente primeiro).
 */
export function montarHistorico<T extends RegistroParaHistorico>(
  registros: readonly T[],
  intervalo: IntervaloDatas,
): T[] {
  return registros
    .filter((r) => r.excluidoEm === null && r.data >= intervalo.inicio && r.data <= intervalo.fim)
    .sort((a, b) => {
      if (a.data !== b.data) return compararDecrescente(a.data, b.data)
      const manualA = a.origem === 'manual'
      const manualB = b.origem === 'manual'
      if (manualA !== manualB) return manualA ? 1 : -1
      const chaveA = manualA ? a.criadoEm : (a.inicio ?? a.criadoEm)
      const chaveB = manualB ? b.criadoEm : (b.inicio ?? b.criadoEm)
      return compararDecrescente(chaveA, chaveB) || compararDecrescente(a.id, b.id)
    })
}

/** Soma total, em segundos, dos registros não excluídos do período. */
export function totalDoPeriodo(
  registros: readonly RegistroParaSoma[],
  intervalo: IntervaloDatas,
): number {
  return somarSegundosPorMateria(registros, intervalo).totalSeg
}
