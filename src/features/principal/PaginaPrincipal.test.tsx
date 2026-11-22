import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { definirMetaMensal, garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { criarMateria } from '@/db/materiasRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { alterarPeso, definirPlanejamento } from '@/db/planejamentoRepositorio'
import type { Materia, Registro } from '@/db/tipos'
import { PaginaPrincipal } from './PaginaPrincipal'

const H = 3600

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
})

afterEach(() => {
  vi.useRealTimers()
  db.close()
})

function registro(materia: Materia, data: string, duracaoSeg: number): Registro {
  const agora = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    materiaId: materia.id,
    objetivoId: materia.objetivoId,
    data,
    inicio: null,
    fim: null,
    duracaoSeg,
    duracaoPlanejadaMin: null,
    origem: 'manual',
    tipoEncerramento: 'manual',
    excluidoEm: null,
    criadoEm: agora,
    atualizadoEm: agora,
  }
}

async function cenario() {
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
  const mat = await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  const dir = await criarMateria(pf.id, { nome: 'Direito', descricao: '', cor: '#2563eb' })
  const port = await criarMateria(cf.id, { nome: 'Português', descricao: '', cor: '#0891b2' })
  await criarMateria(cf.id, { nome: 'Contabilidade', descricao: '', cor: '#16a34a' })
  return { pf, cf, mat, dir, port }
}

function linhaDe(codigo: string): HTMLElement {
  const linha = screen.getByText(codigo).closest('tr')
  if (!linha) throw new Error(`Linha de ${codigo} não encontrada`)
  return linha
}

function celulas(codigo: string): string[] {
  return within(linhaDe(codigo))
    .getAllByRole('cell')
    .map((c) => c.textContent)
}

describe('PaginaPrincipal', () => {
  it('sem meta e sem planejamento mostra os avisos e "—" (RN13)', async () => {
    render(<PaginaPrincipal />)
    expect(await screen.findByText('Defina a meta mensal')).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma matéria no planejamento/)).toBeInTheDocument()
    await definirMetaMensal(100)
    expect(await screen.findByText('Adicione matérias ao planejamento')).toBeInTheDocument()
  })

  it('RF03: pesos 2, 1 e 1 com 100 h e recálculo para 80 h sem recarregar', async () => {
    const { mat, dir, port } = await cenario()
    await definirPlanejamento([mat.id, dir.id, port.id])
    await alterarPeso(mat.id, 2)
    await definirMetaMensal(100)
    const usuario = userEvent.setup()
    render(<PaginaPrincipal />)

    await screen.findByText('Matemática-PF')
    expect(celulas('Matemática-PF')[5]).toBe('50h00')
    expect(celulas('Direito-PF')[5]).toBe('25h00')
    expect(celulas('Português-CF')[5]).toBe('25h00')

    const meta = screen.getByLabelText('Meta mensal (horas)')
    await usuario.clear(meta)
    await usuario.type(meta, '80{Enter}')

    await waitFor(() => {
      expect(celulas('Matemática-PF')[5]).toBe('40h00')
    })
    expect(celulas('Direito-PF')[5]).toBe('20h00')
    expect(celulas('Português-CF')[5]).toBe('20h00')
  })

  it('RF05: 20 h de meta e 30 h estudadas mostram 150% e "meta atingida"', async () => {
    const { mat } = await cenario()
    await definirPlanejamento([mat.id])
    await definirMetaMensal(20)
    await db.registros.add(registro(mat, hojeEmBrasilia(), 30 * H))
    render(<PaginaPrincipal />)

    await screen.findByText('Matemática-PF')
    await waitFor(() => {
      expect(celulas('Matemática-PF')[0]).toBe('150%')
    })
    const linha = celulas('Matemática-PF')
    expect(linha[4]).toBe('1.800')
    expect(linha[6]).toBe('0h00Meta atingida')
  })

  it('ordena por objetivo e matéria, com a matéria fora do plano só no total', async () => {
    const { mat, dir, port, pf } = await cenario()
    await definirPlanejamento([port.id, mat.id, dir.id])
    await definirMetaMensal(10)
    const contab = (await db.materias.where('objetivoId').notEqual(pf.id).toArray()).find(
      (m) => m.nome === 'Contabilidade',
    )
    if (!contab) throw new Error('sem contabilidade')
    await db.registros.add(registro(contab, hojeEmBrasilia(), 2 * H))
    render(<PaginaPrincipal />)

    await screen.findByText('Matemática-PF')
    const codigos = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[2]?.textContent)
    expect(codigos).toEqual(['Matemática-PF', 'Direito-PF', 'Português-CF'])
    const painel = screen.getByRole('region', { name: 'Indicadores do mês' })
    await waitFor(() => {
      expect(painel).toHaveTextContent('Estudado no mês2h00')
    })
    expect(painel).toHaveTextContent('% concluída20%')
  })

  it('peso: arredonda 1,25 para 1,3; zero é rejeitado e vazio volta ao valor anterior', async () => {
    const { mat } = await cenario()
    await definirPlanejamento([mat.id])
    const usuario = userEvent.setup()
    render(<PaginaPrincipal />)

    const peso = await screen.findByLabelText('Peso de Matemática-PF')
    await usuario.clear(peso)
    await usuario.type(peso, '1,25{Enter}')
    await waitFor(() => {
      expect(peso).toHaveValue('1,3')
    })

    await usuario.clear(peso)
    await usuario.type(peso, '0{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('O peso deve ser no mínimo 0,1.')
    expect(peso).toHaveValue('1,3')

    await usuario.clear(peso)
    await usuario.tab()
    expect(peso).toHaveValue('1,3')

    await usuario.clear(peso)
    await usuario.type(peso, '5{Escape}')
    expect(peso).toHaveValue('1,3')
    expect((await db.planejamento.get(mat.id))?.peso).toBe(1.3)
  })

  it('meta mensal vazia volta ao último valor válido', async () => {
    await definirMetaMensal(100)
    const usuario = userEvent.setup()
    render(<PaginaPrincipal />)
    const meta = await screen.findByLabelText('Meta mensal (horas)')
    expect(meta).toHaveValue('100')
    await usuario.clear(meta)
    await usuario.tab()
    expect(meta).toHaveValue('100')
    await usuario.type(meta, '{Control>}a{/Control}80.5{Enter}')
    await waitFor(() => {
      expect(meta).toHaveValue('80,5')
    })
  })

  it('edita o planejamento pelo dialog e remove pela linha', async () => {
    await cenario()
    const usuario = userEvent.setup()
    render(<PaginaPrincipal />)

    await usuario.click(await screen.findByRole('button', { name: 'Editar planejamento' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar planejamento' })
    expect(within(dialogo).getByRole('group', { name: 'Polícia Federal (PF)' })).toBeInTheDocument()
    await usuario.click(await within(dialogo).findByLabelText('Matemática-PF'))
    await usuario.click(within(dialogo).getByLabelText('Português-CF'))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Português-CF')).toBeInTheDocument()
    expect(screen.getByText('Matemática-PF')).toBeInTheDocument()

    await usuario.click(
      screen.getByRole('button', { name: 'Remover Português-CF do planejamento' }),
    )
    await waitFor(() => {
      expect(screen.queryByText('Português-CF')).not.toBeInTheDocument()
    })
  })

  it('vira o mês sozinha com o app aberto (America/Rio_Branco)', async () => {
    await db.configuracoes.update('app', { fusoHorario: 'America/Rio_Branco' })
    const { mat } = await cenario()
    await definirPlanejamento([mat.id])
    await definirMetaMensal(10)
    await db.registros.bulkAdd([
      registro(mat, '2026-11-30', 5 * H),
      registro(mat, '2026-12-01', 2 * H),
    ])

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    // 30/11 23:59 em Rio Branco (UTC−5).
    vi.setSystemTime(new Date('2026-12-01T04:59:00Z'))
    render(<PaginaPrincipal />)

    await screen.findByText('Matemática-PF')
    await waitFor(() => {
      expect(celulas('Matemática-PF')[4]).toBe('300')
    })
    expect(screen.getByText('30 de novembro de 2026')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    await waitFor(() => {
      expect(celulas('Matemática-PF')[4]).toBe('120')
    })
    expect(screen.getByText('1 de dezembro de 2026')).toBeInTheDocument()
  })
})

/** Data de hoje em Brasília, fuso usado na maioria dos testes. */
function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
