import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvisoIframe } from './AvisoIframe'

describe('AvisoIframe', () => {
  it('mostra só o aviso, sem botões nem links', () => {
    render(<AvisoIframe />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'O Study Manager não abre dentro de outra página',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/não funciona dentro de um quadro/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
