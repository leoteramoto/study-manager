import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, NOME_BANCO } from './banco'
import { classificarFalhaBanco, ErroVersaoBanco, inicializarBanco } from './inicializar'

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

describe('falha de versão (RN36)', () => {
  it('recusa abrir um banco gravado por versão mais nova, sem apagar nada', async () => {
    db.close()
    // Simula o banco de uma versão futura do app (versão 2 do Dexie = 20 no IndexedDB).
    await new Promise<void>((resolver, rejeitar) => {
      const pedido = indexedDB.open(NOME_BANCO, 20)
      pedido.onupgradeneeded = () => {
        pedido.result.createObjectStore('objetivos', { keyPath: 'id' })
      }
      pedido.onsuccess = () => {
        pedido.result.close()
        resolver()
      }
      pedido.onerror = () => {
        rejeitar(pedido.error ?? new Error('falha ao abrir'))
      }
    })
    const erro: unknown = await inicializarBanco().catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroVersaoBanco)
    expect(classificarFalhaBanco(erro)).toBe('versao')
    expect(db.isOpen()).toBe(false)
    expect(persist).not.toHaveBeenCalled()
  })

  it('classifica VersionError como versão e o resto como outra falha', () => {
    expect(classificarFalhaBanco({ name: 'VersionError' })).toBe('versao')
    expect(
      classificarFalhaBanco({ name: 'OpenFailedError', inner: { name: 'VersionError' } }),
    ).toBe('versao')
    expect(classificarFalhaBanco(new Error('corrompido'))).toBe('outra')
    expect(classificarFalhaBanco(undefined)).toBe('outra')
  })
})
