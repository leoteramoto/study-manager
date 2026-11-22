import { afterEach, describe, expect, it, vi } from 'vitest'
import { consultarPersistencia, solicitarPersistencia } from './armazenamento'

afterEach(() => {
  vi.unstubAllGlobals()
})

function simularStorage(storage: unknown) {
  vi.stubGlobal('navigator', { storage })
}

describe('armazenamento persistente', () => {
  it('repassa a resposta do navegador', async () => {
    simularStorage({ persist: () => Promise.resolve(true), persisted: () => Promise.resolve(true) })
    expect(await solicitarPersistencia()).toBe(true)
    expect(await consultarPersistencia()).toBe(true)
  })

  it('retorna null quando a API não existe', async () => {
    vi.stubGlobal('navigator', {})
    expect(await solicitarPersistencia()).toBeNull()
    expect(await consultarPersistencia()).toBeNull()
  })

  it('retorna null quando a API falha', async () => {
    simularStorage({
      persist: () => Promise.reject(new Error('negado')),
      persisted: () => Promise.reject(new Error('negado')),
    })
    expect(await solicitarPersistencia()).toBeNull()
    expect(await consultarPersistencia()).toBeNull()
  })
})
