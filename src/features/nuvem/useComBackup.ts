import { useCallback } from 'react'
import { executarComBackup } from './orquestrador'
import { useNuvem } from './useNuvem'

export type ComBackup = <T>(acao: () => Promise<T>) => Promise<T>

/**
 * Envolve uma ação local que dispara o backup na nuvem (RN43). Chamar de forma
 * síncrona no handler do clique ou do submit. Sem o recurso, só executa a ação.
 */
export function useComBackup(): ComBackup {
  const { disponivel, orquestrador } = useNuvem()
  return useCallback(
    <T>(acao: () => Promise<T>) => executarComBackup(orquestrador, acao, { disponivel }),
    [orquestrador, disponivel],
  )
}
