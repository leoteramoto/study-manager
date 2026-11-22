import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { EmConstrucao } from '@/components/EmConstrucao'

export function PaginaPrincipal() {
  return (
    <>
      <CabecalhoPagina titulo="Principal" />
      <EmConstrucao fase={3} />
    </>
  )
}
