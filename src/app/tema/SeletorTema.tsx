import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ehPreferenciaTema, OPCOES_TEMA } from './tema'
import { useTema } from './useTema'

const ICONES = { sistema: Monitor, claro: Sun, escuro: Moon } as const

export function SeletorTema() {
  const { preferencia, definirPreferencia } = useTema()
  const Icone = ICONES[preferencia]
  const rotuloAtual = OPCOES_TEMA.find((o) => o.valor === preferencia)?.rotulo ?? ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Tema: ${rotuloAtual}. Alterar tema`}>
          <Icone aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={preferencia}
          onValueChange={(valor) => {
            if (ehPreferenciaTema(valor)) definirPreferencia(valor)
          }}
        >
          {OPCOES_TEMA.map(({ valor, rotulo }) => {
            const IconeOpcao = ICONES[valor]
            return (
              <DropdownMenuRadioItem key={valor} value={valor}>
                <IconeOpcao aria-hidden="true" />
                {rotulo}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
