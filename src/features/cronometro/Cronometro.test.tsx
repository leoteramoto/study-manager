import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { criarMateria } from '@/db/materiasRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { definirPlanejamento } from '@/db/planejamentoRepositorio'
import { iniciarSessao, obterSessao } from '@/db/sessaoRepositorio'
import type { Materia } from '@/db/tipos'
import { renderizarComCronometro } from '@/test/comCronometro'
import { CardCronometro } from './CardCronometro'
import { reiniciarAudioParaTestes } from './motor/alertas'
import { criarLiderancaManual } from './motor/lideranca'

const T0 = new Date('2026-11-22T13:00:00.000Z')
const SEG = 1000
const MIN = 60 * SEG

let materia: Materia

beforeEach(async () => {
  localStorage.clear()
  reiniciarAudioParaTestes()
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  materia = await criarMateria(pf.id, { nome: 'Matemática', descricao: '', cor: '#4f46e5' })
  await definirPlanejamento([materia.id])
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  db.close()
})

/** Deixa as gravações assíncronas (IndexedDB, liveQuery) terminarem. */
async function esperarGravacoes() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15))
  })
}

/**
 * Espera chegar ao banco um heartbeat gravado depois de `desde`. O motor pula
 * ticks enquanto uma gravação está em andamento; com a suíte rodando em
 * paralelo, a gravação pode demorar mais que alguns milissegundos reais, e sem
 * esta espera o passo seguinte veria mais de 30 s sem heartbeat e o motor
 * (corretamente) trataria como suspensão.
 */
async function esperarHeartbeatDesde(desde: number) {
  await waitFor(async () => {
    const sessao = await obterSessao()
    if (sessao?.estado !== 'em_andamento') return
    expect(Date.parse(sessao.ultimoHeartbeatEm)).toBeGreaterThan(desde)
  })
}

/**
 * Avança o relógio em passos, como o tempo real, dando chance aos heartbeats.
 * Numa aba seguidora ninguém grava heartbeat: passe `comHeartbeat = false`.
 */
async function passar(ms: number, passo = 20 * SEG, comHeartbeat = true) {
  for (let feito = 0; feito < ms; feito += passo) {
    const inicioDoPasso = Date.now()
    act(() => {
      vi.advanceTimersByTime(Math.min(passo, ms - feito))
    })
    await esperarGravacoes()
    if (comHeartbeat) await esperarHeartbeatDesde(inicioDoPasso)
  }
}

function renderizarCard(lideranca = criarLiderancaManual({ papel: 'lider', modo: 'abertura' })) {
  return renderizarComCronometro(
    <CardCronometro
      materias={[{ materiaId: materia.id, codigo: materia.codigo, cor: materia.cor }]}
    />,
    { lideranca },
  )
}

function tempoNaTela(): string {
  return screen.getByTestId('tempo-cronometro').textContent
}

async function iniciarPeloCard(minutos?: number) {
  const usuario = userEvent.setup()
  if (minutos !== undefined) {
    const campo = screen.getByLabelText('Minutos')
    await usuario.clear(campo)
    await usuario.type(campo, String(minutos))
  }
  await usuario.click(screen.getByRole('button', { name: 'Iniciar' }))
  await screen.findByRole('button', { name: 'Pausar' })
  return usuario
}

/** Sessão em andamento gravada direto no banco, como se outra aba a tivesse criado. */
async function sessaoNoBanco(heartbeatAtras: number) {
  await iniciarSessao(materia.id, 60, new Date(T0.getTime() - 10 * MIN))
  await db.sessaoAtiva.update('atual', {
    ultimoHeartbeatEm: new Date(T0.getTime() - heartbeatAtras).toISOString(),
  })
}

describe('CardCronometro', () => {
  it('sem matérias no planejamento, Iniciar fica desabilitado (RN13)', async () => {
    renderizarComCronometro(<CardCronometro materias={[]} />)
    expect(
      await screen.findByText('Adicione matérias ao planejamento para usar o cronômetro.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeDisabled()
  })

  it('valida os minutos e lembra o último valor usado', async () => {
    renderizarCard()
    const usuario = userEvent.setup()
    const campo = screen.getByLabelText('Minutos')
    expect(campo).toHaveValue(60)
    await usuario.clear(campo)
    await usuario.type(campo, '481')
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeDisabled()
    await usuario.clear(campo)
    await usuario.type(campo, '45')
    await usuario.click(screen.getByRole('button', { name: 'Iniciar' }))
    await screen.findByRole('button', { name: 'Pausar' })
    expect(localStorage.getItem('study-manager:ultimaDuracaoMin')).toBe('45')
  })

  it('pausar congela; encerrar aos 23 de 60 mostra 23 min; confirmar com clique duplo grava 1', async () => {
    renderizarCard()
    const usuario = await iniciarPeloCard()

    await passar(10 * MIN)
    expect(tempoNaTela()).toBe('10:00')
    await usuario.click(screen.getByRole('button', { name: 'Pausar' }))
    await screen.findByRole('button', { name: 'Continuar' })

    await passar(5 * MIN)
    expect(tempoNaTela()).toBe('10:00')
    expect(await obterSessao()).toMatchObject({ estado: 'pausado', acumuladoSeg: 600 })

    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await screen.findByRole('button', { name: 'Pausar' })
    await passar(13 * MIN)
    expect(tempoNaTela()).toBe('23:00')

    await usuario.click(screen.getByRole('button', { name: 'Encerrar' }))
    const dialogo = await screen.findByRole('alertdialog', { name: 'Revisar sessão' })
    expect(within(dialogo).getByText('23 min')).toBeInTheDocument()
    expect(within(dialogo).getByText('60 min')).toBeInTheDocument()
    expect(within(dialogo).getByText('Matemática-PF')).toBeInTheDocument()
    expect(within(dialogo).getByText('Polícia Federal')).toBeInTheDocument()
    expect(within(dialogo).getByText('22/11/2026')).toBeInTheDocument()
    expect(within(dialogo).getByText('10:00')).toBeInTheDocument()
    expect(within(dialogo).getByText('Encerrado antes do fim')).toBeInTheDocument()

    const confirmar = within(dialogo).getByRole('button', { name: 'Confirmar' })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    await esperarGravacoes()
    const registros = await db.registros.toArray()
    expect(registros).toHaveLength(1)
    expect(registros[0]).toMatchObject({ duracaoSeg: 23 * 60, origem: 'cronometro' })
    expect(await obterSessao()).toBeNull()
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeInTheDocument()
  })

  it('Cancelar na confirmação pede 2ª confirmação e não grava nada', async () => {
    renderizarCard()
    const usuario = await iniciarPeloCard()
    await passar(2 * MIN)
    await usuario.click(screen.getByRole('button', { name: 'Encerrar' }))
    const dialogo = await screen.findByRole('alertdialog', { name: 'Revisar sessão' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Descartar sessão' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(await db.registros.count()).toBe(0)
    expect(await obterSessao()).toBeNull()
  })

  it('Esc não fecha a confirmação', async () => {
    renderizarCard()
    const usuario = await iniciarPeloCard()
    await passar(2 * MIN)
    await usuario.click(screen.getByRole('button', { name: 'Encerrar' }))
    await screen.findByRole('alertdialog', { name: 'Revisar sessão' })
    await usuario.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog', { name: 'Revisar sessão' })).toBeInTheDocument()
  })

  it('com menos de 60 s só oferece Descartar', async () => {
    renderizarCard()
    const usuario = await iniciarPeloCard()
    await passar(30 * SEG)
    await usuario.click(screen.getByRole('button', { name: 'Encerrar' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(
      within(dialogo).getByText('Sessões com menos de 1 minuto não podem ser registradas.'),
    ).toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Descartar' }))
    await waitFor(async () => {
      expect(await obterSessao()).toBeNull()
    })
    expect(await db.registros.count()).toBe(0)
  })

  it('Cancelar sessão em andamento pede confirmação e não grava nada', async () => {
    renderizarCard()
    const usuario = await iniciarPeloCard()
    await passar(2 * MIN)
    await usuario.click(screen.getByRole('button', { name: 'Cancelar sessão' }))
    await usuario.click(await screen.findByRole('button', { name: 'Descartar sessão' }))
    await screen.findByRole('button', { name: 'Iniciar' })
    expect(await db.registros.count()).toBe(0)
  })
})

describe('fim do tempo e alertas (RN25)', () => {
  it('com o play() rejeitado, a confirmação abre e a notificação é enviada', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new DOMException('bloqueado', 'NotAllowedError'))
    const notificacoes: string[] = []
    // Imita a API estática `Notification` do navegador.
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class NotificacaoFalsa {
      static permission = 'granted'
      constructor(titulo: string) {
        notificacoes.push(titulo)
      }
    }
    vi.stubGlobal('Notification', NotificacaoFalsa)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await db.configuracoes.update('app', { notificacoesAtivas: true })

    renderizarCard()
    await iniciarPeloCard(1)
    await passar(65 * SEG, 5 * SEG)

    expect(await screen.findByRole('alertdialog', { name: 'Tempo concluído!' })).toBeInTheDocument()
    await waitFor(() => {
      expect(notificacoes).toEqual(['Tempo de estudo concluído'])
    })
    expect(play).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await obterSessao()).toMatchObject({
      estado: 'aguardando_confirmacao',
      tipoEncerramento: 'concluido',
      acumuladoSeg: 60,
    })
  })

  it('o play() que lança na hora também não quebra o fluxo', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      throw new Error('sem áudio')
    })
    renderizarCard()
    await iniciarPeloCard(1)
    await passar(65 * SEG, 5 * SEG)
    expect(await screen.findByRole('alertdialog', { name: 'Tempo concluído!' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('suspensão e "Contar esse tempo" (RN19)', () => {
  it('salto de 5 min pausa no último heartbeat e permite somar o intervalo', async () => {
    renderizarCard()
    const usuario = await iniciarPeloCard()
    await passar(20 * SEG, 5 * SEG)

    act(() => {
      vi.setSystemTime(new Date(Date.now() + 5 * MIN))
      vi.advanceTimersByTime(SEG)
    })
    expect(
      await screen.findByText('Estudo pausado porque o computador ficou inativo'),
    ).toBeInTheDocument()
    expect(screen.getByText(/5 min não foram contados/)).toBeInTheDocument()
    const sessao = await obterSessao()
    expect(sessao?.estado).toBe('pausado')
    expect(sessao?.acumuladoSeg).toBe(20)

    await usuario.click(screen.getByRole('button', { name: 'Contar esse tempo' }))
    await waitFor(async () => {
      expect((await obterSessao())?.acumuladoSeg).toBe(20 + 5 * 60 + 1)
    })
    expect(
      screen.queryByText('Estudo pausado porque o computador ficou inativo'),
    ).not.toBeInTheDocument()
  })

  it('aba descongelada pelo navegador (resume) mostra o motivo certo', async () => {
    renderizarCard()
    await iniciarPeloCard()
    await passar(20 * SEG, 5 * SEG)
    act(() => {
      vi.setSystemTime(new Date(Date.now() + 10 * MIN))
      document.dispatchEvent(new Event('resume'))
    })
    expect(
      await screen.findByText('Estudo pausado porque o navegador congelou a aba'),
    ).toBeInTheDocument()
  })
})

describe('atalho Espaço (RN26)', () => {
  it('pausa e continua fora de campos; ignora com foco num campo', async () => {
    renderizarCard()
    const usuario = await iniciarPeloCard()
    ;(document.activeElement as HTMLElement | null)?.blur()

    await usuario.keyboard(' ')
    await screen.findByRole('button', { name: 'Continuar' })
    await usuario.keyboard(' ')
    await screen.findByRole('button', { name: 'Pausar' })

    // Com foco num botão, o Espaço só aciona o botão (sem pausar duas vezes).
    screen.getByRole('button', { name: 'Encerrar' }).focus()
    fireEvent.keyDown(document.activeElement ?? document.body, { code: 'Space', key: ' ' })
    await esperarGravacoes()
    expect((await obterSessao())?.estado).toBe('em_andamento')
  })
})

describe('liderança entre abas e recuperação (RN20)', () => {
  it('abertura sem outra aba: pausa no último heartbeat e abre o modal', async () => {
    await sessaoNoBanco(2 * MIN)
    renderizarCard(criarLiderancaManual({ papel: 'lider', modo: 'abertura' }))

    const modal = await screen.findByRole('alertdialog', {
      name: 'Sessão interrompida encontrada',
    })
    expect(
      await within(modal).findByText(/Matemática-PF: 08:00 contados de 60 min/),
    ).toBeInTheDocument()
    expect(await obterSessao()).toMatchObject({
      estado: 'pausado',
      motivoPausaAutomatica: 'recuperacao',
      acumuladoSeg: 8 * 60,
    })

    const usuario = userEvent.setup()
    await usuario.click(within(modal).getByRole('button', { name: 'Continuar' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect((await obterSessao())?.estado).toBe('em_andamento')
  })

  it('"Encerrar e revisar" leva à confirmação como recuperado', async () => {
    await sessaoNoBanco(2 * MIN)
    renderizarCard()
    const modal = await screen.findByRole('alertdialog', {
      name: 'Sessão interrompida encontrada',
    })
    await userEvent.setup().click(within(modal).getByRole('button', { name: 'Encerrar e revisar' }))
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Revisar sessão' })
    expect(within(confirmacao).getByText('Recuperado')).toBeInTheDocument()
  })

  it('aba nova com outra líder: nenhum modal e nenhuma escrita', async () => {
    await sessaoNoBanco(2 * SEG)
    const antes = await obterSessao()
    renderizarCard(criarLiderancaManual({ papel: 'seguidora' }))

    await screen.findByRole('button', { name: 'Pausar' })
    await passar(40 * SEG, 5 * SEG, false)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await obterSessao()).toEqual(antes)
    // A seguidora exibe o tempo pelo relógio.
    expect(tempoNaTela()).toBe('10:40')
  })

  it('seguidora promovida continua a sessão sem modal e sem pausa', async () => {
    await sessaoNoBanco(2 * SEG)
    const lideranca = criarLiderancaManual({ papel: 'seguidora' })
    renderizarCard(lideranca)
    await screen.findByRole('button', { name: 'Pausar' })
    await passar(3 * SEG, SEG, false)

    act(() => {
      lideranca.definir({ papel: 'lider', modo: 'sucessao' })
    })
    await passar(15 * SEG, 5 * SEG, false)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    const sessao = await obterSessao()
    expect(sessao?.estado).toBe('em_andamento')
    expect(sessao?.motivoPausaAutomatica).toBeNull()
    expect(Date.parse(sessao?.ultimoHeartbeatEm ?? '')).toBeGreaterThan(T0.getTime())
  })
})
