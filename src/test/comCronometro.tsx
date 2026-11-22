import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { ProvedorCronometro } from '@/features/cronometro/ProvedorCronometro'
import { fonteTicksPrincipal, type FonteTicks } from '@/features/cronometro/motor/fonteTicks'
import { criarLiderancaManual, type Lideranca } from '@/features/cronometro/motor/lideranca'

interface Opcoes {
  lideranca?: Lideranca
  fonteTicks?: FonteTicks
}

/**
 * Renderiza dentro do provedor do cronômetro, com ticks na thread principal
 * (controlados por `vi.useFakeTimers`) e a aba como líder recém-aberta.
 */
export function renderizarComCronometro(elemento: ReactElement, opcoes: Opcoes = {}): RenderResult {
  const lideranca = opcoes.lideranca ?? criarLiderancaManual({ papel: 'lider', modo: 'abertura' })
  return render(
    <MemoryRouter>
      <ProvedorCronometro
        fonteTicks={opcoes.fonteTicks ?? fonteTicksPrincipal}
        lideranca={lideranca}
      >
        {elemento}
      </ProvedorCronometro>
    </MemoryRouter>,
  )
}
