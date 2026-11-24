import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/banco'
import { dbNuvem } from '@/db/bancoNuvem'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import {
  registrarConexaoNuvem,
  registrarGatilhoNuvem,
  registrarSuspensaoNuvem,
} from '@/db/nuvemRepositorio'
import { ComNuvem } from '@/test/ComNuvem'
import { criarNuvemFalsa } from '@/test/nuvemFalsa'
import { IndicadorNuvem, TEXTO_RECONECTAR, TEXTO_SUSPENSO } from './IndicadorNuvem'
import type { OrquestradorNuvem } from './orquestrador'

let orquestradores: OrquestradorNuvem[] = []

function montar() {
  const nuvem = criarNuvemFalsa()
  orquestradores.push(nuvem.orquestrador)
  render(
    <ComNuvem orquestrador={nuvem.orquestrador} rotaInicial="/">
      <Routes>
        <Route path="/" element={<IndicadorNuvem />} />
        <Route path="/configuracoes" element={<p>Tela de Configurações</p>} />
      </Routes>
    </ComNuvem>,
  )
  return nuvem
}

async function conectado() {
  await registrarConexaoNuvem({
    email: 'pessoa@example.com',
    pastaId: 'pasta1',
    referenciaDrive: null,
  })
}

/** Espera o estado carregar antes de afirmar uma ausência. */
async function esperarCarga() {
  await new Promise((resolver) => setTimeout(resolver, 50))
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await dbNuvem.delete()
  await dbNuvem.open()
})

afterEach(async () => {
  for (const orquestrador of orquestradores) {
    orquestrador.encerrar()
    await orquestrador.concluirPendentes()
  }
  orquestradores = []
  db.close()
  dbNuvem.close()
})

describe('IndicadorNuvem', () => {
  it('sem o recurso, não aparece', async () => {
    const { container } = render(
      <MemoryRouter>
        <IndicadorNuvem />
      </MemoryRouter>,
    )
    await esperarCarga()
    expect(container).toBeEmptyDOMElement()
  })

  it('desconectado ou em dia, não aparece', async () => {
    montar()
    await esperarCarga()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('pendente e sem token: "Reconectar Google Drive" pede o token no clique e envia', async () => {
    await conectado()
    await registrarGatilhoNuvem()
    const { destino } = montar()
    const botao = await screen.findByRole('button', { name: TEXTO_RECONECTAR })

    await userEvent.click(botao)
    expect(destino.pedidosAutorizacao).toEqual([
      { dicaEmail: 'pessoa@example.com', escolherConta: false },
    ])
    await waitFor(() => {
      expect(destino.gravacoes).toBe(1)
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: TEXTO_RECONECTAR })).not.toBeInTheDocument()
    })
  })

  it('pendente com token válido não pede reconexão', async () => {
    await conectado()
    await registrarGatilhoNuvem()
    const { destino } = montar()
    destino.definirToken(true)
    await esperarCarga()
    expect(screen.queryByRole('button', { name: TEXTO_RECONECTAR })).not.toBeInTheDocument()
  })

  it('suspenso: link para a seção Google Drive, com prioridade sobre reconectar', async () => {
    await conectado()
    await registrarGatilhoNuvem()
    await registrarSuspensaoNuvem()
    montar()
    const link = await screen.findByRole('link', {
      name: `${TEXTO_SUSPENSO}: ver em Configurações`,
    })
    expect(screen.queryByRole('button', { name: TEXTO_RECONECTAR })).not.toBeInTheDocument()
    await userEvent.click(link)
    expect(await screen.findByText('Tela de Configurações')).toBeInTheDocument()
  })
})
