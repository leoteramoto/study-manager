import { describe, expect, it } from 'vitest'
import { estaEmIframe } from './iframe'

describe('estaEmIframe', () => {
  it('fora de iframe, self e top são a mesma janela', () => {
    const janela = { self: null as unknown, top: null as unknown }
    janela.self = janela
    janela.top = janela
    expect(estaEmIframe(janela)).toBe(false)
  })

  it('dentro de iframe, top é outra janela', () => {
    const topo = {}
    const janela = { self: null as unknown, top: topo }
    janela.self = janela
    expect(estaEmIframe(janela)).toBe(true)
  })

  it('se ler top lançar erro, trata como iframe', () => {
    const janela = {
      get self() {
        return janela
      },
      get top(): unknown {
        throw new Error('bloqueado')
      },
    }
    expect(estaEmIframe(janela)).toBe(true)
  })

  it('na janela do jsdom, não está em iframe', () => {
    expect(estaEmIframe()).toBe(false)
  })
})
