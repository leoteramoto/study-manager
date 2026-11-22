import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { mensagemDeErro } from '@/db/erros'
import { listarMateriasDisponiveis } from '@/db/materiasRepositorio'
import { listarObjetivos } from '@/db/objetivosRepositorio'
import { definirPlanejamento } from '@/db/planejamentoRepositorio'
import { ordenarPorOrdem } from '@/domain/cadastro'

interface Props {
  /** Matérias que já estão no planejamento. */
  selecionadasIniciais: readonly string[]
  onFechar: () => void
}

/** Escolha das matérias do planejamento, agrupadas por objetivo (RF03, RN06). */
export function DialogoPlanejamento({ selecionadasIniciais, onFechar }: Props) {
  const id = useId()
  const materias = useLiveQuery(listarMateriasDisponiveis)
  const objetivos = useLiveQuery(listarObjetivos)
  const [selecionadas, setSelecionadas] = useState(() => new Set(selecionadasIniciais))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const grupos = ordenarPorOrdem(objetivos ?? [])
    .filter((o) => o.ativo)
    .map((objetivo) => ({
      objetivo,
      materias: (materias ?? []).filter((m) => m.objetivoId === objetivo.id),
    }))
    .filter((grupo) => grupo.materias.length > 0)

  function alternar(materiaId: string, marcada: boolean) {
    setSelecionadas((atual) => {
      const nova = new Set(atual)
      if (marcada) nova.add(materiaId)
      else nova.delete(materiaId)
      return nova
    })
  }

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      await definirPlanejamento([...selecionadas])
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
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar planejamento</DialogTitle>
          <DialogDescription>
            Marque as matérias que entram na meta do mês. Tirar uma matéria do planejamento não
            apaga o tempo já estudado.
          </DialogDescription>
        </DialogHeader>

        {materias === undefined || objetivos === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma matéria ativa. Cadastre matérias na tela Cadastro.
          </p>
        ) : (
          <div className="grid gap-4">
            {grupos.map(({ objetivo, materias: doObjetivo }) => (
              <fieldset key={objetivo.id} className="grid gap-2">
                <legend className="mb-1 text-sm font-semibold">
                  {objetivo.nome} ({objetivo.sigla})
                </legend>
                {doObjetivo.map((materia) => {
                  const idCampo = `${id}-${materia.id}`
                  return (
                    <div key={materia.id} className="flex items-center gap-3">
                      <Checkbox
                        id={idCampo}
                        checked={selecionadas.has(materia.id)}
                        onCheckedChange={(marcada) => {
                          alternar(materia.id, marcada === true)
                        }}
                      />
                      <Label htmlFor={idCampo} className="font-normal">
                        <span
                          aria-hidden
                          className="size-3 rounded-full"
                          style={{ backgroundColor: materia.cor }}
                        />
                        {materia.codigo}
                      </Label>
                    </div>
                  )
                })}
              </fieldset>
            ))}
          </div>
        )}

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
          <Button
            type="button"
            disabled={salvando || materias === undefined}
            onClick={() => {
              void salvar()
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
