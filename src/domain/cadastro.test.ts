import { describe, expect, it } from 'vitest'
import {
  calcularTroca,
  corPadrao,
  esquemaMateria,
  esquemaObjetivo,
  esquemaRenomearObjetivo,
  ordenarPorOrdem,
  PALETA_MATERIAS,
  proximaOrdem,
} from './cadastro'

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message) ?? []
}

describe('esquemaObjetivo', () => {
  it('normaliza nome e sigla', () => {
    expect(esquemaObjetivo.parse({ nome: '  Polícia   Federal ', sigla: ' pf ' })).toEqual({
      nome: 'Polícia Federal',
      sigla: 'PF',
    })
  })

  it('rejeita nome vazio ou longo', () => {
    expect(mensagens(esquemaObjetivo.safeParse({ nome: '   ', sigla: 'PF' }))).toEqual([
      'Informe o nome.',
    ])
    expect(mensagens(esquemaObjetivo.safeParse({ nome: 'x'.repeat(61), sigla: 'PF' }))).toEqual([
      'O nome deve ter no máximo 60 caracteres.',
    ])
    expect(esquemaObjetivo.safeParse({ nome: 'x'.repeat(60), sigla: 'PF' }).success).toBe(true)
  })

  it('rejeita sigla inválida com mensagem clara', () => {
    expect(mensagens(esquemaObjetivo.safeParse({ nome: 'PF', sigla: '' }))).toEqual([
      'Informe a sigla.',
    ])
    expect(mensagens(esquemaObjetivo.safeParse({ nome: 'PF', sigla: 'ABCDEFGHIJK' }))).toEqual([
      'A sigla deve ter no máximo 10 caracteres.',
    ])
    expect(mensagens(esquemaObjetivo.safeParse({ nome: 'PF', sigla: 'P-F' }))[0]).toMatch(
      /apenas letras/,
    )
  })

  it('renomear valida só o nome', () => {
    expect(esquemaRenomearObjetivo.parse({ nome: ' Carreira Fiscal ' })).toEqual({
      nome: 'Carreira Fiscal',
    })
  })
})

describe('esquemaMateria', () => {
  it('normaliza nome, descrição vazia vira null e cor em minúsculas', () => {
    expect(
      esquemaMateria.parse({ nome: ' Matemática ', descricao: '   ', cor: '#4F46E5' }),
    ).toEqual({ nome: 'Matemática', descricao: null, cor: '#4f46e5' })
  })

  it('mantém a descrição preenchida, sem espaços nas pontas', () => {
    expect(
      esquemaMateria.parse({ nome: 'Matemática', descricao: ' Edital 2026 ', cor: '#000000' })
        .descricao,
    ).toBe('Edital 2026')
  })

  it('rejeita descrição longa e cor inválida', () => {
    expect(
      mensagens(
        esquemaMateria.safeParse({ nome: 'M', descricao: 'x'.repeat(501), cor: '#000000' }),
      ),
    ).toEqual(['A descrição deve ter no máximo 500 caracteres.'])
    expect(
      mensagens(esquemaMateria.safeParse({ nome: 'M', descricao: '', cor: 'vermelho' })),
    ).toEqual(['Escolha uma cor válida.'])
  })
})

describe('corPadrao', () => {
  it('tem 12 cores hex distintas', () => {
    expect(PALETA_MATERIAS).toHaveLength(12)
    expect(new Set(PALETA_MATERIAS).size).toBe(12)
    for (const cor of PALETA_MATERIAS) expect(cor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('atribui em rodízio', () => {
    expect(corPadrao(0)).toBe(PALETA_MATERIAS[0])
    expect(corPadrao(11)).toBe(PALETA_MATERIAS[11])
    expect(corPadrao(12)).toBe(PALETA_MATERIAS[0])
    expect(corPadrao(-3)).toBe(PALETA_MATERIAS[0])
  })
})

describe('ordem', () => {
  it('próxima ordem entra no fim', () => {
    expect(proximaOrdem([])).toBe(1)
    expect(proximaOrdem([{ ordem: 3 }, { ordem: 1 }])).toBe(4)
  })

  it('ordena sem alterar a lista original', () => {
    const lista = [
      { id: 'b', ordem: 2 },
      { id: 'a', ordem: 1 },
    ]
    expect(ordenarPorOrdem(lista).map((i) => i.id)).toEqual(['a', 'b'])
    expect(lista[0]?.id).toBe('b')
  })

  const itens = [
    { id: 'a', ordem: 1 },
    { id: 'c', ordem: 5 },
    { id: 'b', ordem: 3 },
  ]

  it('troca com o vizinho de cima ou de baixo', () => {
    expect(calcularTroca(itens, 'b', 'subir')).toEqual([
      { id: 'b', ordem: 1 },
      { id: 'a', ordem: 3 },
    ])
    expect(calcularTroca(itens, 'b', 'descer')).toEqual([
      { id: 'b', ordem: 5 },
      { id: 'c', ordem: 3 },
    ])
  })

  it('não troca nas pontas nem com id inexistente', () => {
    expect(calcularTroca(itens, 'a', 'subir')).toBeNull()
    expect(calcularTroca(itens, 'c', 'descer')).toBeNull()
    expect(calcularTroca(itens, 'x', 'subir')).toBeNull()
  })
})
