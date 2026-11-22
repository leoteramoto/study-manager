import { afterEach, describe, expect, it, vi } from 'vitest'
import { atalhoEspacoPermitido } from './teclado'
import { criarFonteTicksWorker, fonteTicksPrincipal } from './fonteTicks'
import { criarLiderancaLocks, criarLiderancaUnica, type EstadoLideranca } from './lideranca'
import { notificar, pedirPermissaoNotificacao, statusNotificacao, tocarSom } from './alertas'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('fontes de ticks', () => {
  it('thread principal: chama a cada intervalo e para', () => {
    vi.useFakeTimers()
    const aoTick = vi.fn()
    const parar = fonteTicksPrincipal.iniciar(aoTick, 1000)
    vi.advanceTimersByTime(3000)
    expect(aoTick).toHaveBeenCalledTimes(3)
    parar()
    vi.advanceTimersByTime(3000)
    expect(aoTick).toHaveBeenCalledTimes(3)
  })

  it('worker: repassa as mensagens como ticks e encerra o worker', () => {
    const falso = {
      onmessage: null as ((evento: MessageEvent) => void) | null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    }
    const fonte = criarFonteTicksWorker(() => falso as unknown as Worker)
    const aoTick = vi.fn()
    const parar = fonte.iniciar(aoTick, 1000)
    expect(falso.postMessage).toHaveBeenCalledWith(1000)
    falso.onmessage?.(new MessageEvent('message', { data: 'tick' }))
    falso.onmessage?.(new MessageEvent('message', { data: 'tick' }))
    expect(aoTick).toHaveBeenCalledTimes(2)
    parar()
    expect(falso.terminate).toHaveBeenCalled()
  })

  it('worker indisponível: cai para a thread principal', () => {
    vi.useFakeTimers()
    const fonte = criarFonteTicksWorker(() => {
      throw new Error('sem worker de módulo')
    })
    const aoTick = vi.fn()
    const parar = fonte.iniciar(aoTick, 1000)
    vi.advanceTimersByTime(2000)
    expect(aoTick).toHaveBeenCalledTimes(2)
    parar()
  })
})

type Callback = (lock: Lock | null) => unknown

/** `LockManager` mínimo, com fila, para simular abas. */
class LocksFalso {
  private dono: string | null = null
  private fila: { aba: string; cb: Callback }[] = []
  private abaAtual = ''

  /** Próximas chamadas de `request` vêm desta aba. */
  comoAba(aba: string) {
    this.abaAtual = aba
    return this as unknown as LockManager
  }

  request(_nome: string, a: LockOptions | Callback, b?: Callback): Promise<unknown> {
    const opcoes = typeof a === 'function' ? {} : a
    const cb = typeof a === 'function' ? a : (b as Callback)
    const aba = this.abaAtual
    if (this.dono !== null) {
      if (opcoes.ifAvailable) return Promise.resolve(cb(null))
      this.fila.push({ aba, cb })
      return new Promise(() => undefined)
    }
    this.dono = aba
    return Promise.resolve(cb({ name: 'x', mode: 'exclusive' }))
  }

  /** A aba dona fecha: o lock passa para a próxima da fila. */
  fecharDono() {
    this.dono = null
    const proxima = this.fila.shift()
    if (proxima) {
      this.dono = proxima.aba
      void proxima.cb({ name: 'x', mode: 'exclusive' })
    }
  }
}

describe('liderança por navigator.locks', () => {
  it('primeira aba: líder em abertura; segunda: seguidora; promovida: sucessão', async () => {
    const locks = new LocksFalso()
    const abaA = criarLiderancaLocks(locks.comoAba('A'))
    await Promise.resolve()
    expect(abaA.obter()).toEqual({ papel: 'lider', modo: 'abertura' })

    const abaB = criarLiderancaLocks(locks.comoAba('B'))
    const estadosB: EstadoLideranca[] = []
    abaB.assinar(() => estadosB.push(abaB.obter()))
    await Promise.resolve()
    expect(abaB.obter()).toEqual({ papel: 'seguidora' })

    locks.fecharDono()
    await Promise.resolve()
    expect(abaB.obter()).toEqual({ papel: 'lider', modo: 'sucessao' })
    expect(estadosB.at(-1)).toEqual({ papel: 'lider', modo: 'sucessao' })
  })

  it('sem navigator.locks, a aba se considera líder em abertura', () => {
    expect(criarLiderancaUnica().obter()).toEqual({ papel: 'lider', modo: 'abertura' })
  })
})

describe('atalhoEspacoPermitido', () => {
  function tecla(alvo: Element, extra: KeyboardEventInit = {}) {
    const evento = new KeyboardEvent('keydown', { code: 'Space', key: ' ', ...extra })
    Object.defineProperty(evento, 'target', { value: alvo })
    return evento
  }

  it('aceita o Espaço fora de elementos interativos', () => {
    expect(atalhoEspacoPermitido(tecla(document.body))).toBe(true)
  })

  it.each(['input', 'textarea', 'select', 'button'])('ignora com foco em %s', (tag) => {
    const el = document.createElement(tag)
    document.body.append(el)
    expect(atalhoEspacoPermitido(tecla(el))).toBe(false)
  })

  it('ignora com diálogo aberto, repetição, modificadores e outras teclas', () => {
    expect(atalhoEspacoPermitido(tecla(document.body, { repeat: true }))).toBe(false)
    expect(atalhoEspacoPermitido(tecla(document.body, { ctrlKey: true }))).toBe(false)
    expect(atalhoEspacoPermitido(tecla(document.body, { code: 'Enter', key: 'Enter' }))).toBe(false)
    const dialogo = document.createElement('div')
    dialogo.setAttribute('role', 'dialog')
    document.body.append(dialogo)
    expect(atalhoEspacoPermitido(tecla(document.body))).toBe(false)
  })
})

describe('alertas', () => {
  it('som desligado não toca', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    expect(await tocarSom({ somAtivo: false, somId: 'sino', volume: 0.7 })).toBe(false)
    expect(play).not.toHaveBeenCalled()
  })

  it('autoplay bloqueado devolve false sem lançar', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new DOMException('bloqueado', 'NotAllowedError'),
    )
    expect(await tocarSom({ somAtivo: true, somId: 'sino', volume: 2 })).toBe(false)
  })

  it('status e pedido de permissão de notificação', async () => {
    vi.stubGlobal('Notification', undefined)
    expect(statusNotificacao()).toBe('nao_suportadas')
    expect(await pedirPermissaoNotificacao()).toBe('nao_suportadas')
    expect(notificar(true, 't', 'c')).toBe(false)

    const permissao = { valor: 'default' as NotificationPermission }
    // Imita a API estática `Notification` do navegador.
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class NotificacaoFalsa {
      static get permission() {
        return permissao.valor
      }
      static requestPermission() {
        permissao.valor = 'denied'
        return Promise.resolve(permissao.valor)
      }
    }
    vi.stubGlobal('Notification', NotificacaoFalsa)
    expect(statusNotificacao()).toBe('nao_solicitadas')
    expect(await pedirPermissaoNotificacao()).toBe('bloqueadas')
  })

  it('só notifica com permissão e aba oculta', () => {
    const criadas: string[] = []
    // Imita a API estática `Notification` do navegador.
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class NotificacaoFalsa {
      static permission = 'granted'
      constructor(titulo: string) {
        criadas.push(titulo)
      }
    }
    vi.stubGlobal('Notification', NotificacaoFalsa)
    expect(notificar(true, 'visível', 'c')).toBe(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    expect(notificar(false, 'desligada', 'c')).toBe(false)
    expect(notificar(true, 'oculta', 'c')).toBe(true)
    expect(criadas).toEqual(['oculta'])
  })
})
