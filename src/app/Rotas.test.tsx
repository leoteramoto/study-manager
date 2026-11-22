import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProvedorTema } from './tema/ProvedorTema'
import { CHAVE_TEMA } from './tema/tema'
import { Rotas } from './Rotas'

function renderizar(rota = '/') {
  return render(
    <ProvedorTema>
      <TooltipProvider>
        <MemoryRouter initialEntries={[rota]}>
          <Rotas />
        </MemoryRouter>
      </TooltipProvider>
    </ProvedorTema>,
  )
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('navegação', () => {
  it('abre na tela Principal', () => {
    renderizar()
    expect(screen.getByRole('heading', { level: 1, name: 'Principal' })).toBeInTheDocument()
    expect(document.title).toBe('Principal · Study Manager')
  })

  it('navega entre as 4 telas pela barra lateral', async () => {
    const usuario = userEvent.setup()
    renderizar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })

    for (const titulo of ['Cadastro', 'Estatísticas', 'Configurações', 'Principal']) {
      const link = Array.from(nav.querySelectorAll('a')).find((a) => a.textContent === titulo)
      expect(link).toBeDefined()
      await usuario.click(link as HTMLAnchorElement)
      expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
      expect(link).toHaveAttribute('aria-current', 'page')
    }
  })

  it('mostra "Página não encontrada" para rotas inexistentes', () => {
    renderizar('/nao-existe')
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
  })
})

describe('tema', () => {
  it('aplica o tema escuro escolhido no seletor e o salva', async () => {
    const usuario = userEvent.setup()
    renderizar()
    expect(document.documentElement).not.toHaveClass('dark')

    await usuario.click(screen.getByRole('button', { name: /Alterar tema/ }))
    await usuario.click(await screen.findByRole('menuitemradio', { name: 'Escuro' }))

    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('escuro')
  })
})
