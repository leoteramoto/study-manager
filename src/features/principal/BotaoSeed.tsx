import { DatabaseIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { popularDadosDeTeste } from '@/db/seedDesenvolvimento'
import type { Executar } from '@/lib/useExecutar'

/** Só existe em desenvolvimento: a tela Principal o importa sob `import.meta.env.DEV`. */
export function BotaoSeed({ executar }: { executar: Executar }) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        void executar(() => popularDadosDeTeste())
      }}
    >
      <DatabaseIcon />
      Popular dados de teste
    </Button>
  )
}
