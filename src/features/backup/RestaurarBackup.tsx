import { useLiveQuery } from 'dexie-react-hooks'
import { DownloadIcon, UploadIcon } from 'lucide-react'
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
  gerarCopiaSeguranca,
  MENSAGEM_FALHA_COPIA,
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

type Etapa =
  | { tipo: 'ocioso' }
  | { tipo: 'confirmar'; backup: BackupValidado }
  | { tipo: 'restaurando'; backup: BackupValidado }
  | { tipo: 'concluido' }

/** Cópia dos dados atuais antes de substituir (RN33, passo 8). */
type Copia =
  | { situacao: 'pendente' }
  | { situacao: 'copiando' }
  | { situacao: 'baixada'; nome: string }
  | { situacao: 'falhou' }
  /** O usuário confirmou, uma segunda vez, seguir sem cópia. */
  | { situacao: 'dispensada' }

interface Props {
  /**
   * `normal`: Configurações; exige não haver sessão e que o usuário baixe a
   * cópia dos dados atuais antes de substituir (RN33).
   * `bancoComFalha`: tela de falha do banco (RN36); apaga e recria o banco,
   * sem cópia prévia, porque os dados atuais não podem ser lidos.
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
  const [copia, setCopia] = useState<Copia>({ situacao: 'pendente' })
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
      setCopia({ situacao: 'pendente' })
      setEtapa({ tipo: 'confirmar', backup })
    })
  }

  // Passo 8: a cópia é baixada por um clique próprio, antes de substituir.
  // Assim o download termina (inclusive com "perguntar onde salvar") sem
  // depender de nenhuma recarga da página.
  const baixarCopia = async () => {
    setCopia({ situacao: 'copiando' })
    try {
      const arquivo = await gerarCopiaSeguranca()
      baixarArquivo(arquivo.nome, arquivo.conteudo)
      setCopia({ situacao: 'baixada', nome: arquivo.nome })
    } catch {
      setCopia({ situacao: 'falhou' })
    }
  }

  const confirmar = async (backup: BackupValidado) => {
    setEtapa({ tipo: 'restaurando', backup })
    const ok = await executar(async () => {
      if (normal) {
        if (await existeSessaoAtiva()) throw new ErroNegocio(MENSAGEM_SESSAO_ATIVA)
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
    // As outras abas recarregam sozinhas; esta espera o clique em "Recarregar".
    avisarRestauracao()
    setEtapa({ tipo: 'concluido' })
  }

  const bloqueado = normal && sessaoAtiva === true
  const resumo =
    etapa.tipo === 'confirmar' || etapa.tipo === 'restaurando' ? resumirBackup(etapa.backup) : null
  const restaurando = etapa.tipo === 'restaurando'
  const podeSubstituir = !normal || copia.situacao === 'baixada' || copia.situacao === 'dispensada'

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
          // Só a confirmação pode ser fechada (Cancelar ou Esc). O sucesso fica
          // aberto até "Recarregar".
          if (!aberto && etapa.tipo === 'confirmar') setEtapa({ tipo: 'ocioso' })
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
                {normal ? (
                  <PassoCopia
                    copia={copia}
                    desabilitado={restaurando}
                    onBaixar={() => void baixarCopia()}
                    onDispensar={() => {
                      setCopia({ situacao: 'dispensada' })
                    }}
                  />
                ) : (
                  <p className="text-sm">
                    Não é possível fazer backup dos dados atuais antes, porque o banco não abre.
                    Eles serão apagados definitivamente.
                  </p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={restaurando}>Cancelar</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={restaurando || !podeSubstituir}
                    onClick={() => {
                      if (etapa.tipo === 'confirmar') void confirmar(etapa.backup)
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
    </div>
  )
}

interface PropsPassoCopia {
  copia: Copia
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
