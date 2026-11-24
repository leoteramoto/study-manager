import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useContext, useSyncExternalStore } from 'react'
import { obterEstadoNuvem } from '@/db/nuvemRepositorio'
import type { EstadoNuvem } from '@/domain/backupNuvem'
import { ContextoNuvem, type ValorNuvem } from './contextoNuvem'

export function useNuvem(): ValorNuvem {
  return useContext(ContextoNuvem)
}

/**
 * Estado gravado do backup na nuvem, atualizado entre abas. Sem o recurso,
 * devolve `null` sem tocar no banco da nuvem (ele nem chega a ser criado).
 */
export function useEstadoNuvem(): EstadoNuvem | null | undefined {
  const { disponivel } = useNuvem()
  return useLiveQuery(() => (disponivel ? obterEstadoNuvem() : null), [disponivel])
}

const semAssinatura = () => () => undefined

/** Há token válido nesta aba (muda quando o token chega, vence ou é recusado). */
export function useTemTokenNuvem(): boolean {
  const { orquestrador } = useNuvem()
  const assinar = useCallback(
    (avisar: () => void) => orquestrador?.aoMudarToken(avisar) ?? semAssinatura(),
    [orquestrador],
  )
  return useSyncExternalStore(assinar, () => orquestrador?.temToken() ?? false)
}
