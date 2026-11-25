import { DownloadIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { MENSAGEM_FALHA_COPIA } from '@/db/backupRepositorio'
import { resumirBackup } from '@/domain/backup'
import { formatarDataHoraNoFuso } from '@/domain/tempo'
import { recarregarPagina } from '@/lib/recarregar'
import { TEXTO_AVISO_DRIVE } from './textosRestauracao'
import type { CopiaRestauracao, FluxoRestauracao } from './useRestauracao'

interface Props {
  fluxo: FluxoRestauracao
  /** Fuso usado para mostrar a data do backup. */
  fuso: string
}

const formatoNumero = new Intl.NumberFormat('pt-BR')

/**
 * Confirmação e conclusão da restauração (RN33, RN47), iguais para o arquivo
 * do computador e para o Google Drive. O resumo vem sempre do arquivo já
 * validado. Nada toca o banco antes da confirmação.
 */
export function DialogoRestauracao({ fluxo, fuso }: Props) {
  const { etapa, copia, normal } = fluxo
  const resumo =
    etapa.tipo === 'confirmar' || etapa.tipo === 'restaurando' ? resumirBackup(etapa.backup) : null
  const doDrive =
    (etapa.tipo === 'confirmar' || etapa.tipo === 'restaurando') && etapa.origem === 'drive'
  const restaurando = etapa.tipo === 'restaurando'
  const podeSubstituir = !normal || copia.situacao === 'baixada' || copia.situacao === 'dispensada'

  return (
    <AlertDialog
      open={etapa.tipo !== 'ocioso'}
      onOpenChange={(aberto) => {
        // Só a confirmação pode ser fechada (Cancelar ou Esc). O sucesso fica
        // aberto até "Recarregar".
        if (!aberto && etapa.tipo === 'confirmar') fluxo.cancelar()
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(evento) => {
          if (etapa.tipo !== 'confirmar') evento.preventDefault()
        }}
      >
        {etapa.tipo === 'concluido' ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Backup restaurado</AlertDialogTitle>
              <AlertDialogDescription>
                Os dados foram substituídos com sucesso. Recarregue o app para ver os dados
                restaurados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button onClick={recarregarPagina}>Recarregar</Button>
            </AlertDialogFooter>
          </>
        ) : (
          resumo && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Restaurar este backup?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isto substituirá todos os dados atuais.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Backup de</dt>
                <dd>{formatarDataHoraNoFuso(resumo.exportadoEm, fuso)}</dd>
                <dt className="text-muted-foreground">Objetivos</dt>
                <dd>{formatoNumero.format(resumo.objetivos)}</dd>
                <dt className="text-muted-foreground">Matérias</dt>
                <dd>{formatoNumero.format(resumo.materias)}</dd>
                <dt className="text-muted-foreground">Registros</dt>
                <dd>
                  {formatoNumero.format(resumo.registros)}
                  {resumo.registrosExcluidos > 0 &&
                    ` (${formatoNumero.format(resumo.registrosExcluidos)} excluídos)`}
                </dd>
              </dl>
              {doDrive && <p className="text-sm">{TEXTO_AVISO_DRIVE}</p>}
              {normal ? (
                <PassoCopia
                  copia={copia}
                  desabilitado={restaurando}
                  onBaixar={() => void fluxo.baixarCopia()}
                  onDispensar={fluxo.dispensarCopia}
                />
              ) : (
                <p className="text-sm">
                  Não é possível fazer backup dos dados atuais antes, porque o banco não abre. Eles
                  serão apagados definitivamente.
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={restaurando}>Cancelar</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={restaurando || !podeSubstituir}
                  onClick={() => {
                    if (etapa.tipo === 'confirmar') void fluxo.confirmar(etapa.backup, etapa.origem)
                  }}
                >
                  {restaurando ? 'Restaurando…' : 'Substituir dados'}
                </Button>
              </AlertDialogFooter>
            </>
          )
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface PropsPassoCopia {
  copia: CopiaRestauracao
  desabilitado: boolean
  onBaixar: () => void
  onDispensar: () => void
}

/** Botão da cópia dos dados atuais e a situação dela. */
function PassoCopia({ copia, desabilitado, onBaixar, onDispensar }: PropsPassoCopia) {
  return (
    <div className="grid gap-2 text-sm">
      <p>Antes de substituir, baixe uma cópia dos dados atuais.</p>
      <div>
        <Button
          variant="outline"
          disabled={desabilitado || copia.situacao === 'copiando'}
          onClick={onBaixar}
        >
          <DownloadIcon aria-hidden="true" />
          Baixar cópia dos dados atuais
        </Button>
      </div>
      {copia.situacao === 'baixada' && (
        <p role="status">
          Cópia baixada: <span className="font-medium break-all">{copia.nome}</span>. Confira se o
          arquivo foi salvo antes de substituir.
        </p>
      )}
      {copia.situacao === 'falhou' && (
        <div role="alert" className="grid gap-2">
          <p className="text-destructive font-medium">{MENSAGEM_FALHA_COPIA}</p>
          <p>
            Tente de novo ou siga sem cópia. Sem cópia, os dados atuais serão perdidos
            definitivamente.
          </p>
          <div>
            <Button variant="outline" disabled={desabilitado} onClick={onDispensar}>
              Seguir sem cópia
            </Button>
          </div>
        </div>
      )}
      {copia.situacao === 'dispensada' && (
        <p role="status">Você escolheu seguir sem cópia dos dados atuais.</p>
      )}
    </div>
  )
}
