import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consultarPersistencia, solicitarPersistencia } from '@/db/armazenamento'
import { SecaoArmazenamento } from './SecaoArmazenamento'

vi.mock('@/db/armazenamento', () => ({
  consultarPersistencia: vi.fn(),
  solicitarPersistencia: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SecaoArmazenamento (RN35)', () => {
  it('mostra persistente, sem botão', async () => {
    vi.mocked(consultarPersistencia).mockResolvedValue(true)
    render(<SecaoArmazenamento />)
    expect(await screen.findByText(/^Persistente\./)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('não persistente: oferece o botão e atualiza a situação depois do pedido', async () => {
    vi.mocked(consultarPersistencia).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    vi.mocked(solicitarPersistencia).mockResolvedValue(true)
    render(<SecaoArmazenamento />)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Pedir armazenamento persistente' }),
    )
    expect(solicitarPersistencia).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/^Persistente\./)).toBeInTheDocument()
  })

  it('sem suporte à API', async () => {
    vi.mocked(consultarPersistencia).mockResolvedValue(null)
    render(<SecaoArmazenamento />)
    expect(await screen.findByText(/não informa/)).toBeInTheDocument()
  })
})
