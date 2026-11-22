import { useId, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type { Painel } from '@/domain/calculos'
import { arredondarPercentual } from '@/domain/calculos'
import { formatarDataLonga, formatarHoras, formatarHorasParaCima } from '@/domain/tempo'
import { CampoDecimal } from './CampoDecimal'

interface Props {
  hoje: string
  painel: Painel
  metaMensalHoras: number | null
  onSalvarMeta: (horas: number) => void
}

function Indicador({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="grid gap-1 px-4">
        <div className="text-sm text-muted-foreground">{titulo}</div>
        <div className="text-2xl font-semibold tabular-nums">{children}</div>
      </CardContent>
    </Card>
  )
}

const AVISOS = {
  defina_meta: 'Defina a meta mensal',
  adicione_materias: 'Adicione matérias ao planejamento',
} as const

/** Painel de indicadores do mês (RF04, RN13). */
export function PainelIndicadores({ hoje, painel, metaMensalHoras, onSalvarMeta }: Props) {
  const idMeta = useId()

  return (
    <section aria-label="Indicadores do mês" className="mb-6 grid gap-4">
      {painel.aviso && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
        >
          {AVISOS[painel.aviso]}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Indicador titulo="Hoje">
          <span className="text-lg">{formatarDataLonga(hoje)}</span>
        </Indicador>
        <Indicador titulo={<Label htmlFor={idMeta}>Meta mensal (horas)</Label>}>
          <CampoDecimal
            id={idMeta}
            rotulo="Meta mensal (horas)"
            valor={metaMensalHoras}
            placeholder="Ex.: 100"
            className="h-9 max-w-32 text-lg font-semibold"
            onSalvar={onSalvarMeta}
          />
        </Indicador>
        <Indicador titulo="Estudado no mês">{formatarHoras(painel.estudadoSeg)}</Indicador>
        <Indicador titulo="Tempo restante">
          {painel.restanteSeg === null ? '—' : formatarHorasParaCima(painel.restanteSeg)}
          {painel.atingida && (
            <Badge variant="secondary" className="ml-2 align-middle">
              Meta atingida
            </Badge>
          )}
        </Indicador>
        <Indicador titulo="% concluída">
          {painel.percentual === null
            ? '—'
            : `${arredondarPercentual(painel.percentual, painel.atingida)}%`}
        </Indicador>
        <Indicador titulo="Matérias no planejamento">{painel.quantidadeMaterias}</Indicador>
      </div>
    </section>
  )
}
