import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Direcao } from '@/domain/cadastro'

interface Props {
  /** Nome do item, usado nos rótulos acessíveis. */
  rotulo: string
  primeiro: boolean
  ultimo: boolean
  onMover: (direcao: Direcao) => void
}

/** Botões de subir e descer (RN05: sem arrastar e soltar no MVP). */
export function BotoesOrdem({ rotulo, primeiro, ultimo, onMover }: Props) {
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Mover ${rotulo} para cima`}
        title="Mover para cima"
        disabled={primeiro}
        onClick={() => {
          onMover('subir')
        }}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Mover ${rotulo} para baixo`}
        title="Mover para baixo"
        disabled={ultimo}
        onClick={() => {
          onMover('descer')
        }}
      >
        <ArrowDownIcon />
      </Button>
    </div>
  )
}
