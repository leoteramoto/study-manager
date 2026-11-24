import { useLiveQuery } from 'dexie-react-hooks'
import { TriangleAlertIcon } from 'lucide-react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import { obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { DIAS_LEMBRETE_BACKUP, precisaLembreteBackup } from '@/domain/backup'
import { ultimoBackupConsiderado } from '@/domain/backupNuvem'
import { formatarDataHoraNoFuso } from '@/domain/tempo'
import { useEstadoNuvem } from '@/features/nuvem/useNuvem'
import { useAgora } from '@/lib/useAgora'
import { useExportarBackup } from './useExportarBackup'

/**
 * Faixa discreta no topo quando o backup está atrasado (RN34). Não pode ser
 * dispensada. Considera também o último envio ao Google Drive (RN50); o botão
 * continua só baixando o arquivo.
 */
export function LembreteBackup() {
  const configuracoes = useLiveQuery(obterConfiguracoes)
  const estadoNuvem = useEstadoNuvem()
  const agora = useAgora()
  const { exportar, exportando, erro, limparErro } = useExportarBackup()

  // Com o recurso do Drive ligado, espera o estado da nuvem para não piscar.
  if (!configuracoes || estadoNuvem === undefined) return null
  const ultimo = ultimoBackupConsiderado(
    configuracoes.ultimoBackupEm,
    estadoNuvem?.ultimoEnvioEm ?? null,
  )
  if (!precisaLembreteBackup(ultimo, agora)) return null

  const texto = ultimo
    ? `Seu último backup foi em ${formatarDataHoraNoFuso(ultimo, configuracoes.fusoHorario)}, há mais de ${DIAS_LEMBRETE_BACKUP} dias.`
    : 'Você ainda não fez nenhum backup dos seus dados.'

  return (
    <section aria-label="Lembrete de backup" className="bg-muted/60 border-b px-4 py-2 lg:px-8">
      {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <TriangleAlertIcon
          className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <p className="flex-1">{texto}</p>
        <Button size="sm" variant="outline" disabled={exportando} onClick={() => void exportar()}>
          Fazer backup agora
        </Button>
      </div>
    </section>
  )
}
