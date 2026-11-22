import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { garantirConfiguracoesPadrao, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { SecaoNotificacoes } from './SecaoNotificacoes'

const permissao = {
  valor: 'default' as NotificationPermission,
  resposta: 'granted' as NotificationPermission,
}

// Imita a API estática `Notification` do navegador.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class NotificacaoFalsa {
  static get permission() {
    return permissao.valor
  }
  static requestPermission() {
    permissao.valor = permissao.resposta
    return Promise.resolve(permissao.valor)
  }
}

beforeEach(async () => {
  permissao.valor = 'default'
  vi.stubGlobal('Notification', NotificacaoFalsa)
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
})

afterEach(() => {
  vi.unstubAllGlobals()
  db.close()
})

describe('SecaoNotificacoes (RN39)', () => {
  it('pede a permissão e ativa as notificações quando concedida', async () => {
    render(<SecaoNotificacoes />)
    expect(screen.getByText('Ainda não solicitadas.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Permitir notificações' }))
    expect(await screen.findByText(/Permitidas pelo navegador/)).toBeInTheDocument()
    await waitFor(async () => {
      expect((await obterConfiguracoes())?.notificacoesAtivas).toBe(true)
    })
    expect(
      await screen.findByRole('button', { name: 'Desativar notificações' }),
    ).toBeInTheDocument()
  })

  it('recusada: mostra como liberar e mantém desativadas', async () => {
    permissao.resposta = 'denied'
    render(<SecaoNotificacoes />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Permitir notificações' }))
    expect(await screen.findByText(/Bloqueadas pelo navegador/)).toBeInTheDocument()
    expect((await obterConfiguracoes())?.notificacoesAtivas).toBe(false)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sem suporte no navegador', () => {
    vi.stubGlobal('Notification', undefined)
    render(<SecaoNotificacoes />)
    expect(screen.getByText('Este navegador não oferece notificações.')).toBeInTheDocument()
  })
})
