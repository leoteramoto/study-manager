import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { gerarBackup } from '@/db/backupRepositorio'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { popularDadosDeTeste } from '@/db/seedDesenvolvimento'
import { baixarArquivo } from '@/lib/download'
import { recarregarPagina } from '@/lib/recarregar'
import { TelaFalhaBanco } from './TelaFalhaBanco'

vi.mock('@/lib/download', () => ({ baixarArquivo: vi.fn() }))
vi.mock('@/lib/recarregar', () => ({ recarregarPagina: vi.fn() }))
vi.mock('@/lib/canalRestauracao', () => ({ avisarRestauracao: vi.fn() }))

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
})

afterEach(() => {
  db.close()
})

describe('TelaFalhaBanco (RN36)', () => {
  it('versão mais nova: só mostra a mensagem e "Recarregar", sem restauração', async () => {
    render(<TelaFalhaBanco tipo="versao" />)
    expect(
      screen.getByRole('heading', {
        name: 'Os dados foram gravados por uma versão mais nova do app',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restaurar de um backup' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
    expect(recarregarPagina).toHaveBeenCalled()
  })

  it('outra falha: restaura num banco recriado, avisando que não há backup prévio', async () => {
    await popularDadosDeTeste(new Date('2026-11-22T15:00:00.000Z'))
    const backup = await gerarBackup()
    await criarObjetivo({ nome: 'Será apagado', sigla: 'APG' })

    render(<TelaFalhaBanco tipo="outra" />)
    expect(
      screen.getByRole('heading', { name: 'Não foi possível abrir o banco de dados' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()

    await userEvent.upload(
      screen.getByTestId('arquivo-backup'),
      new File([backup.conteudo], 'backup.json', { type: 'application/json' }),
    )
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo).toHaveTextContent('Não é possível fazer backup dos dados atuais antes')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Substituir dados' }))

    expect(await screen.findByText('Backup restaurado')).toBeInTheDocument()
    expect(baixarArquivo).not.toHaveBeenCalled()
    expect((await db.objetivos.toArray()).map((o) => o.sigla).sort()).toEqual(['CF', 'PF'])
  })
})
