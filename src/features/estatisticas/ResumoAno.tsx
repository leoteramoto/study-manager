import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NOMES_MESES, type ItemRanking, type TotalDoMes } from '@/domain/estatisticas'
import { formatarHoras } from '@/domain/tempo'
import { TabelaRanking } from './TabelaRanking'

interface Props {
  ano: number
  totaisPorMes: readonly TotalDoMes[]
  ranking: readonly ItemRanking[]
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Aba "Ano" (RN29): total de cada mês e das matérias estudadas no ano. */
export function ResumoAno({ ano, totaisPorMes, ranking }: Props) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Meses</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <caption className="sr-only">Tempo total de cada mês de {ano}</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Mês
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Tempo total
                </th>
              </tr>
            </thead>
            <tbody>
              {totaisPorMes.map(({ mes, totalSeg }) => (
                <tr key={mes} className="border-b last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {capitalizar(NOMES_MESES[mes - 1] ?? '')}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarHoras(totalSeg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Matérias do ano</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TabelaRanking
            itens={ranking}
            legenda={`Tempo total de cada matéria em ${ano}`}
            vazio="Nenhum estudo registrado neste ano."
          />
        </CardContent>
      </Card>
    </div>
  )
}
