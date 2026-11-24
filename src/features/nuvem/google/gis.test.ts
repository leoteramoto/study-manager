import { afterEach, describe, expect, it } from 'vitest'
import { criarGoogleFalso } from '@/test/googleFalso'
import { carregarGis, lerOauth2Gis, reiniciarCarregadorGis, URL_SCRIPT_GIS } from './gis'

function scriptsGis(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>(`script[src="${URL_SCRIPT_GIS}"]`)]
}

afterEach(() => {
  for (const script of scriptsGis()) script.remove()
  Reflect.deleteProperty(window, 'google')
  reiniciarCarregadorGis()
})

describe('lerOauth2Gis', () => {
  it('aceita só a forma esperada', () => {
    const { oauth2 } = criarGoogleFalso()
    expect(lerOauth2Gis({ google: { accounts: { oauth2 } } })).toBe(oauth2)
    expect(lerOauth2Gis({})).toBeNull()
    expect(lerOauth2Gis({ google: 'x' })).toBeNull()
    expect(lerOauth2Gis({ google: {} })).toBeNull()
    expect(lerOauth2Gis({ google: { accounts: {} } })).toBeNull()
    expect(lerOauth2Gis({ google: { accounts: { oauth2: { initTokenClient: 1 } } } })).toBeNull()
  })
})

describe('carregarGis', () => {
  it('insere um script só, assíncrono, da URL do Google', async () => {
    const primeira = carregarGis()
    const segunda = carregarGis()
    expect(scriptsGis()).toHaveLength(1)
    expect(scriptsGis()[0]?.async).toBe(true)

    const { oauth2 } = criarGoogleFalso()
    Reflect.set(window, 'google', { accounts: { oauth2 } })
    scriptsGis()[0]?.dispatchEvent(new Event('load'))
    await expect(primeira).resolves.toBe(oauth2)
    await expect(segunda).resolves.toBe(oauth2)
    // Já carregado: não insere outro.
    await expect(carregarGis()).resolves.toBe(oauth2)
    expect(scriptsGis()).toHaveLength(1)
  })

  it('falha de carregamento resolve null e a próxima chamada tenta de novo', async () => {
    const tentativa = carregarGis()
    scriptsGis()[0]?.dispatchEvent(new Event('error'))
    await expect(tentativa).resolves.toBeNull()
    expect(scriptsGis()).toHaveLength(0)

    void carregarGis()
    expect(scriptsGis()).toHaveLength(1)
  })

  it('script carregado sem a API esperada resolve null', async () => {
    const tentativa = carregarGis()
    scriptsGis()[0]?.dispatchEvent(new Event('load'))
    await expect(tentativa).resolves.toBeNull()
    expect(scriptsGis()).toHaveLength(0)
  })

  it('documento sem janela resolve null', async () => {
    const documento = document.implementation.createHTMLDocument('')
    await expect(carregarGis(documento)).resolves.toBeNull()
  })
})
