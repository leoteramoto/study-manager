import { Timer } from 'lucide-react'

export function Marca() {
  return (
    <span className="flex items-center gap-2 text-base font-semibold">
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
        <Timer className="size-5" aria-hidden="true" />
      </span>
      Study Manager
    </span>
  )
}
