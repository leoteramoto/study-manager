import { afterEach, describe, expect, it } from 'vitest'
import { CHAVE_TEMA, lerPreferenciaTema, resolverTemaEscuro, salvarPreferenciaTema } from './tema'

afterEach(() => {
  localStorage.clear()
})

describe('tema', () => {
  it('resolve o tema escuro a partir da preferência e do sistema', () => {
    expect(resolverTemaEscuro('escuro', false)).toBe(true)
    expect(resolverTemaEscuro('claro', true)).toBe(false)
    expect(resolverTemaEscuro('sistema', true)).toBe(true)
    expect(resolverTemaEscuro('sistema', false)).toBe(false)
  })

  it('lê "sistema" quando não há preferência válida salva', () => {
    expect(lerPreferenciaTema()).toBe('sistema')
    localStorage.setItem(CHAVE_TEMA, 'roxo')
    expect(lerPreferenciaTema()).toBe('sistema')
  })

  it('salva e lê a preferência', () => {
    salvarPreferenciaTema('escuro')
    expect(lerPreferenciaTema()).toBe('escuro')
  })
})
