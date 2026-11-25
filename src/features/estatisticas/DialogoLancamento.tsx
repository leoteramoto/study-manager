import { useId, useMemo, useState, type SyntheticEvent } from 'react'
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
import { editarManual, lancarManual } from '@/db/registrosRepositorio'
import type { Materia, Objetivo, Registro } from '@/db/tipos'
import { ordenarPorOrdem } from '@/domain/cadastro'
import { interpretarNumeroBr } from '@/domain/calculos'
import {
  criarEsquemaLancamento,
  materiaAceitaNoLancamento,
  MINUTOS_MAXIMOS_LANCAMENTO,
  MINUTOS_MINIMOS_LANCAMENTO,
  minutosDoLancamento,
} from '@/domain/lancamentos'
import { useComBackup } from '@/features/nuvem/useComBackup'
import { CLASSE_SELECT } from '@/lib/estilos'
import { errosPorCampo } from '@/lib/formulario'

interface Props {
  /** Data de hoje no fuso configurado (`YYYY-MM-DD`): limite do campo de data. */
  hoje: string
  materias: readonly Materia[]
  objetivos: readonly Objetivo[]
  /** Ausente ao lançar; presente ao editar um lançamento manual. */
  registro?: Registro
  onFechar: () => void
}

interface GrupoMaterias {
  objetivo: Objetivo
  materias: Materia[]
}

/**
 * Lançar ou editar um estudo manual (RN30, RN31). A data é a string
 * `YYYY-MM-DD` do campo e é gravada como veio, sem passar por `Date`.
 */
export function DialogoLancamento({ hoje, materias, objetivos, registro, onFechar }: Props) {
  const id = useId()
  const [data, setData] = useState(registro?.data ?? hoje)
  const [minutos, setMinutos] = useState(
    registro ? String(minutosDoLancamento(registro.duracaoSeg)) : '',
  )
  const [materiaId, setMateriaId] = useState(registro?.materiaId ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const comBackup = useComBackup()

  const materiaAtualId = registro?.materiaId ?? null
  const { grupos, materiaAtualArquivada } = useMemo(() => {
    const objetivoPorId = new Map(objetivos.map((o) => [o.id, o]))
    const aceita = (m: Materia) =>
      materiaAceitaNoLancamento(m, objetivoPorId.get(m.objetivoId)?.ativo ?? false)
    const grupos: GrupoMaterias[] = ordenarPorOrdem(objetivos)
      .filter((o) => o.ativo)
      .map((objetivo) => ({
        objetivo,
        materias: ordenarPorOrdem(
          materias.filter((m) => m.objetivoId === objetivo.id && aceita(m)),
        ),
      }))
      .filter((g) => g.materias.length > 0)
    // Na edição, a matéria atual continua disponível mesmo arquivada.
    const atual = materias.find((m) => m.id === materiaAtualId)
    return { grupos, materiaAtualArquivada: atual && !aceita(atual) ? atual : null }
  }, [materias, objetivos, materiaAtualId])

  async function salvar(evento: SyntheticEvent) {
    evento.preventDefault()
    setErro(null)
    const dados = { data, minutos: interpretarNumeroBr(minutos) ?? Number.NaN, materiaId }
    const validacao = criarEsquemaLancamento(hoje).safeParse(dados)
    if (!validacao.success) {
      setErros(errosPorCampo(validacao.error))
      return
    }
    setErros({})
    // Ainda síncrono no submit (clique em Lançar/Salvar ou Enter num campo):
    // o pedido de token ao Google sai antes do primeiro await (RN41, RN43).
    const gravacao = comBackup(async () => {
      if (registro) await editarManual(registro.id, validacao.data)
      else await lancarManual(validacao.data)
    })
    setSalvando(true)
    try {
      await gravacao
      onFechar()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setSalvando(false)
    }
  }

  const descricaoErro = (campo: string) => (erros[campo] ? `${id}-${campo}-erro` : undefined)

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
            <DialogTitle>{registro ? 'Editar lançamento' : 'Lançar estudo manual'}</DialogTitle>
            <DialogDescription>
              O lançamento conta nas estatísticas e na tela Principal, como o tempo do cronômetro.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-data`}>Data</Label>
            <Input
              id={`${id}-data`}
              type="date"
              value={data}
              max={hoje}
              required
              aria-invalid={erros.data ? true : undefined}
              aria-describedby={descricaoErro('data')}
              onChange={(e) => {
                setData(e.target.value)
              }}
            />
            {erros.data && (
              <p id={`${id}-data-erro`} className="text-sm text-destructive">
                {erros.data}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-minutos`}>Tempo (minutos)</Label>
            <Input
              id={`${id}-minutos`}
              inputMode="numeric"
              autoComplete="off"
              value={minutos}
              placeholder={`${MINUTOS_MINIMOS_LANCAMENTO} a ${MINUTOS_MAXIMOS_LANCAMENTO}`}
              required
              aria-invalid={erros.minutos ? true : undefined}
              aria-describedby={descricaoErro('minutos')}
              onChange={(e) => {
                setMinutos(e.target.value)
              }}
            />
            {erros.minutos && (
              <p id={`${id}-minutos-erro`} className="text-sm text-destructive">
                {erros.minutos}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-materia`}>Matéria</Label>
            <select
              id={`${id}-materia`}
              className={CLASSE_SELECT}
              value={materiaId}
              required
              aria-invalid={erros.materiaId ? true : undefined}
              aria-describedby={descricaoErro('materiaId')}
              onChange={(e) => {
                setMateriaId(e.target.value)
              }}
            >
              <option value="">Escolha a matéria</option>
              {materiaAtualArquivada && (
                <option value={materiaAtualArquivada.id}>
                  {materiaAtualArquivada.codigo} (arquivada)
                </option>
              )}
              {grupos.map(({ objetivo, materias: doObjetivo }) => (
                <optgroup key={objetivo.id} label={`${objetivo.nome} (${objetivo.sigla})`}>
                  {doObjetivo.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.codigo}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {grupos.length === 0 && !materiaAtualArquivada && (
              <p className="text-sm text-muted-foreground">
                Nenhuma matéria ativa. Cadastre uma matéria na tela Cadastro.
              </p>
            )}
            {erros.materiaId && (
              <p id={`${id}-materiaId-erro`} className="text-sm text-destructive">
                {erros.materiaId}
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
              {registro ? 'Salvar' : 'Lançar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
