import { useContext } from 'react'
import { ContextoTema, type ValorContextoTema } from './contextoTema'

export function useTema(): ValorContextoTema {
  const valor = useContext(ContextoTema)
  if (!valor) throw new Error('useTema precisa estar dentro de <ProvedorTema>')
  return valor
}
