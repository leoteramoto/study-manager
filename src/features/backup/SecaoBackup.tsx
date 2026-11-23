import { useLiveQuery } from 'dexie-react-hooks'
import { DatabaseBackupIcon, DownloadIcon } from 'lucide-react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { formatarDataHoraNoFuso } from '@/domain/tempo'
import { RestaurarBackup } from './RestaurarBackup'
import { useExportarBackup } from './useExportarBackup'

/** Exportação e restauração de backup (RN32, RN33), em Configurações. */
export function SecaoBackup() {
  const configuracoes = useLiveQuery(obterConfiguracoes)
  const { exportar, exportando, erro, limparErro } = useExportarBackup()

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <DatabaseBackupIcon className="size-4" aria-hidden="true" />
            Backup
          </h2>
        </CardTitle>
        <CardDescription>
          Seus dados ficam só neste navegador. Guarde um arquivo de backup com frequência.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {configuracoes && (
          <>
            <p className="text-sm" data-testid="ultimo-backup">
              <span className="font-medium">Último backup: </span>
              {configuracoes.ultimoBackupEm
                ? formatarDataHoraNoFuso(configuracoes.ultimoBackupEm, configuracoes.fusoHorario)
                : 'nenhum backup feito ainda.'}
            </p>
            <div className="grid gap-3">
              {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
              <div>
                <Button disabled={exportando} onClick={() => void exportar()}>
                  <DownloadIcon aria-hidden="true" />
                  Exportar backup
                </Button>
              </div>
            </div>
            <RestaurarBackup modo="normal" fuso={configuracoes.fusoHorario} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
