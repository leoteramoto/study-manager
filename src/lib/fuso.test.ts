import { describe, expect, it } from 'vitest'
import {
  canonizarFuso,
  detectarFusoNavegador,
  FUSO_PADRAO,
  FUSOS_BRASIL,
  fusoDoBrasil,
  fusoValido,
  listarFusosIana,
} from './fuso'

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

describe('canonizarFuso', () => {
  it('devolve o nome canônico ou null', () => {
    expect(canonizarFuso(' America/Manaus ')).toBe('America/Manaus')
    expect(canonizarFuso('america/sao_paulo')).toBe('America/Sao_Paulo')
    expect(canonizarFuso('Lua/Cratera')).toBeNull()
    expect(canonizarFuso('')).toBeNull()
  })
})

describe('FUSOS_BRASIL e listarFusosIana', () => {
  it('lista os 4 fusos brasileiros e os fusos do navegador', () => {
    expect(FUSOS_BRASIL.map((f) => f.id)).toEqual([
      'America/Noronha',
      'America/Sao_Paulo',
      'America/Manaus',
      'America/Rio_Branco',
    ])
    expect(fusoDoBrasil('America/Manaus')).toBe(true)
    expect(fusoDoBrasil('Europe/Lisbon')).toBe(false)
    expect(listarFusosIana()).toContain('Europe/Lisbon')
  })
})
