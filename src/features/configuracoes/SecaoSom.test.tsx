import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { garantirConfiguracoesPadrao, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { tocarSom } from '@/features/cronometro/motor/alertas'
import { SecaoSom } from './SecaoSom'

vi.mock('@/features/cronometro/motor/alertas', () => ({
  tocarSom: vi.fn(() => Promise.resolve(true)),
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
})

afterEach(() => {
  db.close()
})

describe('SecaoSom (RN38)', () => {
  it('desliga o som e desabilita escolha e volume', async () => {
    render(<SecaoSom />)
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Tocar som no fim do cronômetro' }),
    )
    await waitFor(async () => {
      expect((await obterConfiguracoes())?.somAtivo).toBe(false)
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Som')).toBeDisabled()
    })
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute('data-disabled')
  })

  it('escolhe o som e ajusta o volume pelo teclado', async () => {
    render(<SecaoSom />)
    await userEvent.selectOptions(await screen.findByLabelText('Som'), 'digital')
    await waitFor(async () => {
      expect((await obterConfiguracoes())?.somId).toBe('digital')
    })
    const volume = screen.getByRole('slider', { name: 'Volume' })
    expect(volume).toHaveAttribute('aria-valuenow', '70')
    volume.focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(async () => {
      expect((await obterConfiguracoes())?.volume).toBe(0.75)
    })
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(volume).toHaveFocus()
  })

  it('"Testar" toca o som escolhido mesmo com o som desligado', async () => {
    await db.configuracoes.update('app', { somAtivo: false, somId: 'suave', volume: 0.4 })
    render(<SecaoSom />)
    await userEvent.click(await screen.findByRole('button', { name: 'Testar' }))
    expect(tocarSom).toHaveBeenCalledWith({ somAtivo: true, somId: 'suave', volume: 0.4 })
  })
})
