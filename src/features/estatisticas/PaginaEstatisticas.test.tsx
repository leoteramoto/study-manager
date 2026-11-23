import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { arquivarMateria, criarMateria } from '@/db/materiasRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import type { Materia, Registro } from '@/db/tipos'
import { PaginaEstatisticas } from './PaginaEstatisticas'

const ACRE = 'America/Rio_Branco'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: ACRE })
})

afterEach(() => {
  vi.useRealTimers()
  db.close()
})

/** Relógio falso só para Date e setInterval (o Dexie continua usando timers reais). */
function fixarRelogio(instante: string) {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date(instante))
}

let sequencia = 0
function registro(materia: Materia, dados: Partial<Registro> & { data: string }): Registro {
  sequencia += 1
  const criadoEm = new Date(Date.UTC(2026, 0, 1, 0, sequencia)).toISOString()
  return {
    id: crypto.randomUUID(),
    materiaId: materia.id,
    objetivoId: materia.objetivoId,
    inicio: null,
    fim: null,
    duracaoSeg: 3600,
    duracaoPlanejadaMin: null,
    origem: 'manual',
    tipoEncerramento: 'manual',
    excluidoEm: null,
    criadoEm,
    atualizadoEm: criadoEm,
    ...dados,
  }
}

function registroCronometro(materia: Materia, inicio: string, duracaoSeg: number, data: string) {
  return registro(materia, {
    data,
    inicio,
    fim: new Date(Date.parse(inicio) + duracaoSeg * 1000).toISOString(),
    duracaoSeg,
    duracaoPlanejadaMin: 60,
    origem: 'cronometro',
    tipoEncerramento: 'concluido',
  })
}

async function cenario() {
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
  const matPf = await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  const matCf = await criarMateria(cf.id, { nome: 'Matemática', descricao: '', cor: '#16a34a' })
  const port = await criarMateria(pf.id, { nome: 'Português', descricao: '', cor: '#0891b2' })
  return { pf, cf, matPf, matCf, port }
}

function tabela(nome: RegExp): HTMLElement {
  return screen.getByRole('table', { name: nome })
}

function linhas(nome: RegExp): string[][] {
  return within(tabela(nome))
    .getAllByRole('row')
    .slice(1)
    .map((linha) =>
      within(linha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    )
}

/** Espera a tela carregar (o botão fica desabilitado até lá) e abre o diálogo. */
async function abrirLancamento(usuario: ReturnType<typeof userEvent.setup>) {
  const botao = await screen.findByRole('button', { name: 'Lançar estudo manual' })
  await waitFor(() => {
    expect(botao).toBeEnabled()
  })
  await usuario.click(botao)
}

function totalExibido(): string | null | undefined {
  return screen.getByText(/^Total de /).nextElementSibling?.textContent
}

describe('PaginaEstatisticas', () => {
  it('abre no ano e no mês atuais do fuso, com histórico, ranking e total', async () => {
    // 01/12 03:30 UTC ainda é 30/11 22:30 no Acre.
    fixarRelogio('2026-12-01T03:30:00Z')
    const { matPf, matCf } = await cenario()
    await db.registros.bulkAdd([
      registroCronometro(matPf, '2026-11-30T14:00:00.000Z', 1800, '2026-11-30'),
      registro(matCf, { data: '2026-11-30', duracaoSeg: 5400 }),
      registro(matPf, { data: '2026-11-02', duracaoSeg: 3600 }),
      registro(matPf, { data: '2026-11-03', duracaoSeg: 999, excluidoEm: '2026-11-04T00:00:00Z' }),
      registro(matPf, { data: '2026-12-01', duracaoSeg: 999 }),
    ])

    render(<PaginaEstatisticas />)

    expect(await screen.findByRole('tab', { name: 'novembro de 2026' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Ano')).toHaveValue('2026')
    expect(totalExibido()).toBe('3h00')

    expect(linhas(/Histórico de estudos/)).toEqual([
      ['30/11/2026', '09:00', '09:30', '30', 'Matemática-PF', 'CronômetroConcluído', ''],
      ['30/11/2026', '—', '—', '90', 'Matemática-CF', 'Manual', ''],
      ['02/11/2026', '—', '—', '60', 'Matemática-PF', 'Manual', ''],
    ])
    expect(linhas(/Tempo total de cada matéria/)).toEqual([
      ['Matemática-CF', '1h30'],
      ['Matemática-PF', '1h30'],
    ])
  })

  it('registro do cronômetro só pode ser excluído; manual pode ser editado e excluído', async () => {
    fixarRelogio('2026-11-22T15:00:00Z')
    const { matPf } = await cenario()
    await db.registros.bulkAdd([
      registroCronometro(matPf, '2026-11-20T14:00:00.000Z', 1800, '2026-11-20'),
      registro(matPf, { data: '2026-11-21' }),
    ])
    render(<PaginaEstatisticas />)
    await screen.findByRole('table', { name: /Histórico/ })

    expect(
      screen.queryByRole('button', { name: 'Editar lançamento de Matemática-PF em 20/11/2026' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Excluir registro de Matemática-PF em 20/11/2026' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Editar lançamento de Matemática-PF em 21/11/2026' }),
    ).toBeInTheDocument()
  })

  it('lança um estudo manual e atualiza as tabelas', async () => {
    fixarRelogio('2026-11-22T15:00:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    await cenario()
    render(<PaginaEstatisticas />)

    await abrirLancamento(usuario)
    const dialogo = screen.getByRole('dialog', { name: 'Lançar estudo manual' })
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-11-22')
    await usuario.type(within(dialogo).getByLabelText('Tempo (minutos)'), '45')
    await usuario.selectOptions(within(dialogo).getByLabelText('Matéria'), 'Matemática-PF')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Lançar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('table', { name: /Histórico/ })).toBeInTheDocument()
    expect(linhas(/Histórico de estudos/)).toEqual([
      ['22/11/2026', '—', '—', '45', 'Matemática-PF', 'Manual', ''],
    ])
    expect(totalExibido()).toBe('0h45')
  })

  it('valida o lançamento: data futura no fuso, tempo e matéria', async () => {
    // 23/11 03:30 UTC ainda é 22/11 no Acre: 23/11 é futuro.
    fixarRelogio('2026-11-23T03:30:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    await cenario()
    render(<PaginaEstatisticas />)

    await abrirLancamento(usuario)
    const dialogo = screen.getByRole('dialog')
    const data = within(dialogo).getByLabelText('Data')
    expect(data).toHaveValue('2026-11-22')
    expect(data).toHaveAttribute('max', '2026-11-22')
    await usuario.clear(data)
    await usuario.type(data, '2026-11-23')
    await usuario.type(within(dialogo).getByLabelText('Tempo (minutos)'), '1,5')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Lançar' }))

    expect(within(dialogo).getByText('A data não pode estar no futuro.')).toBeInTheDocument()
    expect(
      within(dialogo).getByText('O tempo deve ser um número inteiro de minutos.'),
    ).toBeInTheDocument()
    expect(within(dialogo).getByText('Escolha a matéria.')).toBeInTheDocument()
    expect(await db.registros.count()).toBe(0)
  })

  it('o seletor de matéria só lista matérias ativas de objetivos ativos', async () => {
    fixarRelogio('2026-11-22T15:00:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    const { port } = await cenario()
    await arquivarMateria(port.id)
    render(<PaginaEstatisticas />)

    await abrirLancamento(usuario)
    const opcoes = within(screen.getByLabelText('Matéria'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toEqual(['Escolha a matéria', 'Matemática-PF', 'Matemática-CF'])
  })

  it('edita um lançamento cuja matéria foi arquivada, mantendo a matéria', async () => {
    fixarRelogio('2026-11-22T15:00:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    const { port } = await cenario()
    const lancamento = registro(port, { data: '2026-11-20', duracaoSeg: 1800 })
    await db.registros.add(lancamento)
    await arquivarMateria(port.id)
    render(<PaginaEstatisticas />)

    await usuario.click(
      await screen.findByRole('button', {
        name: 'Editar lançamento de Português-PF em 20/11/2026',
      }),
    )
    const dialogo = screen.getByRole('dialog', { name: 'Editar lançamento' })
    expect(within(dialogo).getByLabelText('Matéria')).toHaveDisplayValue('Português-PF (arquivada)')
    expect(within(dialogo).getByLabelText('Tempo (minutos)')).toHaveValue('30')
    const tempo = within(dialogo).getByLabelText('Tempo (minutos)')
    await usuario.clear(tempo)
    await usuario.type(tempo, '50')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(async () => {
      expect((await db.registros.get(lancamento.id))?.duracaoSeg).toBe(3000)
    })
    const editado = await db.registros.get(lancamento.id)
    expect(editado?.materiaId).toBe(port.id)
    expect(editado?.criadoEm).toBe(lancamento.criadoEm)
  })

  it('exclui com confirmação: some das tabelas e do total, mas fica no banco', async () => {
    fixarRelogio('2026-11-22T15:00:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    const { matPf } = await cenario()
    const cron = registroCronometro(matPf, '2026-11-20T14:00:00.000Z', 1800, '2026-11-20')
    await db.registros.bulkAdd([cron, registro(matPf, { data: '2026-11-21' })])
    render(<PaginaEstatisticas />)
    await screen.findByRole('table', { name: /Histórico/ })
    expect(totalExibido()).toBe('1h30')

    await usuario.click(
      screen.getByRole('button', { name: 'Excluir registro de Matemática-PF em 20/11/2026' }),
    )
    const confirmacao = screen.getByRole('alertdialog')
    expect(confirmacao).toHaveTextContent('Matemática-PF em 20/11/2026, 30 min')
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => {
      expect(totalExibido()).toBe('1h00')
    })
    expect(linhas(/Histórico de estudos/)).toHaveLength(1)
    expect((await db.registros.get(cron.id))?.excluidoEm).not.toBeNull()
  })

  it('cancelar a exclusão não muda nada', async () => {
    fixarRelogio('2026-11-22T15:00:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    const { matPf } = await cenario()
    const manual = registro(matPf, { data: '2026-11-21' })
    await db.registros.add(manual)
    render(<PaginaEstatisticas />)

    await usuario.click(
      await screen.findByRole('button', {
        name: 'Excluir registro de Matemática-PF em 21/11/2026',
      }),
    )
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
    )
    expect(await db.registros.get(manual.id)).toEqual(manual)
  })

  it('separa anos e mostra a visão do ano (RF07, RN29)', async () => {
    fixarRelogio('2027-03-10T15:00:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    const { matPf, matCf } = await cenario()
    await db.registros.bulkAdd([
      registro(matPf, { data: '2026-01-15', duracaoSeg: 7200 }),
      registro(matCf, { data: '2026-01-20', duracaoSeg: 3600 }),
      registro(matCf, { data: '2026-05-20', duracaoSeg: 5400 }),
      registro(matPf, { data: '2027-01-15', duracaoSeg: 600 }),
    ])
    render(<PaginaEstatisticas />)

    const seletor = await screen.findByLabelText('Ano')
    await waitFor(() => {
      expect(
        within(seletor)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['2027', '2026'])
    })

    // Trocar de ano mantém a aba de mês (março).
    await usuario.selectOptions(seletor, '2026')
    expect(screen.getByRole('tab', { name: 'março de 2026' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await usuario.click(screen.getByRole('tab', { name: 'janeiro de 2026' }))
    await waitFor(() => {
      expect(totalExibido()).toBe('3h00')
    })
    expect(linhas(/Tempo total de cada matéria/)).toEqual([
      ['Matemática-PF', '2h00'],
      ['Matemática-CF', '1h00'],
    ])

    await usuario.click(screen.getByRole('tab', { name: 'Ano' }))
    expect(totalExibido()).toBe('4h30')
    const meses = linhas(/Tempo total de cada mês de 2026/)
    expect(meses).toHaveLength(12)
    expect(meses[0]).toEqual(['3h00'])
    expect(meses[4]).toEqual(['1h30'])
    expect(meses[11]).toEqual(['0h00'])
    expect(linhas(/Tempo total de cada matéria em 2026/)).toEqual([
      ['Matemática-CF', '2h30'],
      ['Matemática-PF', '2h00'],
    ])
  })

  it('ano que ficou sem registros continua no seletor enquanto está selecionado', async () => {
    fixarRelogio('2026-11-22T15:00:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    const { matPf } = await cenario()
    const antigo = registro(matPf, { data: '2024-11-10' })
    await db.registros.add(antigo)
    render(<PaginaEstatisticas />)

    const seletor = await screen.findByLabelText('Ano')
    await waitFor(() => {
      expect(within(seletor).getByRole('option', { name: '2024' })).toBeInTheDocument()
    })
    await usuario.selectOptions(seletor, '2024')
    await usuario.click(
      await screen.findByRole('button', {
        name: 'Excluir registro de Matemática-PF em 10/11/2024',
      }),
    )
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    )
    await screen.findByText('Nenhum estudo registrado neste mês.')
    expect(within(seletor).getByRole('option', { name: '2024' })).toBeInTheDocument()

    await usuario.selectOptions(seletor, '2026')
    await waitFor(() => {
      expect(within(seletor).queryByRole('option', { name: '2024' })).not.toBeInTheDocument()
    })
  })

  it('a aba do mês atual vira sozinha na virada do mês (fuso configurado)', async () => {
    // 30/11 23:59 no Acre (UTC−5).
    fixarRelogio('2026-12-01T04:59:00Z')
    const { matPf } = await cenario()
    await db.registros.bulkAdd([
      registro(matPf, { data: '2026-11-30', duracaoSeg: 3600 }),
      registro(matPf, { data: '2026-12-01', duracaoSeg: 600 }),
    ])
    render(<PaginaEstatisticas />)

    expect(await screen.findByRole('tab', { name: 'novembro de 2026' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await waitFor(() => {
      expect(totalExibido()).toBe('1h00')
    })

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'dezembro de 2026' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
    await waitFor(() => {
      expect(totalExibido()).toBe('0h10')
    })
  })

  it('um mês escolhido pelo usuário não muda na virada', async () => {
    fixarRelogio('2026-12-01T04:59:00Z')
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    await cenario()
    render(<PaginaEstatisticas />)

    await usuario.click(await screen.findByRole('tab', { name: 'outubro de 2026' }))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole('tab', { name: 'outubro de 2026' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
