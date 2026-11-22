// Validações e regras de ordem do cadastro de objetivos e matérias. Funções puras.
import { z } from 'zod'
import { normalizarNome, normalizarSigla, TAMANHO_MAXIMO_SIGLA, validarSigla } from './codigo'

export const TAMANHO_MAXIMO_NOME = 60
export const TAMANHO_MAXIMO_DESCRICAO = 500

const MENSAGENS_SIGLA = {
  vazia: 'Informe a sigla.',
  longa: `A sigla deve ter no máximo ${TAMANHO_MAXIMO_SIGLA} caracteres.`,
  caracteres: 'A sigla aceita apenas letras de A a Z e números, sem espaços nem acentos.',
} as const

const esquemaNome = z
  .string()
  .transform(normalizarNome)
  .pipe(
    z
      .string()
      .min(1, 'Informe o nome.')
      .max(TAMANHO_MAXIMO_NOME, `O nome deve ter no máximo ${TAMANHO_MAXIMO_NOME} caracteres.`),
  )

const esquemaSigla = z
  .string()
  .transform(normalizarSigla)
  .superRefine((sigla, ctx) => {
    const problema = validarSigla(sigla)
    if (problema) ctx.addIssue({ code: 'custom', message: MENSAGENS_SIGLA[problema] })
  })

export const esquemaObjetivo = z.object({ nome: esquemaNome, sigla: esquemaSigla })
export const esquemaRenomearObjetivo = z.object({ nome: esquemaNome })

const PADRAO_COR = /^#[0-9a-f]{6}$/

export const esquemaMateria = z.object({
  nome: esquemaNome,
  descricao: z
    .string()
    .transform((texto) => texto.trim())
    .pipe(
      z
        .string()
        .max(
          TAMANHO_MAXIMO_DESCRICAO,
          `A descrição deve ter no máximo ${TAMANHO_MAXIMO_DESCRICAO} caracteres.`,
        ),
    )
    .transform((texto) => (texto === '' ? null : texto)),
  cor: z
    .string()
    .transform((cor) => cor.trim().toLowerCase())
    .pipe(z.string().regex(PADRAO_COR, 'Escolha uma cor válida.')),
})

export type DadosObjetivo = z.input<typeof esquemaObjetivo>
export type DadosMateria = z.input<typeof esquemaMateria>

/** Paleta padrão das matérias, atribuída em rodízio. */
export const PALETA_MATERIAS = [
  '#4f46e5', // índigo
  '#2563eb', // azul
  '#0891b2', // ciano
  '#0d9488', // verde-azulado
  '#16a34a', // verde
  '#65a30d', // lima
  '#ca8a04', // amarelo
  '#ea580c', // laranja
  '#dc2626', // vermelho
  '#db2777', // rosa
  '#9333ea', // roxo
  '#475569', // ardósia
] as const

/** Cor padrão da próxima matéria, em rodízio pela quantidade de matérias já criadas. */
export function corPadrao(quantidadeMaterias: number): string {
  const indice = Math.max(0, Math.trunc(quantidadeMaterias)) % PALETA_MATERIAS.length
  return PALETA_MATERIAS[indice] ?? PALETA_MATERIAS[0]
}

interface ItemOrdenavel {
  id: string
  ordem: number
}

/** Ordem para um item novo: entra no fim da lista. */
export function proximaOrdem(itens: readonly { ordem: number }[]): number {
  return itens.reduce((maior, item) => Math.max(maior, item.ordem), 0) + 1
}

/** Ordena pela `ordem` (RN05), sem alterar a lista original. */
export function ordenarPorOrdem<T extends { ordem: number }>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => a.ordem - b.ordem)
}

export type Direcao = 'subir' | 'descer'

export interface TrocaOrdem {
  id: string
  ordem: number
}

/**
 * Calcula a troca de posição de um item com o vizinho **da lista recebida**
 * (a lista visível na tela). Retorna as duas novas ordens ou `null` quando
 * não há o que trocar (item na ponta ou inexistente).
 */
export function calcularTroca(
  itens: readonly ItemOrdenavel[],
  id: string,
  direcao: Direcao,
): [TrocaOrdem, TrocaOrdem] | null {
  const lista = ordenarPorOrdem(itens)
  const indice = lista.findIndex((item) => item.id === id)
  if (indice === -1) return null
  const vizinho = lista[direcao === 'subir' ? indice - 1 : indice + 1]
  const atual = lista[indice]
  if (!vizinho || !atual) return null
  return [
    { id: atual.id, ordem: vizinho.ordem },
    { id: vizinho.id, ordem: atual.ordem },
  ]
}
