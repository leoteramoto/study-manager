import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/banco'
import { garantirConfiguracoesPadrao, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { SecaoFuso } from './SecaoFuso'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
})

afterEach(() => {
  db.close()
})

async function fusoGravado() {
  return (await obterConfiguracoes())?.fusoHorario
}

describe('SecaoFuso (RN37)', () => {
  it('troca entre os fusos brasileiros', async () => {
    render(<SecaoFuso />)
    const select = await screen.findByLabelText('Fuso')
    expect(select).toHaveValue('America/Sao_Paulo')
    expect(screen.getByRole('option', { name: 'Brasília (America/Sao_Paulo)' })).toBeInTheDocument()
    await userEvent.selectOptions(select, 'America/Manaus')
    await waitFor(async () => {
      expect(await fusoGravado()).toBe('America/Manaus')
    })
  })

  it('"Outros" aceita qualquer fuso IANA válido e recusa o inválido', async () => {
    render(<SecaoFuso />)
    await userEvent.selectOptions(await screen.findByLabelText('Fuso'), 'outros')
    const campo = screen.getByLabelText('Fuso IANA')
    await userEvent.type(campo, 'Lua/Cratera')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fuso horário desconhecido')
    expect(await fusoGravado()).toBe('America/Sao_Paulo')

    await userEvent.clear(campo)
    await userEvent.type(campo, 'Europe/Lisbon{Enter}')
    await waitFor(async () => {
      expect(await fusoGravado()).toBe('Europe/Lisbon')
    })
    expect(await screen.findByText('Fuso atual: Europe/Lisbon')).toBeInTheDocument()
    expect(screen.getByLabelText('Fuso')).toHaveValue('outros')
  })
})
