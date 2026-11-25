// Restauração e estado da nuvem (RN45, RN47): depois de qualquer restauração
// bem-sucedida, a referência passa a ser a dos dados restaurados, mas só com o
// recurso do Drive disponível. Sem ele, o banco da nuvem nem é criado.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TelaFalhaBanco } from '@/app/TelaFalhaBanco'
import { db } from '@/db/banco'
import { NOME_BANCO_NUVEM } from '@/db/bancoNuvem'
import { gerarBackup } from '@/db/backupRepositorio'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import {
  obterEstadoNuvem,
  registrarConexaoNuvem,
  registrarSuspensaoNuvem,
} from '@/db/nuvemRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { popularDadosDeTeste } from '@/db/seedDesenvolvimento'
import { ContextoNuvem } from '@/features/nuvem/contextoNuvem'
import { SecaoBackup } from './SecaoBackup'

vi.mock('@/lib/download', () => ({ baixarArquivo: vi.fn() }))
vi.mock('@/lib/recarregar', () => ({ recarregarPagina: vi.fn() }))
vi.mock('@/lib/canalRestauracao', () => ({ avisarRestauracao: vi.fn() }))

const AGORA = new Date('2026-11-22T15:00:00.000Z')
let conteudo = ''

async function bancosExistentes(): Promise<string[]> {
  return (await indexedDB.databases()).map((banco) => banco.name ?? '')
}

function apagarBancoNuvem(): Promise<void> {
  return new Promise((resolver) => {
    const pedido = indexedDB.deleteDatabase(NOME_BANCO_NUVEM)
    pedido.onsuccess = () => {
      resolver()
    }
    pedido.onerror = () => {
      resolver()
    }
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
  await popularDadosDeTeste(AGORA)
  conteudo = (await gerarBackup(AGORA)).conteudo // 8 registros
  await criarObjetivo({ nome: 'Depois do backup', sigla: 'DEP' })
  await apagarBancoNuvem()
})

afterEach(() => {
  db.close()
})

async function escolherArquivo() {
  await userEvent.upload(
    screen.getByTestId('arquivo-backup'),
    new File([conteudo], 'backup.json', { type: 'application/json' }),
  )
}

/** Confirmação no modo normal: baixa a cópia e substitui. */
async function confirmarComCopia() {
  const dialogo = await screen.findByRole('alertdialog')
  await userEvent.click(
    within(dialogo).getByRole('button', { name: 'Baixar cópia dos dados atuais' }),
  )
  const substituir = within(dialogo).getByRole('button', { name: 'Substituir dados' })
  await vi.waitFor(() => {
    expect(substituir).toBeEnabled()
  })
  await userEvent.click(substituir)
  await screen.findByRole('alertdialog', { name: 'Backup restaurado' })
}

describe('sem VITE_GOOGLE_CLIENT_ID', () => {
  it('a restauração por arquivo não cria o banco study-manager-nuvem', async () => {
    render(<SecaoBackup />)
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolherArquivo()
    await confirmarComCopia()
    expect((await db.objetivos.toArray()).map((o) => o.sigla).sort()).toEqual(['CF', 'PF'])
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(await bancosExistentes()).not.toContain(NOME_BANCO_NUVEM)
  })
})

describe('com o recurso do Drive disponível', () => {
  async function conectadoComSuspensao() {
    await registrarConexaoNuvem({ email: 'pessoa@example.com', pastaId: 'p1', referenciaDrive: 50 })
    await registrarSuspensaoNuvem()
  }

  it('restauração por arquivo: referência dos dados restaurados, pendente e sem suspensão', async () => {
    await conectadoComSuspensao()
    render(
      <ContextoNuvem.Provider value={{ disponivel: true, orquestrador: null }}>
        <SecaoBackup />
      </ContextoNuvem.Provider>,
    )
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolherArquivo()
    await confirmarComCopia()
    await vi.waitFor(async () => {
      expect(await obterEstadoNuvem()).toMatchObject({
        registrosUltimoEnvio: 8,
        situacao: 'pendente',
        motivoErro: null,
      })
    })
  })

  it('restauração pela tela de falha do banco: referência atualizada', async () => {
    await conectadoComSuspensao()
    render(
      <ContextoNuvem.Provider value={{ disponivel: true, orquestrador: null }}>
        <TelaFalhaBanco tipo="outra" />
      </ContextoNuvem.Provider>,
    )
    await escolherArquivo()
    const dialogo = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Substituir dados' }))
    await screen.findByText('Backup restaurado')
    await vi.waitFor(async () => {
      expect(await obterEstadoNuvem()).toMatchObject({
        registrosUltimoEnvio: 8,
        situacao: 'pendente',
        motivoErro: null,
      })
    })
  })
})
