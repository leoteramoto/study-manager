import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ListaNavegacao } from './ListaNavegacao'

/** Menu recolhível para telas menores que 1024 px. */
export function MenuMobile() {
  const [aberto, setAberto] = useState(false)

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar w-72">
        <SheetHeader>
          <SheetTitle>Study Manager</SheetTitle>
          <SheetDescription className="sr-only">Navegação entre as telas do app</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <ListaNavegacao
            aoNavegar={() => {
              setAberto(false)
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
