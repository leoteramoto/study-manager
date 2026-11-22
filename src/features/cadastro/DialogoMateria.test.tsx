import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { criarMateria } from '@/db/materiasRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import type { Objetivo } from '@/db/tipos'
import { DialogoMateria } from './DialogoMateria'

let pf: Objetivo

beforeEach(async () => {
  await db.delete()
  await db.open()
  pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
})

afterEach(() => {
  db.close()
})

describe('DialogoMateria', () => {
  it('mostra o código gerado e cria a matéria com a cor escolhida', async () => {
    const usuario = userEvent.setup()
    const onFechar = vi.fn()
    render(<DialogoMateria objetivo={pf} corInicial="#4f46e5" onFechar={onFechar} />)

    expect(screen.getByText(/Objetivo: Polícia Federal \(PF\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Índigo' })).toHaveAttribute('aria-pressed', 'true')

    await usuario.type(screen.getByLabelText('Nome'), 'Matemática')
    expect(screen.getByText('Matemática-PF')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Vermelho' }))
    await usuario.click(screen.getByRole('button', { name: 'Criar matéria' }))

    await waitFor(() => {
      expect(onFechar).toHaveBeenCalled()
    })
    expect(await db.materias.toArray()).toMatchObject([
      { codigo: 'Matemática-PF', cor: '#dc2626', descricao: null, objetivoId: pf.id },
    ])
  })

  it('bloqueia renomear para um código existente', async () => {
    await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
    const portugues = await criarMateria(pf.id, {
      nome: 'Português',
      descricao: '',
      cor: '#4f46e5',
    })
    const usuario = userEvent.setup()
    const onFechar = vi.fn()
    render(
      <DialogoMateria objetivo={pf} materia={portugues} corInicial="#4f46e5" onFechar={onFechar} />,
    )

    await usuario.clear(screen.getByLabelText('Nome'))
    await usuario.type(screen.getByLabelText('Nome'), 'matemática')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Já existe uma matéria com o código/)
    expect(onFechar).not.toHaveBeenCalled()
    expect((await db.materias.get(portugues.id))?.codigo).toBe('Português-PF')
  })

  it('exige o nome', async () => {
    const usuario = userEvent.setup()
    render(<DialogoMateria objetivo={pf} corInicial="#4f46e5" onFechar={vi.fn()} />)
    await usuario.click(screen.getByRole('button', { name: 'Criar matéria' }))
    expect(screen.getByText('Informe o nome.')).toBeInTheDocument()
  })
})
