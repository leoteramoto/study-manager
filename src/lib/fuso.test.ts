import { describe, expect, it } from 'vitest'
import { detectarFusoNavegador, FUSO_PADRAO, fusoValido } from './fuso'

describe('detectarFusoNavegador', () => {
  it('usa o fuso informado pelo navegador quando é válido', () => {
    expect(detectarFusoNavegador(() => 'America/Manaus')).toBe('America/Manaus')
  })

  it('cai para America/Sao_Paulo quando o fuso não é detectado', () => {
    expect(detectarFusoNavegador(() => undefined)).toBe(FUSO_PADRAO)
    expect(detectarFusoNavegador(() => '')).toBe(FUSO_PADRAO)
  })

  it('cai para America/Sao_Paulo quando o fuso é inválido ou a detecção falha', () => {
    expect(detectarFusoNavegador(() => 'Fuso/Inexistente')).toBe(FUSO_PADRAO)
    expect(
      detectarFusoNavegador(() => {
        throw new Error('sem Intl')
      }),
    ).toBe(FUSO_PADRAO)
  })

  it('usa o Intl do ambiente por padrão', () => {
    expect(fusoValido(detectarFusoNavegador())).toBe(true)
  })
})
