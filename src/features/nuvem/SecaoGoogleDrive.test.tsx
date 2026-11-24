import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/banco'
import { dbNuvem } from '@/db/bancoNuvem'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { obterEstadoNuvem } from '@/db/nuvemRepositorio'
import { MENSAGEM_SUSPENSAO } from '@/domain/backupNuvem'
import { ComNuvem } from '@/test/ComNuvem'
import { criarNuvemFalsa, semearBackupNoDrive } from '@/test/nuvemFalsa'
import type { OrquestradorNuvem } from './orquestrador'
import { MENSAGENS_NUVEM } from './orquestrador'
import { SecaoGoogleDrive, TEXTO_NADA_APAGADO, TEXTO_SUGESTAO_RESTAURAR } from './SecaoGoogleDrive'

let orquestradores: OrquestradorNuvem[] = []

function montar() {
  const nuvem = criarNuvemFalsa()
  orquestradores.push(nuvem.orquestrador)
  render(
    <ComNuvem orquestrador={nuvem.orquestrador}>
      <SecaoGoogleDrive />
    </ComNuvem>,
  )
  return nuvem
}

async function conectar() {
  await userEvent.click(await screen.findByRole('button', { name: 'Conectar ao Google Drive' }))
}

/** Conecta e espera o primeiro envio terminar (botões de volta). */
async function conectarEEsperar() {
  await conectar()
  await screen.findByRole('button', { name: 'Fazer backup agora' })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
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

describe('SecaoGoogleDrive (RN48)', () => {
  it('sem o recurso (sem Client ID), não aparece e não cria o banco da nuvem', async () => {
    dbNuvem.close()
    const { container } = render(
      <MemoryRouter>
        <SecaoGoogleDrive />
      </MemoryRouter>,
    )
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(container).toBeEmptyDOMElement()
    expect(dbNuvem.isOpen()).toBe(false)
  })

  it('prepara a autorização ao ser exibida', async () => {
    const { destino } = montar()
    await screen.findByRole('button', { name: 'Conectar ao Google Drive' })
    expect(destino.preparacoes).toBeGreaterThan(0)
  })

  it('conecta, envia na hora e mostra conta, último envio e situação', async () => {
    const { destino } = montar()
    await conectarEEsperar()
    expect(screen.getByText('pessoa@example.com')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('nenhum envio ainda')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('situacao-nuvem')).toHaveTextContent('Em dia.')
    expect(destino.gravacoes).toBe(1)
    expect(destino.pedidosAutorizacao[0]).toEqual({ dicaEmail: null, escolherConta: true })
    expect(screen.getByText(TEXTO_NADA_APAGADO)).toBeInTheDocument()
  })

  it('popup recusado: mostra o erro e continua desconectado', async () => {
    const { destino } = montar()
    destino.modoAutorizacao = 'nega'
    await conectar()
    expect(await screen.findByText(MENSAGENS_NUVEM.autorizacaoRecusada)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Conectar ao Google Drive' })).toBeEnabled()
  })

  it('navegador vazio e Drive com mais registros: suspende e sugere restaurar', async () => {
    const { destino } = montar()
    await semearBackupNoDrive(destino, 50)
    await conectar()
    expect(await screen.findByText(MENSAGEM_SUSPENSAO)).toBeInTheDocument()
    expect(screen.getByText(TEXTO_SUGESTAO_RESTAURAR)).toBeInTheDocument()
    expect(destino.gravacoes).toBe(0)
  })

  it('"Fazer backup agora" com menos registros pede confirmação explícita', async () => {
    const { destino } = montar()
    await semearBackupNoDrive(destino, 50)
    await conectarEEsperar()
    await screen.findByText(MENSAGEM_SUSPENSAO)

    await userEvent.click(screen.getByRole('button', { name: 'Fazer backup agora' }))
    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Enviar mesmo com menos registros?',
    })
    expect(destino.gravacoes).toBe(0)

    // Cancelar não envia.
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(destino.gravacoes).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: 'Fazer backup agora' }))
    const denovo = await screen.findByRole('alertdialog')
    await userEvent.click(within(denovo).getByRole('button', { name: 'Enviar mesmo assim' }))
    expect(await screen.findByText('Backup enviado para o Google Drive.')).toBeInTheDocument()
    expect(destino.gravacoes).toBe(1)
    await waitFor(() => {
      expect(screen.getByTestId('situacao-nuvem')).toHaveTextContent('Em dia.')
    })
    expect(screen.queryByText(TEXTO_SUGESTAO_RESTAURAR)).not.toBeInTheDocument()
  })

  it('"Fazer backup agora" sem autorização fica pendente e avisa', async () => {
    const { destino } = montar()
    await conectarEEsperar()
    destino.definirToken(false)
    destino.modoAutorizacao = 'nega'
    await userEvent.click(screen.getByRole('button', { name: 'Fazer backup agora' }))
    expect(await screen.findByText(/O envio ficou pendente/)).toBeInTheDocument()
    expect(screen.getByTestId('situacao-nuvem')).toHaveTextContent(
      'Envio pendente. Para enviar, clique em "Fazer backup agora"',
    )
  })

  it('"Desconectar" confirma, explica que nada é apagado e limpa o estado', async () => {
    const { destino } = montar()
    await conectarEEsperar()
    const arquivos = destino.arquivos.size

    await userEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Desconectar do Google Drive?',
    })
    expect(dialogo).toHaveTextContent(TEXTO_NADA_APAGADO)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desconectar' }))

    expect(
      await screen.findByRole('button', { name: 'Conectar ao Google Drive' }),
    ).toBeInTheDocument()
    expect(destino.revogacoes).toBe(1)
    expect(destino.arquivos.size).toBe(arquivos)
    expect((await obterEstadoNuvem()).conectado).toBe(false)
  })

  it('vindo do indicador, põe o foco no título da seção', async () => {
    const nuvem = criarNuvemFalsa()
    orquestradores.push(nuvem.orquestrador)
    render(
      <ComNuvem
        orquestrador={nuvem.orquestrador}
        rotaInicial={{ pathname: '/configuracoes', state: { secao: 'google-drive' } }}
      >
        <SecaoGoogleDrive />
      </ComNuvem>,
    )
    const titulo = await screen.findByRole('heading', { name: 'Google Drive' })
    await waitFor(() => {
      expect(titulo).toHaveFocus()
    })
  })
})
