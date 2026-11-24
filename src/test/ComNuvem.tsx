// Provedor da nuvem com um orquestrador de teste, dentro de um roteador.
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import type { OrquestradorNuvem } from '@/features/nuvem/orquestrador'
import { ProvedorNuvem } from '@/features/nuvem/ProvedorNuvem'

export function ComNuvem({
  orquestrador,
  children,
  rotaInicial = '/configuracoes',
}: {
  orquestrador: OrquestradorNuvem
  children: ReactNode
  rotaInicial?: string | { pathname: string; state: unknown }
}) {
  return (
    <MemoryRouter initialEntries={[rotaInicial]}>
      <ProvedorNuvem orquestrador={orquestrador}>{children}</ProvedorNuvem>
    </MemoryRouter>
  )
}
