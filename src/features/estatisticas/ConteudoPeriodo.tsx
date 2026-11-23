import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Materia, Registro } from '@/db/tipos'
import {
  calcularEstatisticasDoPeriodo,
  MATERIA_DESCONHECIDA,
  NOMES_MESES,
  type Periodo,
} from '@/domain/estatisticas'
import { formatarDataCurta, formatarHoras, formatarMinutos } from '@/domain/tempo'
import { ResumoAno } from './ResumoAno'
import { TabelaHistorico } from './TabelaHistorico'
import { TabelaRanking } from './TabelaRanking'

interface Props {
  ano: number
  /** 1 a 12; `null` para a visão do ano. */
  mes: number | null
  /** Registros do ano do período (inclusive excluídos, que o domínio ignora). */
  registros: readonly Registro[]
  /** Todas as matérias, inclusive arquivadas (RN04). */
  materias: readonly Materia[]
  fuso: string
  onEditar: (registro: Registro) => void
  onExcluir: (registro: Registro, descricao: string) => void
}

function nomeDoPeriodo(periodo: Periodo): string {
  return periodo.tipo === 'ano'
    ? String(periodo.ano)
    : `${NOMES_MESES[periodo.mes - 1] ?? ''} de ${periodo.ano}`
}

/** Total do período e as tabelas do mês (RN28) ou a visão do ano (RN29). */
export function ConteudoPeriodo({
  ano,
  mes,
  registros,
  materias,
  fuso,
  onEditar,
  onExcluir,
}: Props) {
  const periodo = useMemo<Periodo>(
    () => (mes === null ? { tipo: 'ano', ano } : { tipo: 'mes', ano, mes }),
    [ano, mes],
  )
  const estatisticas = useMemo(
    () => calcularEstatisticasDoPeriodo(registros, materias, periodo),
    [registros, materias, periodo],
  )
  const materiaPorId = useMemo(() => new Map(materias.map((m) => [m.id, m])), [materias])
  const nome = nomeDoPeriodo(periodo)

  function descrever(registro: Registro): string {
    const { codigo } = materiaPorId.get(registro.materiaId) ?? MATERIA_DESCONHECIDA
    const data = formatarDataCurta(registro.data)
    return `${codigo} em ${data}, ${formatarMinutos(registro.duracaoSeg)} min`
  }

  return (
    <div className="grid gap-6">
      <Card className="w-fit min-w-56">
        <CardContent>
          <p className="text-sm text-muted-foreground">Total de {nome}</p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatarHoras(estatisticas.totalSeg)}
          </p>
        </CardContent>
      </Card>

      {estatisticas.tipo === 'ano' ? (
        <ResumoAno
          ano={ano}
          totaisPorMes={estatisticas.totaisPorMes}
          ranking={estatisticas.ranking}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Histórico</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TabelaHistorico
                registros={estatisticas.historico}
                materiaPorId={materiaPorId}
                fuso={fuso}
                onEditar={onEditar}
                onExcluir={(registro) => {
                  onExcluir(registro, descrever(registro))
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Ranking</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TabelaRanking
                itens={estatisticas.ranking}
                legenda={`Tempo total de cada matéria em ${nome}`}
                vazio="Nenhuma matéria estudada neste mês."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
