import { createContext } from 'react'
import { NUVEM_DISPONIVEL } from './carregarDestino'
import type { OrquestradorNuvem } from './orquestrador'

export interface ValorNuvem {
  /** O recurso do Google Drive existe neste build (RN40). */
  disponivel: boolean
  /** `null` enquanto o código do destino carrega (ou sem o recurso). */
  orquestrador: OrquestradorNuvem | null
}

export const ContextoNuvem = createContext<ValorNuvem>({
  disponivel: NUVEM_DISPONIVEL,
  orquestrador: null,
})
