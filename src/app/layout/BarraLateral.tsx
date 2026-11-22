import { IndicadorSessao } from '@/features/cronometro/IndicadorSessao'
import { ListaNavegacao } from './ListaNavegacao'
import { Marca } from './Marca'

/** Barra lateral fixa do desktop (≥ 1024 px). */
export function BarraLateral() {
  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r p-4 lg:flex">
      <div className="px-2 pt-1">
        <Marca />
      </div>
      <ListaNavegacao />
      <IndicadorSessao />
    </aside>
  )
}
