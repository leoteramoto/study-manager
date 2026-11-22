import { describe, expect, it } from 'vitest'
import {
  chaveComparacao,
  codigoEmUso,
  gerarCodigo,
  normalizarNome,
  normalizarSigla,
  siglaEmUso,
  validarSigla,
} from './codigo'

describe('normalizarSigla', () => {
  it('converte para maiúsculas e remove espaços nas pontas', () => {
    expect(normalizarSigla('  pf ')).toBe('PF')
    expect(normalizarSigla('cf2')).toBe('CF2')
  })

  it('não remove caracteres inválidos em silêncio', () => {
    expect(normalizarSigla('p f')).toBe('P F')
    expect(normalizarSigla('ç')).toBe('Ç')
  })
})

describe('validarSigla', () => {
  it('aceita de 1 a 10 caracteres [A-Z0-9]', () => {
    expect(validarSigla('P')).toBeNull()
    expect(validarSigla('ABCDE12345')).toBeNull()
  })

  it('rejeita vazia, longa e caracteres fora do padrão', () => {
    expect(validarSigla('')).toBe('vazia')
    expect(validarSigla('ABCDE123456')).toBe('longa')
    expect(validarSigla('P F')).toBe('caracteres')
    expect(validarSigla('P-F')).toBe('caracteres')
    expect(validarSigla('Ç')).toBe('caracteres')
    expect(validarSigla('pf')).toBe('caracteres')
  })
})

describe('normalizarNome', () => {
  it('remove espaços nas pontas e reduz espaços internos repetidos', () => {
    expect(normalizarNome('  Direito   Penal  ')).toBe('Direito Penal')
    expect(normalizarNome('Direito\tPenal')).toBe('Direito Penal')
  })

  it('unifica a forma Unicode dos acentos (NFC)', () => {
    const decomposto = 'Matemática'
    expect(normalizarNome(decomposto)).toBe('Matemática')
  })
})

describe('gerarCodigo', () => {
  it('gera NomeDaMatéria-SIGLA (RF02)', () => {
    expect(gerarCodigo('Matemática', 'PF')).toBe('Matemática-PF')
    expect(gerarCodigo('  Matemática   Básica ', 'PF')).toBe('Matemática Básica-PF')
  })
})

describe('chaveComparacao', () => {
  it('ignora maiúsculas e espaços nas pontas, mas não acentos', () => {
    expect(chaveComparacao(' MATEMÁTICA-pf ')).toBe(chaveComparacao('Matemática-PF'))
    expect(chaveComparacao('Matematica-PF')).not.toBe(chaveComparacao('Matemática-PF'))
  })
})

describe('siglaEmUso', () => {
  const objetivos = [{ sigla: 'PF' }, { sigla: 'CF' }]

  it('detecta sigla repetida sem diferenciar maiúsculas (RF01)', () => {
    expect(siglaEmUso(objetivos, 'PF')).toBe(true)
    expect(siglaEmUso(objetivos, 'pf')).toBe(true)
    expect(siglaEmUso(objetivos, 'PRF')).toBe(false)
  })
})

describe('codigoEmUso', () => {
  const materias = [
    { id: 'a', codigo: 'Matemática-PF' },
    { id: 'b', codigo: 'Matemática-CF' },
  ]

  it('detecta código repetido sem diferenciar maiúsculas', () => {
    expect(codigoEmUso(materias, 'matemática-pf')).toBe(true)
    expect(codigoEmUso(materias, 'Português-PF')).toBe(false)
  })

  it('ignora a própria matéria ao renomear', () => {
    expect(codigoEmUso(materias, 'MATEMÁTICA-PF', 'a')).toBe(false)
    expect(codigoEmUso(materias, 'Matemática-CF', 'a')).toBe(true)
  })
})
