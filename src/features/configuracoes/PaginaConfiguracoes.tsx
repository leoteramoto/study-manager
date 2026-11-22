import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { EmConstrucao } from '@/components/EmConstrucao'
import { SecaoNotificacoes } from './SecaoNotificacoes'

export function PaginaConfiguracoes() {
  return (
    <>
      <CabecalhoPagina titulo="Configurações" />
      <div className="grid max-w-3xl gap-6">
        <SecaoNotificacoes />
        {/* Fuso, som, armazenamento e backup chegam na Fase 6. */}
        <EmConstrucao fase={6} />
      </div>
    </>
  )
}
