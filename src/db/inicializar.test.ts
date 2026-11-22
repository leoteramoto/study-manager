import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './banco'
import { inicializarBanco } from './inicializar'

const persist = vi.fn(() => Promise.resolve(true))

beforeEach(async () => {
  await db.delete()
  persist.mockClear()
  vi.stubGlobal('navigator', {
    storage: { persist, persisted: () => Promise.resolve(false) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  db.close()
})

describe('inicializarBanco', () => {
  it('não espera a resposta do pedido de persistência para terminar', async () => {
    persist.mockImplementationOnce(() => new Promise<boolean>(() => undefined))
    await inicializarBanco()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('pede armazenamento persistente só na primeira execução', async () => {
    await inicializarBanco()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(await db.configuracoes.count()).toBe(1)

    db.close()
    await inicializarBanco()
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
