import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { ITENS_NAVEGACAO } from '../navegacao'

interface Props {
  /** Chamado ao escolher um item (usado para fechar o menu no celular). */
  aoNavegar?: () => void
}

export function ListaNavegacao({ aoNavegar }: Props) {
  return (
    <nav aria-label="Navegação principal">
      <ul className="flex flex-col gap-1">
        {ITENS_NAVEGACAO.map(({ rota, rotulo, icone: Icone }) => (
          <li key={rota}>
            <NavLink
              to={rota}
              end={rota === '/'}
              onClick={aoNavegar}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
                )
              }
            >
              <Icone className="size-4 shrink-0" aria-hidden="true" />
              {rotulo}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
