import { Link } from 'react-router'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Button } from '@/components/ui/button'

export function PaginaNaoEncontrada() {
  return (
    <>
      <CabecalhoPagina titulo="Página não encontrada" />
      <p className="text-muted-foreground mb-4">O endereço acessado não existe.</p>
      <Button asChild>
        <Link to="/">Voltar para a Principal</Link>
      </Button>
    </>
  )
}
