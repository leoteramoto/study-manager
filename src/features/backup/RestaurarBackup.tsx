import { useLiveQuery } from 'dexie-react-hooks'
import { UploadIcon } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
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
import {
  existeSessaoAtiva,
  gerarBackup,
  MENSAGEM_SESSAO_ATIVA,
  restaurarBackup,
  restaurarEmBancoNovo,
  validarBackup,
} from '@/db/backupRepositorio'
import { ErroNegocio } from '@/db/erros'
import {
  type BackupValidado,
  MENSAGENS_BACKUP,
  resumirBackup,
  tamanhoBackupAceito,
} from '@/domain/backup'
import { formatarDataHoraNoFuso } from '@/domain/tempo'
import { avisarRestauracao } from '@/lib/canalRestauracao'
import { baixarArquivo } from '@/lib/download'
import { recarregarPagina } from '@/lib/recarregar'
import { useExecutar } from '@/lib/useExecutar'

/** Tempo para o usuário ler o sucesso antes da recarga automática. */
export const ESPERA_RECARGA_MS = 2500

type Etapa =
  | { tipo: 'ocioso' }
  | { tipo: 'confirmar'; backup: BackupValidado }
  | { tipo: 'restaurando'; backup: BackupValidado }
  | { tipo: 'concluido' }

interface Props {
  /**
   * `normal`: Configurações; exige não haver sessão e baixa um backup dos
   * dados atuais antes de substituir (RN33).
   * `bancoComFalha`: tela de falha do banco (RN36); apaga e recria o banco,
   * sem backup prévio, porque os dados atuais não podem ser lidos.
   */
  modo: 'normal' | 'bancoComFalha'
  /** Fuso usado para mostrar a data do backup. */
  fuso: string
}

const formatoNumero = new Intl.NumberFormat('pt-BR')

async function lerTexto(arquivo: File): Promise<string> {
  try {
    return await arquivo.text()
  } catch {
    throw new ErroNegocio('Não foi possível ler o arquivo.')
  }
}

/** Restauração de backup, nos passos da RN33. Nada toca o banco antes da confirmação. */
export function RestaurarBackup({ modo, fuso }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'ocioso' })
  const { erro, executar, limparErro } = useExecutar()
  const normal = modo === 'normal'
  // Na tela de falha o banco não abre: a consulta não é feita.
  const sessaoAtiva = useLiveQuery(() => (normal ? existeSessaoAtiva() : false), [normal])

  const escolherArquivo = async (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = '' // permite escolher o mesmo arquivo de novo
    if (!arquivo) return
    await executar(async () => {
      // Passo 1: bloqueia com sessão ativa.
      if (normal && (await existeSessaoAtiva())) throw new ErroNegocio(MENSAGEM_SESSAO_ATIVA)
      // O tamanho é conferido antes de ler o conteúdo.
      if (!tamanhoBackupAceito(arquivo.size)) throw new ErroNegocio(MENSAGENS_BACKUP.grande)
      // Passos 2 a 5.
      const backup = await validarBackup(await lerTexto(arquivo))
      setEtapa({ tipo: 'confirmar', backup })
    })
  }

  const confirmar = async (backup: BackupValidado) => {
    setEtapa({ tipo: 'restaurando', backup })
    const ok = await executar(async () => {
      if (normal) {
        if (await existeSessaoAtiva()) throw new ErroNegocio(MENSAGEM_SESSAO_ATIVA)
        // Passo 8: backup automático dos dados atuais antes de substituir.
        const seguranca = await gerarBackup()
        baixarArquivo(seguranca.nome, seguranca.conteudo)
        // Passo 9: tudo numa transação só.
        await restaurarBackup(backup.dados)
      } else {
        await restaurarEmBancoNovo(backup.dados)
      }
    })
    if (!ok) {
      setEtapa({ tipo: 'ocioso' })
      return
    }
    avisarRestauracao()
    setEtapa({ tipo: 'concluido' })
    setTimeout(recarregarPagina, ESPERA_RECARGA_MS)
  }

  const bloqueado = normal && sessaoAtiva === true
  const resumo =
    etapa.tipo === 'confirmar' || etapa.tipo === 'restaurando' ? resumirBackup(etapa.backup) : null

  return (
    <div className="grid gap-3">
      {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
      <input
        ref={entrada}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="arquivo-backup"
        onChange={(evento) => void escolherArquivo(evento)}
      />
      <div>
        <Button
          variant={normal ? 'outline' : 'default'}
          disabled={bloqueado}
          onClick={() => entrada.current?.click()}
        >
          <UploadIcon aria-hidden="true" />
          Restaurar de um backup
        </Button>
      </div>
      {bloqueado && <p className="text-muted-foreground text-sm">{MENSAGEM_SESSAO_ATIVA}</p>}

      <AlertDialog
        open={etapa.tipo !== 'ocioso'}
        onOpenChange={(aberto) => {
          if (!aberto && etapa.tipo === 'confirmar') setEtapa({ tipo: 'ocioso' })
        }}
      >
        <AlertDialogContent>
          {etapa.tipo === 'concluido' ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Backup restaurado</AlertDialogTitle>
                <AlertDialogDescription>
                  Os dados foram substituídos com sucesso. O app vai recarregar para mostrar os
                  dados restaurados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button onClick={recarregarPagina}>Recarregar agora</Button>
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
                <p className="text-sm">
                  {normal
                    ? 'Antes de substituir, o app baixa um backup dos dados atuais.'
                    : 'Não é possível fazer backup dos dados atuais antes, porque o banco não abre. Eles serão apagados definitivamente.'}
                </p>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={etapa.tipo === 'restaurando'}>
                    Cancelar
                  </AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={etapa.tipo === 'restaurando'}
                    onClick={() => {
                      if (etapa.tipo === 'confirmar') void confirmar(etapa.backup)
                    }}
                  >
                    {etapa.tipo === 'restaurando' ? 'Restaurando…' : 'Substituir dados'}
                  </Button>
                </AlertDialogFooter>
              </>
            )
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
