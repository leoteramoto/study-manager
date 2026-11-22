import { createContext } from 'react'
import type { PreferenciaTema } from './tema'

export interface ValorContextoTema {
  preferencia: PreferenciaTema
  escuro: boolean
  definirPreferencia: (preferencia: PreferenciaTema) => void
}

export const ContextoTema = createContext<ValorContextoTema | null>(null)
