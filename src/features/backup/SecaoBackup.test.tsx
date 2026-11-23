import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { gerarBackup, lerDadosAtuais } from '@/db/backupRepositorio'
import { garantirConfiguracoesPadrao, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { popularDadosDeTeste } from '@/db/seedDesenvolvimento'
import { MENSAGENS_BACKUP } from '@/domain/backup'
import { avisarRestauracao } from '@/lib/canalRestauracao'
import { baixarArquivo } from '@/lib/download'
import { recarregarPagina } from '@/lib/recarregar'
import { SecaoBackup } from './SecaoBackup'

vi.mock('@/lib/download', () => ({ baixarArquivo: vi.fn() }))
vi.mock('@/lib/recarregar', () => ({ recarregarPagina: vi.fn() }))
vi.mock('@/lib/canalRestauracao', () => ({ avisarRestauracao: vi.fn() }))

const AGORA = new Date('2026-11-22T15:00:00.000Z')

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
  await popularDadosDeTeste(AGORA)
})

afterEach(() => {
  vi.restoreAllMocks()
  db.close()
})

function arquivoDeBackup(conteudo: string, nome = 'backup.json'): File {
  return new File([conteudo], nome, { type: 'application/json' })
}

async function escolher(arquivo: File) {
  await userEvent.upload(screen.getByTestId('arquivo-backup'), arquivo)
}

describe('SecaoBackup: exportar (RN32)', () => {
  it('baixa o arquivo e atualiza o último backup', async () => {
    render(<SecaoBackup />)
    await userEvent.click(await screen.findByRole('button', { name: 'Exportar backup' }))
    await waitFor(() => {
      expect(baixarArquivo).toHaveBeenCalledTimes(1)
    })
    const [nome, conteudo] = vi.mocked(baixarArquivo).mock.calls[0] ?? []
    expect(nome).toMatch(/^study-manager-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
    expect(JSON.parse(conteudo ?? '')).toMatchObject({ app: 'study-manager', schemaVersion: 1 })
    await waitFor(async () => {
      expect((await obterConfiguracoes())?.ultimoBackupEm).not.toBeNull()
    })
    expect(screen.getByTestId('ultimo-backup')).not.toHaveTextContent('nenhum backup')
  })

  it('não baixa nada se os dados atuais não passarem na validação', async () => {
    const [registro] = await db.registros.filter((r) => r.origem === 'cronometro').toArray()
    if (!registro) throw new Error('sem registro')
    await db.registros.put({ ...registro, duracaoPlanejadaMin: 600 })
    render(<SecaoBackup />)
    await userEvent.click(await screen.findByRole('button', { name: 'Exportar backup' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O backup não foi gerado')
    expect(baixarArquivo).not.toHaveBeenCalled()
    expect((await obterConfiguracoes())?.ultimoBackupEm).toBeNull()
  })
})

describe('SecaoBackup: restaurar (RN33)', () => {
  it('exige baixar a cópia antes de substituir; depois do sucesso só recarrega no clique', async () => {
    const backup = await gerarBackup(AGORA)
    await criarObjetivo({ nome: 'Depois do backup', sigla: 'DEP' })

    render(<SecaoBackup />)
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolher(arquivoDeBackup(backup.conteudo))

    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo).toHaveTextContent('Isto substituirá todos os dados atuais.')
    expect(dialogo).toHaveTextContent('22/11/2026 às 12:00')
    expect(dialogo).toHaveTextContent('Objetivos2')
    expect(dialogo).toHaveTextContent('Registros8 (1 excluídos)')
    const substituir = within(dialogo).getByRole('button', { name: 'Substituir dados' })
    expect(substituir).toBeDisabled()
    expect(await db.objetivos.count()).toBe(3) // nada mudou antes da confirmação

    // Passo 8: a cópia dos dados atuais, com nome próprio.
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Baixar cópia dos dados atuais' }),
    )
    await waitFor(() => {
      expect(baixarArquivo).toHaveBeenCalledTimes(1)
    })
    const [nome, conteudo] = vi.mocked(baixarArquivo).mock.calls[0] ?? []
    expect(nome).toMatch(/^study-manager-antes-da-restauracao-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
    const copia = JSON.parse(conteudo ?? '') as { dados: { objetivos: unknown[] } }
    expect(copia.dados.objetivos).toHaveLength(3)
    expect(within(dialogo).getByRole('status')).toHaveTextContent(`Cópia baixada: ${nome ?? ''}`)
    await waitFor(() => {
      expect(substituir).toBeEnabled()
    })

    await userEvent.click(substituir)
    const sucesso = await screen.findByRole('alertdialog', { name: 'Backup restaurado' })
    expect((await db.objetivos.toArray()).map((o) => o.sigla).sort()).toEqual(['CF', 'PF'])
    expect(avisarRestauracao).toHaveBeenCalledTimes(1)
    expect(baixarArquivo).toHaveBeenCalledTimes(1)

    // Não fecha por Esc e não recarrega sozinho.
    await userEvent.keyboard('{Escape}')
    await new Promise((resolver) => setTimeout(resolver, 300))
    expect(sucesso).toBeInTheDocument()
    expect(recarregarPagina).not.toHaveBeenCalled()

    await userEvent.click(within(sucesso).getByRole('button', { name: 'Recarregar' }))
    expect(recarregarPagina).toHaveBeenCalledTimes(1)
  })

  it('cópia que falha: mostra a mensagem e exige "Seguir sem cópia" para habilitar', async () => {
    const backup = await gerarBackup(AGORA)
    render(<SecaoBackup />)
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolher(arquivoDeBackup(backup.conteudo))
    const dialogo = await screen.findByRole('alertdialog')
    const substituir = within(dialogo).getByRole('button', { name: 'Substituir dados' })

    vi.spyOn(db.objetivos, 'toArray').mockRejectedValueOnce(new Error('disco'))
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Baixar cópia dos dados atuais' }),
    )
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Não foi possível copiar os dados atuais.',
    )
    expect(baixarArquivo).not.toHaveBeenCalled()
    expect(substituir).toBeDisabled()

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Seguir sem cópia' }))
    expect(within(dialogo).getByRole('status')).toHaveTextContent('seguir sem cópia')
    expect(substituir).toBeEnabled()
    await userEvent.click(substituir)
    expect(await screen.findByRole('alertdialog', { name: 'Backup restaurado' })).toBeVisible()
  })

  it('a cópia sai mesmo com dados atuais que a validação recusaria', async () => {
    const backup = await gerarBackup(AGORA)
    const [registro] = await db.registros.filter((r) => r.origem === 'cronometro').toArray()
    if (!registro) throw new Error('sem registro')
    await db.registros.put({ ...registro, duracaoPlanejadaMin: 600 })
    render(<SecaoBackup />)
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolher(arquivoDeBackup(backup.conteudo))
    const dialogo = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Baixar cópia dos dados atuais' }),
    )
    await waitFor(() => {
      expect(baixarArquivo).toHaveBeenCalledTimes(1)
    })
    expect(within(dialogo).getByRole('button', { name: 'Substituir dados' })).toBeEnabled()
  })

  it('cancelar não muda nada', async () => {
    const backup = await gerarBackup(AGORA)
    await criarObjetivo({ nome: 'Depois do backup', sigla: 'DEP' })
    const antes = await lerDadosAtuais()
    render(<SecaoBackup />)
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolher(arquivoDeBackup(backup.conteudo))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(await lerDadosAtuais()).toEqual(antes)
    expect(baixarArquivo).not.toHaveBeenCalled()
  })

  it('rejeita arquivo alterado sem abrir a confirmação', async () => {
    const backup = await gerarBackup(AGORA)
    const alterado = backup.conteudo.replace('"metaMensalHoras": 100', '"metaMensalHoras": 101')
    render(<SecaoBackup />)
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolher(arquivoDeBackup(alterado))
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGENS_BACKUP.checksum)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('rejeita arquivo grande demais antes de ler o conteúdo', async () => {
    const arquivo = arquivoDeBackup('{}')
    const ler = vi.spyOn(arquivo, 'text')
    Object.defineProperty(arquivo, 'size', { value: 60 * 1024 * 1024 })
    render(<SecaoBackup />)
    await screen.findByRole('button', { name: 'Exportar backup' })
    await escolher(arquivo)
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGENS_BACKUP.grande)
    expect(ler).not.toHaveBeenCalled()
  })

  it('fica bloqueada enquanto houver sessão do cronômetro (passo 1)', async () => {
    const [materia] = await db.materias.toArray()
    const inicio = AGORA.toISOString()
    await db.sessaoAtiva.put({
      id: 'atual',
      materiaId: materia?.id ?? '',
      duracaoPlanejadaMin: 60,
      inicioEm: inicio,
      segmentoInicioEm: inicio,
      acumuladoSeg: 0,
      ultimoHeartbeatEm: inicio,
      estado: 'em_andamento',
      tipoEncerramento: null,
      fimEm: null,
      motivoPausaAutomatica: null,
      pausaDetectadaEm: null,
    })
    render(<SecaoBackup />)
    const botao = await screen.findByRole('button', { name: 'Restaurar de um backup' })
    await waitFor(() => {
      expect(botao).toBeDisabled()
    })
    expect(screen.getByText(/Encerre ou descarte a sessão/)).toBeInTheDocument()
  })
})
