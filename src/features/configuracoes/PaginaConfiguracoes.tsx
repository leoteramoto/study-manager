import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { SecaoBackup } from '@/features/backup/SecaoBackup'
import { SecaoGoogleDrive } from '@/features/nuvem/SecaoGoogleDrive'
import { SecaoArmazenamento } from './SecaoArmazenamento'
import { SecaoFuso } from './SecaoFuso'
import { SecaoNotificacoes } from './SecaoNotificacoes'
import { SecaoSom } from './SecaoSom'

export function PaginaConfiguracoes() {
  return (
    <>
      <CabecalhoPagina titulo="Configurações" />
      <div className="grid max-w-3xl gap-6">
        <SecaoFuso />
        <SecaoSom />
        <SecaoNotificacoes />
        <SecaoArmazenamento />
        <SecaoBackup />
        <SecaoGoogleDrive />
      </div>
    </>
  )
}
