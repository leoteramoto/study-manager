import { TimerIcon } from 'lucide-react'
import { Link } from 'react-router'
import { formatarRelogio } from '@/domain/cronometro'
import { cn } from '@/lib/utils'
import { useCronometro } from './useCronometro'

const ROTULO_ESTADO = {
  em_andamento: 'Estudando',
  pausado: 'Pausado',
  aguardando_confirmacao: 'Tempo esgotado: confirme',
} as const

interface Props {
  /** Versão de uma linha, para o cabeçalho em telas pequenas. */
  compacto?: boolean
}

/** Sessão ativa visível em todas as telas (RF06). Leva à tela Principal. */
export function IndicadorSessao({ compacto = false }: Props) {
  const { sessao, materia, tempoMs } = useCronometro()
  if (!sessao) return null

  const aguardando = sessao.estado === 'aguardando_confirmacao'
  const rotulo =
    aguardando && sessao.tipoEncerramento !== 'concluido'
      ? 'Aguardando confirmação'
      : ROTULO_ESTADO[sessao.estado]

  return (
    <Link
      to="/"
      aria-label={`Sessão ativa: ${materia?.codigo ?? ''}, ${formatarRelogio(tempoMs)}, ${rotulo}`}
      className={cn(
        'flex items-center gap-3 rounded-md border px-3 text-sm transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        compacto ? 'h-9' : 'py-2',
        aguardando
          ? 'animate-pulse border-primary bg-primary text-primary-foreground'
          : 'bg-background hover:bg-accent',
      )}
    >
      <TimerIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn('min-w-0', compacto ? 'flex items-center gap-2' : 'grid')}>
        <span className="flex items-center gap-1.5 truncate font-medium">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: materia?.cor ?? 'currentColor' }}
          />
          <span className="truncate">{materia?.codigo ?? '…'}</span>
        </span>
        <span className="tabular-nums">
          {formatarRelogio(tempoMs)}
          {!compacto && <span className="ml-2 text-xs opacity-80">{rotulo}</span>}
        </span>
      </span>
    </Link>
  )
}
