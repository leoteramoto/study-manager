import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/banco'
import { criarMateria } from '@/db/materiasRepositorio'
import { arquivarObjetivo, criarObjetivo } from '@/db/objetivosRepositorio'
import { PaginaCadastro } from './PaginaCadastro'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  db.close()
})

async function cenario() {
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
  await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  await criarMateria(cf.id, { nome: 'Contabilidade', descricao: '', cor: '#2563eb' })
  return { pf, cf }
}

describe('PaginaCadastro', () => {
  it('mostra o estado vazio', async () => {
    render(<PaginaCadastro />)
    expect(await screen.findByText(/Nenhum objetivo cadastrado/)).toBeInTheDocument()
  })

  it('lista objetivos e matérias com o código', async () => {
    await cenario()
    render(<PaginaCadastro />)
    expect(await screen.findByText('Polícia Federal')).toBeInTheDocument()
    expect(screen.getByText('Matemática-PF')).toBeInTheDocument()
    expect(screen.getByText('Contabilidade-CF')).toBeInTheDocument()
  })

  it('arquiva o objetivo após confirmar e o mostra com "Mostrar arquivados"', async () => {
    await cenario()
    const usuario = userEvent.setup()
    render(<PaginaCadastro />)

    await usuario.click(await screen.findByRole('button', { name: 'Arquivar Polícia Federal' }))
    const confirmacao = await screen.findByRole('alertdialog')
    expect(confirmacao).toHaveTextContent(/matéria ativa deste objetivo também será arquivada/)
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Arquivar' }))

    await waitFor(() => {
      expect(screen.queryByText('Polícia Federal')).not.toBeInTheDocument()
    })

    await usuario.click(screen.getByLabelText('Mostrar arquivados'))
    expect(await screen.findByText('Polícia Federal')).toBeInTheDocument()
    expect(screen.getByText('Arquivado')).toBeInTheDocument()
    expect(screen.getByText('Arquivada')).toBeInTheDocument()
  })

  it('reordena objetivos com os botões', async () => {
    await cenario()
    const usuario = userEvent.setup()
    render(<PaginaCadastro />)

    await usuario.click(
      await screen.findByRole('button', { name: 'Mover Carreira Fiscal para cima' }),
    )
    await waitFor(() => {
      const itens = within(screen.getByRole('list', { name: 'Objetivos' })).getAllByRole('listitem')
      expect(itens[0]).toHaveTextContent('Carreira Fiscal')
    })
    expect(screen.getByRole('button', { name: 'Mover Carreira Fiscal para cima' })).toBeDisabled()
  })

  it('mostra o erro ao desarquivar matéria de objetivo arquivado', async () => {
    const { pf } = await cenario()
    await arquivarObjetivo(pf.id)
    const usuario = userEvent.setup()
    render(<PaginaCadastro />)

    await usuario.click(await screen.findByLabelText('Mostrar arquivados'))
    await usuario.click(await screen.findByRole('button', { name: 'Desarquivar Matemática' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Desarquive o objetivo primeiro.')
  })
})
