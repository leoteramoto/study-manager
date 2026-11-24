import { CloudAlertIcon, CloudOffIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { indicadorCabecalho } from '@/domain/backupNuvem'
import { SECAO_GOOGLE_DRIVE } from './SecaoGoogleDrive'
import { useEstadoNuvem, useNuvem, useTemTokenNuvem } from './useNuvem'

export const TEXTO_SUSPENSO = 'Backup no Drive suspenso'
export const TEXTO_RECONECTAR = 'Reconectar Google Drive'

/**
 * Indicador discreto no cabeçalho: "Backup no Drive suspenso" (RN53), com
 * link para a seção Google Drive, tem prioridade sobre "Reconectar Google
 * Drive" (RN49), que pede o token no próprio clique e envia o pendente.
 */
export function IndicadorNuvem() {
  const { orquestrador } = useNuvem()
  const estado = useEstadoNuvem()
  const temToken = useTemTokenNuvem()
  const [reconectando, setReconectando] = useState(false)

  if (!estado) return null
  const indicador = indicadorCabecalho(estado, temToken)
  if (indicador === null) return null

  if (indicador === 'suspenso') {
    return (
      <Button asChild size="sm" variant="ghost" className="text-amber-700 dark:text-amber-400">
        <Link
          to="/configuracoes"
          state={{ secao: SECAO_GOOGLE_DRIVE }}
          aria-label={`${TEXTO_SUSPENSO}: ver em Configurações`}
          title={TEXTO_SUSPENSO}
        >
          <CloudAlertIcon aria-hidden="true" />
          <span className="hidden sm:inline">{TEXTO_SUSPENSO}</span>
        </Link>
      </Button>
    )
  }

  const reconectar = () => {
    if (!orquestrador) return
    const tarefa = orquestrador.reconectar() // síncrono no clique (popup)
    setReconectando(true)
    void tarefa.finally(() => {
      setReconectando(false)
    })
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={reconectando || !orquestrador}
      aria-label={TEXTO_RECONECTAR}
      title={TEXTO_RECONECTAR}
      onClick={reconectar}
    >
      <CloudOffIcon aria-hidden="true" />
      <span className="hidden sm:inline">{TEXTO_RECONECTAR}</span>
    </Button>
  )
}
