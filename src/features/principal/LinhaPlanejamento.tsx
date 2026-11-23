import { XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CodigoMateria } from '@/components/CodigoMateria'
import { Button } from '@/components/ui/button'
import type { LinhaPlanejamento as Linha } from '@/domain/calculos'
import { arredondarPercentual } from '@/domain/calculos'
import { formatarHoras, formatarHorasParaCima, formatarMinutos } from '@/domain/tempo'
import { CampoDecimal } from './CampoDecimal'

interface Props {
  linha: Linha
  onSalvarPeso: (materiaId: string, peso: number) => void
  onRemover: (materiaId: string) => void
}

export function LinhaPlanejamento({ linha, onSalvarPeso, onRemover }: Props) {
  return (
    <tr className="border-b last:border-0" data-atingida={linha.atingida || undefined}>
      <td className="px-3 py-2 font-medium tabular-nums">
        {linha.percentual === null
          ? '—'
          : `${arredondarPercentual(linha.percentual, linha.atingida)}%`}
      </td>
      <td className="px-3 py-2">
        <CampoDecimal
          rotulo={`Peso de ${linha.codigo}`}
          valor={linha.peso}
          className="h-8 w-20"
          onSalvar={(peso) => {
            onSalvarPeso(linha.materiaId, peso)
          }}
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <CodigoMateria codigo={linha.codigo} cor={linha.cor} />
      </td>
      <td className="px-3 py-2">{linha.nome}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatarMinutos(linha.estudadoSeg)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {linha.metaSeg === null ? '—' : formatarHoras(linha.metaSeg)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {linha.restanteSeg === null ? '—' : formatarHorasParaCima(linha.restanteSeg)}
        {linha.atingida && (
          <Badge variant="secondary" className="ml-2">
            Meta atingida
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remover ${linha.codigo} do planejamento`}
          onClick={() => {
            onRemover(linha.materiaId)
          }}
        >
          <XIcon />
        </Button>
      </td>
    </tr>
  )
}
