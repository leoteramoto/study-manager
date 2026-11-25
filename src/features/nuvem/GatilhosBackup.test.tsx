// Gatilhos automáticos do backup na nuvem (RN42, RN43), pelas telas: a ação
// local conclui como sempre, e o Google nunca a atrasa nem mostra erro nela.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/banco'
import { dbNuvem } from '@/db/bancoNuvem'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { criarMateria } from '@/db/materiasRepositorio'
import { obterEstadoNuvem, registrarConexaoNuvem } from '@/db/nuvemRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { definirPlanejamento } from '@/db/planejamentoRepositorio'
import { lancarManual } from '@/db/registrosRepositorio'
import { aplicarEvento, confirmarSessao, iniciarSessao, obterSessao } from '@/db/sessaoRepositorio'
import type { Materia } from '@/db/tipos'
import { ESPERA_AGRUPAMENTO_MS } from '@/domain/backupNuvem'
import { dataNoFuso, formatarDataCurta } from '@/domain/tempo'
import { fonteTicksPrincipal } from '@/features/cronometro/motor/fonteTicks'
import { criarLiderancaManual } from '@/features/cronometro/motor/lideranca'
import { ProvedorCronometro } from '@/features/cronometro/ProvedorCronometro'
import { PaginaEstatisticas } from '@/features/estatisticas/PaginaEstatisticas'
import { ComNuvem } from '@/test/ComNuvem'
import { criarNuvemFalsa, criarTemporizadorManual } from '@/test/nuvemFalsa'
import { ContextoNuvem } from './contextoNuvem'
import type { DestinoFalso } from './destinoFalso'
import { IndicadorNuvem } from './IndicadorNuvem'
import type { OrquestradorNuvem } from './orquestrador'

const FUSO = 'America/Sao_Paulo'
const MIN = 60_000

let materia: Materia
let orquestradores: OrquestradorNuvem[] = []

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: FUSO })
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  materia = await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  await definirPlanejamento([materia.id])
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

/** Orquestrador já conectado (primeiro envio feito) com o destino falso. */
async function nuvemConectada(temporizador = criarTemporizadorManual()) {
  const nuvem = criarNuvemFalsa(undefined, { temporizador: temporizador.temporizador })
  orquestradores.push(nuvem.orquestrador)
  await nuvem.orquestrador.pronto
  await expect(nuvem.orquestrador.conectar()).resolves.toEqual({ ok: true, envio: 'enviado' })
  await nuvem.orquestrador.concluirPendentes()
  expect(nuvem.destino.gravacoes).toBe(1)
  return { ...nuvem, relogio: temporizador }
}

/** Popup do Google que falha: token vencido e pedido negado ou sem resposta. */
function popupFalhando(destino: DestinoFalso, modo: 'nega' | 'pendente') {
  destino.definirToken(false)
  destino.modoAutorizacao = modo
}

function hoje(): string {
  return dataNoFuso(new Date(), FUSO)
}

// ---------------------------------------------------------------------------
// Confirmação do cronômetro
// ---------------------------------------------------------------------------

/** Sessão de 60 min encerrada aos 2 min, aguardando confirmação. */
async function sessaoAguardando() {
  const t0 = new Date(Date.now() - 10 * MIN)
  const em = (ms: number) => new Date(t0.getTime() + ms)
  await iniciarSessao(materia.id, 60, t0)
  for (let t = 20_000; t < 2 * MIN; t += 20_000) await aplicarEvento({ tipo: 'heartbeat' }, em(t))
  await aplicarEvento({ tipo: 'encerrar' }, em(2 * MIN))
}

function renderizarCronometro(orquestrador: OrquestradorNuvem) {
  render(
    <ComNuvem orquestrador={orquestrador}>
      <ProvedorCronometro
        fonteTicks={fonteTicksPrincipal}
        lideranca={criarLiderancaManual({ papel: 'lider', modo: 'abertura' })}
      >
        <IndicadorNuvem />
      </ProvedorCronometro>
    </ComNuvem>,
  )
}

describe('confirmar sessão do cronômetro', () => {
  it.each(['nega', 'pendente'] as const)(
    'com o popup %s: grava, fecha o diálogo, sem erro na tela e fica pendente',
    async (modo) => {
      const { destino, orquestrador } = await nuvemConectada()
      popupFalhando(destino, modo)
      await sessaoAguardando()
      renderizarCronometro(orquestrador)

      const dialogo = await screen.findByRole('alertdialog', { name: 'Revisar sessão' })
      const pedidosAntes = destino.pedidosAutorizacao.length
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))
      // O token é pedido de forma síncrona, ainda dentro do clique.
      expect(destino.pedidosAutorizacao).toHaveLength(pedidosAntes + 1)

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })
      expect(await db.registros.count()).toBe(1)
      expect(await obterSessao()).toBeNull()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await orquestrador.concluirPendentes()
      expect((await obterEstadoNuvem()).situacao).toBe('pendente')
      expect(
        await screen.findByRole('button', { name: 'Reconectar Google Drive' }),
      ).toBeInTheDocument()
    },
  )

  it('clique duplo em Confirmar: um registro só e um popup só', async () => {
    const { destino, orquestrador } = await nuvemConectada()
    popupFalhando(destino, 'pendente')
    await sessaoAguardando()
    renderizarCronometro(orquestrador)

    const dialogo = await screen.findByRole('alertdialog', { name: 'Revisar sessão' })
    const pedidosAntes = destino.pedidosAutorizacao.length
    const confirmar = within(dialogo).getByRole('button', { name: 'Confirmar' })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(await db.registros.count()).toBe(1)
    expect(destino.pedidosAutorizacao).toHaveLength(pedidosAntes + 1)
  })
})

// ---------------------------------------------------------------------------
// Lançamento manual, edição e exclusão
// ---------------------------------------------------------------------------

function renderizarEstatisticas(orquestrador: OrquestradorNuvem) {
  render(
    <ComNuvem orquestrador={orquestrador}>
      <PaginaEstatisticas />
    </ComNuvem>,
  )
}

async function lancarPelaTela(usuario: ReturnType<typeof userEvent.setup>, minutos: string) {
  const botao = await screen.findByRole('button', { name: 'Lançar estudo manual' })
  await waitFor(() => {
    expect(botao).toBeEnabled()
  })
  await usuario.click(botao)
  const dialogo = screen.getByRole('dialog', { name: 'Lançar estudo manual' })
  await usuario.type(within(dialogo).getByLabelText('Tempo (minutos)'), minutos)
  await usuario.selectOptions(within(dialogo).getByLabelText('Matéria'), 'Matemática-PF')
  return dialogo
}

async function esperarDialogoFechar() {
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
}

async function editarPelaTela(usuario: ReturnType<typeof userEvent.setup>, minutos: string) {
  await usuario.click(
    await screen.findByRole('button', {
      name: `Editar lançamento de Matemática-PF em ${formatarDataCurta(hoje())}`,
    }),
  )
  const dialogo = screen.getByRole('dialog', { name: 'Editar lançamento' })
  const campo = within(dialogo).getByLabelText('Tempo (minutos)')
  await usuario.clear(campo)
  await usuario.type(campo, minutos)
  return dialogo
}

async function excluirPelaTela() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Excluir registro de Matemática-PF em ${formatarDataCurta(hoje())}`,
    }),
  )
  const confirmacao = await screen.findByRole('alertdialog', { name: 'Excluir este registro?' })
  return within(confirmacao).getByRole('button', { name: 'Excluir' })
}

describe('lançar, editar e excluir', () => {
  it('com o popup negado: cada operação conclui e o backup fica pendente', async () => {
    const usuario = userEvent.setup()
    const { destino, orquestrador } = await nuvemConectada()
    popupFalhando(destino, 'nega')
    renderizarEstatisticas(orquestrador)

    // Lançar (Enter no campo também envia o formulário).
    const dialogo = await lancarPelaTela(usuario, '45')
    const pedidos = destino.pedidosAutorizacao.length
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Lançar' }))
    expect(destino.pedidosAutorizacao).toHaveLength(pedidos + 1) // síncrono no submit
    await esperarDialogoFechar()
    expect(await db.registros.count()).toBe(1)
    await orquestrador.concluirPendentes()
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')

    // Editar, enviando com Enter no campo de minutos.
    await editarPelaTela(usuario, '50{Enter}')
    await esperarDialogoFechar()
    expect((await db.registros.toArray())[0]?.duracaoSeg).toBe(50 * 60)
    expect(destino.pedidosAutorizacao).toHaveLength(pedidos + 2)

    // Excluir.
    const excluir = await excluirPelaTela()
    fireEvent.click(excluir)
    expect(destino.pedidosAutorizacao).toHaveLength(pedidos + 3) // síncrono no clique
    await waitFor(async () => {
      expect((await db.registros.toArray())[0]?.excluidoEm).not.toBeNull()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await orquestrador.concluirPendentes()
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')
    expect(destino.gravacoes).toBe(1) // só o envio da conexão
  })

  it('excluir registro do cronômetro também dispara o backup', async () => {
    const { orquestrador } = await nuvemConectada()
    await sessaoAguardando()
    await confirmarSessao()
    renderizarEstatisticas(orquestrador)
    const sessao = await db.registros.toArray()
    const dia = formatarDataCurta(sessao[0]?.data ?? '')
    fireEvent.click(
      await screen.findByRole('button', { name: `Excluir registro de Matemática-PF em ${dia}` }),
    )
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Excluir este registro?' })
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Excluir' }))
    await waitFor(async () => {
      expect((await obterEstadoNuvem()).situacao).toBe('pendente')
    })
  })

  it('com token válido: nenhum popup e um envio só, 5 s depois de várias ações', async () => {
    const usuario = userEvent.setup()
    const { destino, orquestrador, relogio } = await nuvemConectada()
    const pedidos = destino.pedidosAutorizacao.length
    renderizarEstatisticas(orquestrador)

    const dialogo = await lancarPelaTela(usuario, '30')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Lançar' }))
    await esperarDialogoFechar()
    await editarPelaTela(usuario, '40{Enter}')
    await esperarDialogoFechar()
    fireEvent.click(await excluirPelaTela())
    await waitFor(async () => {
      expect((await db.registros.toArray())[0]?.excluidoEm).not.toBeNull()
    })
    await orquestrador.concluirPendentes()

    expect(destino.pedidosAutorizacao).toHaveLength(pedidos)
    expect(destino.gravacoes).toBe(1)
    act(() => {
      relogio.avancar(ESPERA_AGRUPAMENTO_MS - 1)
    })
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(1)
    act(() => {
      relogio.avancar(1)
    })
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(2)
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
  })

  it('ação que falha: erro normal na tela e nada agendado', async () => {
    const usuario = userEvent.setup()
    const { destino, orquestrador, relogio } = await nuvemConectada()
    await lancarManual({ data: hoje(), minutos: 20, materiaId: materia.id })
    renderizarEstatisticas(orquestrador)

    const dialogo = await editarPelaTela(usuario, '25')
    // O registro some (outra aba excluiu) antes de salvar.
    const [registro] = await db.registros.toArray()
    await db.registros.update(registro?.id ?? '', { excluidoEm: new Date().toISOString() })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(
      await within(dialogo).findByText('Este registro foi excluído ou não existe mais.'),
    ).toBeInTheDocument()
    await orquestrador.concluirPendentes()
    expect(relogio.ativas()).toBe(0)
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
    expect(destino.gravacoes).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Orquestrador ainda carregando (import dinâmico)
// ---------------------------------------------------------------------------

describe('orquestrador ainda não carregado', () => {
  function renderizarSemOrquestrador() {
    render(
      <ContextoNuvem.Provider value={{ disponivel: true, orquestrador: null }}>
        <PaginaEstatisticas />
      </ContextoNuvem.Provider>,
    )
  }

  it('conectado: o "pendente" é gravado mesmo assim', async () => {
    await registrarConexaoNuvem({ email: 'pessoa@example.com', pastaId: 'p1', referenciaDrive: 0 })
    const usuario = userEvent.setup()
    renderizarSemOrquestrador()
    const dialogo = await lancarPelaTela(usuario, '15')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Lançar' }))
    await esperarDialogoFechar()
    expect(await db.registros.count()).toBe(1)
    await waitFor(async () => {
      expect((await obterEstadoNuvem()).situacao).toBe('pendente')
    })
  })

  it('desconectado: nada é gravado no banco da nuvem', async () => {
    const usuario = userEvent.setup()
    renderizarSemOrquestrador()
    const dialogo = await lancarPelaTela(usuario, '15')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Lançar' }))
    await esperarDialogoFechar()
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(await dbNuvem.estado.count()).toBe(0)
  })
})
