import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { NUVEM_DISPONIVEL } from './carregarDestino'
import { ContextoNuvem } from './contextoNuvem'
import { iniciarNuvem, orquestradorAtual } from './instancia'
import type { OrquestradorNuvem } from './orquestrador'

interface Props {
  children: ReactNode
  /** Só para testes: usa este orquestrador (o recurso conta como disponível). */
  orquestrador?: OrquestradorNuvem
}

/**
 * Entrega o orquestrador do backup na nuvem às telas. Com o recurso ligado,
 * cria o orquestrador na abertura do app; ele observa o estado e, se estiver
 * conectado, já prepara o script do Google para o próximo clique (RN41).
 */
export function ProvedorNuvem({ children, orquestrador: injetado }: Props) {
  const [carregado, setCarregado] = useState<OrquestradorNuvem | null>(orquestradorAtual)

  useEffect(() => {
    if (injetado || carregado || !NUVEM_DISPONIVEL) return
    let ativo = true
    void iniciarNuvem().then((orquestrador) => {
      if (ativo) setCarregado(orquestrador)
    })
    return () => {
      ativo = false
    }
  }, [injetado, carregado])

  const valor = useMemo(
    () => ({
      disponivel: Boolean(injetado) || NUVEM_DISPONIVEL,
      orquestrador: injetado ?? carregado,
    }),
    [injetado, carregado],
  )
  return <ContextoNuvem.Provider value={valor}>{children}</ContextoNuvem.Provider>
}
