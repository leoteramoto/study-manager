import { CodigoMateria } from '@/components/CodigoMateria'
import type { ItemRanking } from '@/domain/estatisticas'
import { formatarHoras } from '@/domain/tempo'

interface Props {
  itens: readonly ItemRanking[]
  /** Descrição da tabela para leitores de tela. */
  legenda: string
  vazio: string
}

/** Tabela 02, ranking por matéria (RN28), também usada na visão do ano (RN29). */
export function TabelaRanking({ itens, legenda, vazio }: Props) {
  if (itens.length === 0) {
    return <p className="text-sm text-muted-foreground">{vazio}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              Matéria
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
              Tempo total
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.materiaId} className="border-b last:border-b-0">
              <td className="px-3 py-2 whitespace-nowrap">
                <CodigoMateria codigo={item.codigo} cor={item.cor} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatarHoras(item.totalSeg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
