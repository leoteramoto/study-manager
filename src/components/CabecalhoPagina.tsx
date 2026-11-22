import { useEffect, type ReactNode } from 'react'

interface Props {
  titulo: string
  children?: ReactNode
}

/** Título da tela; também atualiza o título da aba do navegador. */
export function CabecalhoPagina({ titulo, children }: Props) {
  useEffect(() => {
    document.title = `${titulo} · Study Manager`
  }, [titulo])

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      {children}
    </div>
  )
}
