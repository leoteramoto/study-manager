import { CloudDownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MENSAGEM_SESSAO_ATIVA } from '@/db/backupRepositorio'
import { mensagemDeErro } from '@/db/erros'
import type { BackupNuvem } from '@/domain/backupNuvem'
import { formatarDataHoraNoFuso } from '@/domain/tempo'
import { DialogoRestauracao } from '@/features/backup/DialogoRestauracao'
import { useRestauracao } from '@/features/backup/useRestauracao'
import { useNuvem } from './useNuvem'

interface Props {
  fuso: string
}

const formatoNumero = new Intl.NumberFormat('pt-BR')

function textoResumo(backup: BackupNuvem): string {
  const { resumo } = backup
  if (!resumo) return 'Resumo não informado pelo Drive.'
  return `Informado pelo Drive, ainda não conferido: ${formatoNumero.format(resumo.objetivos)} objetivos, ${formatoNumero.format(resumo.materias)} matérias, ${formatoNumero.format(resumo.registros)} registros.`
}

/**
 * "Restaurar do Google Drive" (RN47): lista os backups da pasta e passa o
 * escolhido pelo mesmo fluxo da restauração por arquivo (validação, resumo
 * do arquivo validado, cópia dos dados atuais, substituição, "Recarregar").
 */
export function RestaurarDoDrive({ fuso }: Props) {
  const { orquestrador } = useNuvem()
  const fluxo = useRestauracao('normal')
  const [buscando, setBuscando] = useState(false)
  const [lista, setLista] = useState<BackupNuvem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const abrirLista = () => {
    if (!orquestrador) return
    const busca = orquestrador.listarBackupsParaRestaurar() // síncrono no clique (popup)
    setErro(null)
    fluxo.limparErro()
    setBuscando(true)
    void busca
      .then(setLista, (falha: unknown) => {
        setErro(mensagemDeErro(falha))
      })
      .finally(() => {
        setBuscando(false)
      })
  }

  const escolher = (backup: BackupNuvem) => {
    if (!orquestrador) return
    // Síncrono no clique (popup, se o token venceu); o fluxo espera o download.
    const download = orquestrador.baixarBackupParaRestaurar(backup.id)
    download.catch(() => undefined) // o erro é tratado pelo fluxo
    setLista(null)
    void fluxo.iniciar('drive', () => download)
  }

  const mensagemErro = erro ?? fluxo.erro
  return (
    <div className="grid gap-3">
      {mensagemErro && (
        <AvisoErro
          mensagem={mensagemErro}
          onFechar={() => {
            setErro(null)
            fluxo.limparErro()
          }}
        />
      )}
      <div>
        <Button
          variant="outline"
          disabled={buscando || fluxo.bloqueado || !orquestrador}
          onClick={abrirLista}
        >
          <CloudDownloadIcon aria-hidden="true" />
          {buscando ? 'Buscando backups…' : 'Restaurar do Google Drive'}
        </Button>
      </div>
      {fluxo.bloqueado && <p className="text-muted-foreground text-sm">{MENSAGEM_SESSAO_ATIVA}</p>}

      <Dialog
        open={lista !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setLista(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backups no Google Drive</DialogTitle>
            <DialogDescription>
              O resumo de cada backup é a informação gravada no Drive, ainda não conferida. O app
              confere o arquivo escolhido antes de restaurar.
            </DialogDescription>
          </DialogHeader>
          {lista?.length === 0 ? (
            <p className="text-sm">
              Nenhum backup do Study Manager foi encontrado na pasta do Google Drive.
            </p>
          ) : (
            <ul className="grid max-h-[60vh] gap-2 overflow-y-auto" aria-label="Backups no Drive">
              {lista?.map((backup) => {
                const enviadoEm = formatarDataHoraNoFuso(backup.modificadoEm, fuso)
                return (
                  <li
                    key={backup.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="grid min-w-0 gap-0.5 text-sm">
                      <span className="font-medium">Enviado em {enviadoEm}</span>
                      <span className="text-muted-foreground">{textoResumo(backup)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Restaurar o backup enviado em ${enviadoEm}`}
                      onClick={() => {
                        escolher(backup)
                      }}
                    >
                      Restaurar
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <DialogoRestauracao fluxo={fluxo} fuso={fuso} />
    </div>
  )
}
