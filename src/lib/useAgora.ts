import { useEffect, useState } from 'react'

/**
 * Instante atual, atualizado a cada minuto e quando a aba volta a ficar visível.
 * Faz a data do painel e o mês da tela Principal virarem sozinhos com o app aberto.
 */
export function useAgora(intervaloMs = 60_000): Date {
  const [agora, setAgora] = useState(() => new Date())

  useEffect(() => {
    const atualizar = () => {
      setAgora(new Date())
    }
    const id = setInterval(atualizar, intervaloMs)
    document.addEventListener('visibilitychange', atualizar)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', atualizar)
    }
  }, [intervaloMs])

  return agora
}
