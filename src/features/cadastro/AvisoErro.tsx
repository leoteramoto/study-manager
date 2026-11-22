import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  mensagem: string
  onFechar: () => void
}

export function AvisoErro({ mensagem, onFechar }: Props) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
    >
      <p className="flex-1">{mensagem}</p>
      <Button variant="ghost" size="icon-xs" aria-label="Fechar aviso" onClick={onFechar}>
        <XIcon />
      </Button>
    </div>
  )
}
