import { useId, useState, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mensagemDeErro } from '@/db/erros'
import { criarObjetivo, renomearObjetivo } from '@/db/objetivosRepositorio'
import type { Objetivo } from '@/db/tipos'
import { esquemaObjetivo, esquemaRenomearObjetivo, TAMANHO_MAXIMO_NOME } from '@/domain/cadastro'
import { TAMANHO_MAXIMO_SIGLA } from '@/domain/codigo'
import { errosPorCampo } from '@/lib/formulario'

interface Props {
  /** Ausente ao criar; presente ao editar. */
  objetivo?: Objetivo
  onFechar: () => void
}

/** Criar ou renomear objetivo. A sigla fica desabilitada na edição (RN01). */
export function DialogoObjetivo({ objetivo, onFechar }: Props) {
  const id = useId()
  const [nome, setNome] = useState(objetivo?.nome ?? '')
  const [sigla, setSigla] = useState(objetivo?.sigla ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(evento: SyntheticEvent) {
    evento.preventDefault()
    setErro(null)
    const validacao = objetivo
      ? esquemaRenomearObjetivo.safeParse({ nome })
      : esquemaObjetivo.safeParse({ nome, sigla })
    if (!validacao.success) {
      setErros(errosPorCampo(validacao.error))
      return
    }
    setErros({})
    setSalvando(true)
    try {
      if (objetivo) await renomearObjetivo(objetivo.id, nome)
      else await criarObjetivo({ nome, sigla })
      onFechar()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) onFechar()
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            void salvar(e)
          }}
        >
          <DialogHeader>
            <DialogTitle>{objetivo ? 'Editar objetivo' : 'Novo objetivo'}</DialogTitle>
            <DialogDescription>
              Um objetivo agrupa matérias, por exemplo, &quot;Polícia Federal&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-nome`}>Nome</Label>
            <Input
              id={`${id}-nome`}
              value={nome}
              maxLength={TAMANHO_MAXIMO_NOME}
              aria-invalid={erros.nome ? true : undefined}
              aria-describedby={erros.nome ? `${id}-nome-erro` : undefined}
              onChange={(e) => {
                setNome(e.target.value)
              }}
            />
            {erros.nome && (
              <p id={`${id}-nome-erro`} className="text-sm text-destructive">
                {erros.nome}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-sigla`}>Sigla</Label>
            <Input
              id={`${id}-sigla`}
              value={sigla}
              disabled={objetivo !== undefined}
              maxLength={TAMANHO_MAXIMO_SIGLA}
              autoCapitalize="characters"
              className="uppercase"
              aria-invalid={erros.sigla ? true : undefined}
              aria-describedby={`${id}-sigla-dica${erros.sigla ? ` ${id}-sigla-erro` : ''}`}
              onChange={(e) => {
                setSigla(e.target.value.toLocaleUpperCase('pt-BR'))
              }}
            />
            <p id={`${id}-sigla-dica`} className="text-sm text-muted-foreground">
              {objetivo
                ? 'A sigla não pode ser alterada.'
                : `Até ${TAMANHO_MAXIMO_SIGLA} letras (A–Z) ou números. Não poderá ser alterada depois.`}
            </p>
            {erros.sigla && (
              <p id={`${id}-sigla-erro`} className="text-sm text-destructive">
                {erros.sigla}
              </p>
            )}
          </div>

          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={salvando}>
              {objetivo ? 'Salvar' : 'Criar objetivo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
