import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { EmConstrucao } from '@/components/EmConstrucao'
import { SecaoBackup } from '@/features/backup/SecaoBackup'
import { SecaoNotificacoes } from './SecaoNotificacoes'

export function PaginaConfiguracoes() {
  return (
    <>
      <CabecalhoPagina titulo="Configurações" />
      <div className="grid max-w-3xl gap-6">
        <SecaoNotificacoes />
        <SecaoBackup />
        {/* Fuso, som, armazenamento e backup chegam na Fase 6. */}
        <EmConstrucao fase={6} />
      </div>
    </>
  )
}
