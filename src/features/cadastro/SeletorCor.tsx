import { CheckIcon } from 'lucide-react'
import { useId } from 'react'
import { PALETA_MATERIAS } from '@/domain/cadastro'
import { cn } from '@/lib/utils'

const NOMES_CORES = [
  'Índigo',
  'Azul',
  'Ciano',
  'Verde-azulado',
  'Verde',
  'Lima',
  'Amarelo',
  'Laranja',
  'Vermelho',
  'Rosa',
  'Roxo',
  'Ardósia',
]

interface Props {
  valor: string
  onChange: (cor: string) => void
}

/** Paleta de 12 cores mais o seletor nativo para qualquer cor. */
export function SeletorCor({ valor, onChange }: Props) {
  const idOutra = useId()
  const atual = valor.toLowerCase()

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Cor</legend>
      <div className="flex flex-wrap items-center gap-2">
        {PALETA_MATERIAS.map((cor, indice) => {
          const selecionada = atual === cor
          return (
            <button
              key={cor}
              type="button"
              aria-label={NOMES_CORES[indice] ?? cor}
              aria-pressed={selecionada}
              title={NOMES_CORES[indice]}
              onClick={() => {
                onChange(cor)
              }}
              className={cn(
                'flex size-8 items-center justify-center rounded-full border-2 border-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                selecionada && 'border-foreground',
              )}
              style={{ backgroundColor: cor }}
            >
              {selecionada && <CheckIcon className="size-4 text-white" aria-hidden />}
            </button>
          )
        })}
        <span className="ml-2 flex items-center gap-2">
          <input
            id={idOutra}
            type="color"
            value={atual}
            onChange={(e) => {
              onChange(e.target.value)
            }}
            className="h-8 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <label htmlFor={idOutra} className="text-sm">
            Outra cor
          </label>
        </span>
      </div>
    </fieldset>
  )
}
