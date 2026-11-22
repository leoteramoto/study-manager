import { RefreshCwIcon } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { useCronometro } from '@/features/cronometro/useCronometro'
import { aplicarNovaVersao, assinarNovaVersao, novaVersaoDisponivel } from './novaVersao'

/**
 * Aviso de nova versão do app. A atualização recarrega a página, então fica
 * bloqueada enquanto houver sessão do cronômetro.
 */
export function AvisoNovaVersao() {
  const disponivel = useSyncExternalStore(assinarNovaVersao, novaVersaoDisponivel)
  const { sessao } = useCronometro()
  if (!disponivel) return null

  const bloqueada = Boolean(sessao)
  return (
    <div role="status" className="flex items-center gap-2 text-sm">
      <span className="hidden sm:inline">
        {bloqueada
          ? 'Nova versão disponível. Encerre a sessão do cronômetro para atualizar.'
          : 'Nova versão disponível.'}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={bloqueada}
        title={bloqueada ? 'Encerre a sessão do cronômetro para atualizar' : undefined}
        onClick={() => void aplicarNovaVersao()}
      >
        <RefreshCwIcon />
        Atualizar
      </Button>
    </div>
  )
}
