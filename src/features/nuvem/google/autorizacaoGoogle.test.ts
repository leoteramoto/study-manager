import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ESCOPO_DRIVE,
  MARGEM_EXPIRACAO_TOKEN_MS,
  TEMPO_LIMITE_AUTORIZACAO_MS,
} from '@/domain/backupNuvem'
import { criarGoogleFalso, TOKEN_FALSO } from '@/test/googleFalso'
import { AutorizacaoGoogle, TEMPO_LIMITE_REVOGACAO_MS } from './autorizacaoGoogle'
import type { Oauth2Gis } from './gis'

let google: ReturnType<typeof criarGoogleFalso>
let registrarErro: ReturnType<typeof vi.fn<(contexto: string, erro: unknown) => void>>

function criar(carregar: () => Promise<Oauth2Gis | null> = () => Promise.resolve(google.oauth2)) {
  return new AutorizacaoGoogle({
    clientId: 'cliente.apps.googleusercontent.com',
    carregarGis: carregar,
    registrarErro,
  })
}

async function pronta() {
  const autorizacao = criar()
  await autorizacao.preparar()
  return autorizacao
}

const SEM_DICA = { dicaEmail: null, escolherConta: false }

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-23T15:00:00.000Z') })
  google = criarGoogleFalso()
  registrarErro = vi.fn<(contexto: string, erro: unknown) => void>()
})

afterEach(() => {
  // Nenhum log, em nenhum teste, contém o token.
  for (const chamada of registrarErro.mock.calls) {
    const texto = chamada
      .map((parte) => (parte instanceof Error ? `${parte.name} ${parte.message}` : String(parte)))
      .join(' ')
    expect(texto).not.toContain(TOKEN_FALSO)
  }
  vi.useRealTimers()
})

describe('preparar', () => {
  it('carrega uma vez e cria o token client com o escopo drive.file', async () => {
    const carregar = vi.fn(() => Promise.resolve(google.oauth2))
    const autorizacao = criar(carregar)
    await Promise.all([autorizacao.preparar(), autorizacao.preparar()])
    await autorizacao.preparar()
    expect(carregar).toHaveBeenCalledOnce()
    expect(google.configuracao()).toMatchObject({
      client_id: 'cliente.apps.googleusercontent.com',
      scope: ESCOPO_DRIVE,
    })
  })

  it('falha no carregamento: tenta de novo na próxima vez', async () => {
    const carregar = vi
      .fn<() => Promise<Oauth2Gis | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(google.oauth2)
    const autorizacao = criar(carregar)
    await autorizacao.preparar()
    await expect(autorizacao.autorizar(SEM_DICA)).resolves.toBe(false)
    await autorizacao.preparar()
    expect(carregar).toHaveBeenCalledTimes(2)
    expect(registrarErro).toHaveBeenCalledWith('carregamento', expect.any(Error))
  })
})

describe('autorizar: contrato (nunca rejeita, resolve false nas falhas)', () => {
  it('antes de o script carregar: false na hora e nenhum popup depois', async () => {
    let liberar: (api: Oauth2Gis) => void = () => undefined
    const autorizacao = criar(
      () =>
        new Promise((resolver) => {
          liberar = resolver
        }),
    )
    void autorizacao.preparar()
    await expect(autorizacao.autorizar(SEM_DICA)).resolves.toBe(false)
    liberar(google.oauth2)
    await vi.runAllTimersAsync()
    expect(google.pedidos).toHaveLength(0)
  })

  it('pede o token de forma síncrona, com prompt vazio e login_hint', async () => {
    const autorizacao = await pronta()
    const promessa = autorizacao.autorizar({
      dicaEmail: 'pessoa@example.com',
      escolherConta: false,
    })
    // Sem nenhum await: o popup sai ainda dentro do clique.
    expect(google.pedidos).toEqual([{ prompt: '', login_hint: 'pessoa@example.com' }])
    google.concederToken()
    await expect(promessa).resolves.toBe(true)
  })

  it('"Conectar" deixa escolher a conta, sem dica', async () => {
    const autorizacao = await pronta()
    void autorizacao.autorizar({ dicaEmail: null, escolherConta: true })
    expect(google.pedidos).toEqual([{ prompt: 'select_account' }])
  })

  it('token concedido: guarda em memória e avisa', async () => {
    const autorizacao = await pronta()
    const ouvinte = vi.fn()
    autorizacao.aoMudarToken(ouvinte)
    const promessa = autorizacao.autorizar(SEM_DICA)
    google.concederToken()
    await expect(promessa).resolves.toBe(true)
    expect(autorizacao.temToken()).toBe(true)
    expect(autorizacao.tokenAtual()).toBe(TOKEN_FALSO)
    expect(ouvinte).toHaveBeenCalledOnce()
  })

  it.each(['popup_failed_to_open', 'popup_closed', 'unknown'])(
    'erro do popup (%s) resolve false',
    async (tipo) => {
      const autorizacao = await pronta()
      const promessa = autorizacao.autorizar(SEM_DICA)
      google.erroPopup(tipo)
      await expect(promessa).resolves.toBe(false)
      expect(autorizacao.temToken()).toBe(false)
      expect(registrarErro).toHaveBeenCalledWith('autorizacao', expect.any(Error))
    },
  )

  it.each([
    ['erro OAuth', { error: 'access_denied' }],
    ['escopo negado', { access_token: 'x', expires_in: 3599, scope: 'openid' }],
    ['resposta inválida', 'lixo'],
  ])('%s resolve false', async (_caso, resposta) => {
    const autorizacao = await pronta()
    const promessa = autorizacao.autorizar(SEM_DICA)
    google.responder(resposta)
    await expect(promessa).resolves.toBe(false)
    expect(autorizacao.temToken()).toBe(false)
  })

  it('requestAccessToken que lança resolve false', async () => {
    const autorizacao = await pronta()
    google.definirFalhaNoPedido(true)
    await expect(autorizacao.autorizar(SEM_DICA)).resolves.toBe(false)
  })

  it('sem resposta: false no tempo limite; token tardio ainda é usado', async () => {
    const autorizacao = await pronta()
    const ouvinte = vi.fn()
    autorizacao.aoMudarToken(ouvinte)
    const promessa = autorizacao.autorizar(SEM_DICA)

    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_AUTORIZACAO_MS - 1)
    let resolvido: boolean | null = null
    void promessa.then((valor) => {
      resolvido = valor
    })
    await Promise.resolve()
    expect(resolvido).toBeNull()

    await vi.advanceTimersByTimeAsync(1)
    await expect(promessa).resolves.toBe(false)

    // O usuário termina o login depois do limite.
    google.concederToken()
    expect(autorizacao.temToken()).toBe(true)
    expect(ouvinte).toHaveBeenCalledOnce()
  })

  it('clique duplo com pedido em andamento não abre segundo popup', async () => {
    const autorizacao = await pronta()
    const primeiro = autorizacao.autorizar(SEM_DICA)
    const segundo = autorizacao.autorizar(SEM_DICA)
    expect(segundo).toBe(primeiro)
    expect(google.pedidos).toHaveLength(1)
    google.concederToken()
    await expect(segundo).resolves.toBe(true)
    // Terminado o pedido, um novo clique pode pedir de novo.
    void autorizacao.autorizar(SEM_DICA)
    expect(google.pedidos).toHaveLength(2)
  })
})

describe('validade do token', () => {
  it('vence com a margem e avisa os ouvintes', async () => {
    const autorizacao = await pronta()
    const promessa = autorizacao.autorizar(SEM_DICA)
    google.concederToken(3600)
    await promessa
    const ouvinte = vi.fn()
    autorizacao.aoMudarToken(ouvinte)

    await vi.advanceTimersByTimeAsync(3600_000 - MARGEM_EXPIRACAO_TOKEN_MS - 1)
    expect(autorizacao.temToken()).toBe(true)
    await vi.advanceTimersByTimeAsync(2)
    expect(autorizacao.temToken()).toBe(false)
    expect(autorizacao.tokenAtual()).toBeNull()
    expect(ouvinte).toHaveBeenCalledOnce()
  })

  it('esquecerToken limpa e avisa; sem token, não avisa', async () => {
    const autorizacao = await pronta()
    const ouvinte = vi.fn()
    const parar = autorizacao.aoMudarToken(ouvinte)
    autorizacao.esquecerToken()
    expect(ouvinte).not.toHaveBeenCalled()
    void autorizacao.autorizar(SEM_DICA)
    google.concederToken()
    autorizacao.esquecerToken()
    expect(autorizacao.temToken()).toBe(false)
    expect(ouvinte).toHaveBeenCalledTimes(2)
    parar()
  })
})

describe('revogar', () => {
  async function comToken() {
    const autorizacao = await pronta()
    void autorizacao.autorizar(SEM_DICA)
    google.concederToken()
    return autorizacao
  }

  it('revoga e esquece o token', async () => {
    const autorizacao = await comToken()
    await autorizacao.revogar()
    expect(google.revogados).toEqual([TOKEN_FALSO])
    expect(autorizacao.temToken()).toBe(false)
  })

  it('revoke que lança não impede a desconexão', async () => {
    const autorizacao = await comToken()
    google.definirRevogacao('lanca')
    await expect(autorizacao.revogar()).resolves.toBeUndefined()
    expect(autorizacao.temToken()).toBe(false)
  })

  it('revoke sem resposta termina no tempo limite', async () => {
    const autorizacao = await comToken()
    google.definirRevogacao('silencio')
    const promessa = autorizacao.revogar()
    expect(autorizacao.temToken()).toBe(false)
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_REVOGACAO_MS)
    await expect(promessa).resolves.toBeUndefined()
  })

  it('sem token ou sem script, não chama o Google', async () => {
    await (await pronta()).revogar()
    await criar().revogar()
    expect(google.revogados).toEqual([])
  })
})
