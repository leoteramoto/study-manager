import { UploadIcon } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import { MENSAGEM_SESSAO_ATIVA } from '@/db/backupRepositorio'
import { ErroNegocio } from '@/db/erros'
import { MENSAGENS_BACKUP, tamanhoBackupAceito } from '@/domain/backup'
import { DialogoRestauracao } from './DialogoRestauracao'
import { type ModoRestauracao, useRestauracao } from './useRestauracao'

interface Props {
  modo: ModoRestauracao
  /** Fuso usado para mostrar a data do backup. */
  fuso: string
}

async function lerTexto(arquivo: File): Promise<string> {
  try {
    return await arquivo.text()
  } catch {
    throw new ErroNegocio('Não foi possível ler o arquivo.')
  }
}

/** Restauração a partir de um arquivo do computador, nos passos da RN33. */
export function RestaurarBackup({ modo, fuso }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const fluxo = useRestauracao(modo)

  const escolherArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = '' // permite escolher o mesmo arquivo de novo
    if (!arquivo) return
    void fluxo.iniciar('arquivo', async () => {
      // O tamanho é conferido antes de ler o conteúdo.
      if (!tamanhoBackupAceito(arquivo.size)) throw new ErroNegocio(MENSAGENS_BACKUP.grande)
      return lerTexto(arquivo)
    })
  }

  return (
    <div className="grid gap-3">
      {fluxo.erro && <AvisoErro mensagem={fluxo.erro} onFechar={fluxo.limparErro} />}
      <input
        ref={entrada}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="arquivo-backup"
        onChange={escolherArquivo}
      />
      <div>
        <Button
          variant={fluxo.normal ? 'outline' : 'default'}
          disabled={fluxo.bloqueado}
          onClick={() => entrada.current?.click()}
        >
          <UploadIcon aria-hidden="true" />
          Restaurar de um backup
        </Button>
      </div>
      {fluxo.bloqueado && <p className="text-muted-foreground text-sm">{MENSAGEM_SESSAO_ATIVA}</p>}
      <DialogoRestauracao fluxo={fluxo} fuso={fuso} />
    </div>
  )
}
