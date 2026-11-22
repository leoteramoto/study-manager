import { useContext } from 'react'
import { ContextoCronometro, type ValorCronometro } from './contextoCronometro'

export function useCronometro(): ValorCronometro {
  const valor = useContext(ContextoCronometro)
  if (!valor) throw new Error('useCronometro precisa do ProvedorCronometro')
  return valor
}
