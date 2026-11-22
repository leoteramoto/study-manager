import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { DialogoObjetivo } from './DialogoObjetivo'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  db.close()
})

describe('DialogoObjetivo', () => {
  it('cria o objetivo com a sigla em maiúsculas', async () => {
    const usuario = userEvent.setup()
    const onFechar = vi.fn()
    render(<DialogoObjetivo onFechar={onFechar} />)

    await usuario.type(screen.getByLabelText('Nome'), 'Polícia Federal')
    await usuario.type(screen.getByLabelText('Sigla'), 'pf')
    expect(screen.getByLabelText('Sigla')).toHaveValue('PF')
    await usuario.click(screen.getByRole('button', { name: 'Criar objetivo' }))

    await waitFor(() => {
      expect(onFechar).toHaveBeenCalled()
    })
    expect(await db.objetivos.toArray()).toMatchObject([{ nome: 'Polícia Federal', sigla: 'PF' }])
  })

  it('mostra erros de validação nos campos', async () => {
    const usuario = userEvent.setup()
    render(<DialogoObjetivo onFechar={vi.fn()} />)
    await usuario.type(screen.getByLabelText('Sigla'), 'p-f')
    await usuario.click(screen.getByRole('button', { name: 'Criar objetivo' }))

    expect(screen.getByText('Informe o nome.')).toBeInTheDocument()
    expect(screen.getByText(/apenas letras/)).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
    expect(await db.objetivos.count()).toBe(0)
  })

  it('bloqueia a segunda sigla "PF" com mensagem clara', async () => {
    await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const usuario = userEvent.setup()
    const onFechar = vi.fn()
    render(<DialogoObjetivo onFechar={onFechar} />)

    await usuario.type(screen.getByLabelText('Nome'), 'Outro')
    await usuario.type(screen.getByLabelText('Sigla'), 'PF')
    await usuario.click(screen.getByRole('button', { name: 'Criar objetivo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um objetivo com a sigla PF.',
    )
    expect(onFechar).not.toHaveBeenCalled()
  })

  it('na edição, a sigla fica desabilitada e só o nome muda', async () => {
    const objetivo = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    const usuario = userEvent.setup()
    const onFechar = vi.fn()
    render(<DialogoObjetivo objetivo={objetivo} onFechar={onFechar} />)

    expect(screen.getByLabelText('Sigla')).toBeDisabled()
    expect(screen.getByText('A sigla não pode ser alterada.')).toBeInTheDocument()
    await usuario.clear(screen.getByLabelText('Nome'))
    await usuario.type(screen.getByLabelText('Nome'), 'PF 2026')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(onFechar).toHaveBeenCalled()
    })
    expect(await db.objetivos.get(objetivo.id)).toMatchObject({ nome: 'PF 2026', sigla: 'PF' })
  })
})
