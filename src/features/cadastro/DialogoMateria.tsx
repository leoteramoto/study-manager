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
import { Textarea } from '@/components/ui/textarea'
import { mensagemDeErro } from '@/db/erros'
import { criarMateria, editarMateria } from '@/db/materiasRepositorio'
import type { Materia, Objetivo } from '@/db/tipos'
import { esquemaMateria, TAMANHO_MAXIMO_DESCRICAO, TAMANHO_MAXIMO_NOME } from '@/domain/cadastro'
import { gerarCodigo, normalizarNome } from '@/domain/codigo'
import { errosPorCampo } from '@/lib/formulario'
import { SeletorCor } from './SeletorCor'

interface Props {
  objetivo: Objetivo
  /** Ausente ao criar; presente ao editar. */
  materia?: Materia
  /** Cor sugerida para uma matéria nova (rodízio da paleta). */
  corInicial: string
  onFechar: () => void
}

/** Criar ou editar matéria. O objetivo é fixo (RN02) e o código é gerado (RN03). */
export function DialogoMateria({ objetivo, materia, corInicial, onFechar }: Props) {
  const id = useId()
  const [nome, setNome] = useState(materia?.nome ?? '')
  const [descricao, setDescricao] = useState(materia?.descricao ?? '')
  const [cor, setCor] = useState(materia?.cor ?? corInicial)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const codigo = normalizarNome(nome) ? gerarCodigo(nome, objetivo.sigla) : '—'

  async function salvar(evento: SyntheticEvent) {
    evento.preventDefault()
    setErro(null)
    const dados = { nome, descricao, cor }
    const validacao = esquemaMateria.safeParse(dados)
    if (!validacao.success) {
      setErros(errosPorCampo(validacao.error))
      return
    }
    setErros({})
    setSalvando(true)
    try {
      if (materia) await editarMateria(materia.id, dados)
      else await criarMateria(objetivo.id, dados)
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
            <DialogTitle>{materia ? 'Editar matéria' : 'Nova matéria'}</DialogTitle>
            <DialogDescription>
              Objetivo: {objetivo.nome} ({objetivo.sigla}). O objetivo de uma matéria não pode ser
              alterado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-nome`}>Nome</Label>
            <Input
              id={`${id}-nome`}
              value={nome}
              maxLength={TAMANHO_MAXIMO_NOME}
              aria-invalid={erros.nome ? true : undefined}
              aria-describedby={`${id}-codigo${erros.nome ? ` ${id}-nome-erro` : ''}`}
              onChange={(e) => {
                setNome(e.target.value)
              }}
            />
            <p id={`${id}-codigo`} className="text-sm text-muted-foreground">
              Código: <span className="font-medium text-foreground">{codigo}</span>
            </p>
            {erros.nome && (
              <p id={`${id}-nome-erro`} className="text-sm text-destructive">
                {erros.nome}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-descricao`}>Descrição (opcional)</Label>
            <Textarea
              id={`${id}-descricao`}
              value={descricao}
              maxLength={TAMANHO_MAXIMO_DESCRICAO}
              aria-invalid={erros.descricao ? true : undefined}
              aria-describedby={erros.descricao ? `${id}-descricao-erro` : undefined}
              onChange={(e) => {
                setDescricao(e.target.value)
              }}
            />
            {erros.descricao && (
              <p id={`${id}-descricao-erro`} className="text-sm text-destructive">
                {erros.descricao}
              </p>
            )}
          </div>

          <SeletorCor valor={cor} onChange={setCor} />
          {erros.cor && <p className="text-sm text-destructive">{erros.cor}</p>}

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
              {materia ? 'Salvar' : 'Criar matéria'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
