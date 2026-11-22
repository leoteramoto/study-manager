import { useCallback, useState } from 'react'
import { mensagemDeErro } from '@/db/erros'

export type Executar = (acao: () => Promise<unknown>) => Promise<boolean>

/** Executa ações que gravam no banco e guarda a mensagem amigável do último erro. */
export function useExecutar() {
  const [erro, setErro] = useState<string | null>(null)

  const executar = useCallback<Executar>(async (acao) => {
    setErro(null)
    try {
      await acao()
      return true
    } catch (e) {
      setErro(mensagemDeErro(e))
      return false
    }
  }, [])

  const limparErro = useCallback(() => {
    setErro(null)
  }, [])

  return { erro, executar, limparErro }
}
