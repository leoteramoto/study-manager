import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { EmConstrucao } from '@/components/EmConstrucao'

export function PaginaCadastro() {
  return (
    <>
      <CabecalhoPagina titulo="Cadastro" />
      <EmConstrucao fase={2} />
    </>
  )
}
