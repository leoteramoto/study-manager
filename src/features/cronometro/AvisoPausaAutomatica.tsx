import { PauseCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { intervaloNaoContadoSeg } from '@/domain/cronometro'
import { formatarDuracaoCurta } from '@/domain/tempo'
import type { CausaPausa } from './contextoCronometro'
import { useCronometro } from './useCronometro'

const MENSAGENS: Record<CausaPausa, string> = {
  congelamento: 'Estudo pausado porque o navegador congelou a aba',
  descarte: 'Estudo pausado porque o navegador descarregou a aba',
}

/**
 * Aviso de pausa automática (RN19, RN20) com a opção de somar o intervalo
 * não contado ("Contar esse tempo"). Nada é somado sem o clique.
 */
export function AvisoPausaAutomatica() {
  const { sessao, causaPausa, contarIntervalo } = useCronometro()
  if (!sessao?.motivoPausaAutomatica) return null

  const naoContadoSeg = intervaloNaoContadoSeg(sessao)
  const mensagem =
    causaPausa !== null
      ? MENSAGENS[causaPausa]
      : sessao.motivoPausaAutomatica === 'suspensao'
        ? 'Estudo pausado porque o computador ficou inativo'
        : 'O app foi fechado ou recarregado durante a sessão'

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <PauseCircleIcon className="size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-48 flex-1">
        <p className="font-medium">{mensagem}</p>
        {naoContadoSeg > 0 && (
          <p className="text-muted-foreground">
            {formatarDuracaoCurta(naoContadoSeg)} não foram contados. Some esse tempo só se você
            estudou nesse intervalo.
          </p>
        )}
      </div>
      {naoContadoSeg > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void contarIntervalo()
          }}
        >
          Contar esse tempo
        </Button>
      )}
    </div>
  )
}
