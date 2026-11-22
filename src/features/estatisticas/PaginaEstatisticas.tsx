import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { EmConstrucao } from '@/components/EmConstrucao'

export function PaginaEstatisticas() {
  return (
    <>
      <CabecalhoPagina titulo="Estatísticas" />
      <EmConstrucao fase={5} />
    </>
  )
}
