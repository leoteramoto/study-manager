// Regras de sigla e de código de matéria (RN01, RN03). Funções puras.

export const TAMANHO_MAXIMO_SIGLA = 10
const PADRAO_SIGLA = /^[A-Z0-9]+$/

/** Converte para maiúsculas e remove espaços nas pontas. Não remove outros caracteres. */
export function normalizarSigla(texto: string): string {
  return texto.normalize('NFC').trim().toLocaleUpperCase('pt-BR')
}

export type ProblemaSigla = 'vazia' | 'longa' | 'caracteres'

/** Valida uma sigla **já normalizada**. Retorna `null` quando é válida. */
export function validarSigla(sigla: string): ProblemaSigla | null {
  if (sigla.length === 0) return 'vazia'
  if (sigla.length > TAMANHO_MAXIMO_SIGLA) return 'longa'
  if (!PADRAO_SIGLA.test(sigla)) return 'caracteres'
  return null
}

/** Remove espaços nas pontas e reduz espaços internos repetidos a um só. */
export function normalizarNome(texto: string): string {
  return texto.normalize('NFC').trim().replace(/\s+/g, ' ')
}

/** Código da matéria: `NomeDaMatéria-SIGLA` (RN03). */
export function gerarCodigo(nome: string, sigla: string): string {
  return `${normalizarNome(nome)}-${sigla}`
}

/** Chave usada para comparar siglas e códigos: ignora maiúsculas e espaços nas pontas. */
export function chaveComparacao(texto: string): string {
  return texto.normalize('NFC').trim().toLocaleLowerCase('pt-BR')
}

/**
 * Indica se a sigla já existe. Considera objetivos arquivados,
 * porque a sigla é única no sistema inteiro (RN01).
 */
export function siglaEmUso(objetivos: readonly { sigla: string }[], sigla: string): boolean {
  const chave = chaveComparacao(sigla)
  return objetivos.some((o) => chaveComparacao(o.sigla) === chave)
}

/**
 * Indica se o código já pertence a outra matéria (arquivada ou não).
 * `ignorarId` permite renomear uma matéria sem conflitar com ela mesma.
 */
export function codigoEmUso(
  materias: readonly { id: string; codigo: string }[],
  codigo: string,
  ignorarId?: string,
): boolean {
  const chave = chaveComparacao(codigo)
  return materias.some((m) => m.id !== ignorarId && chaveComparacao(m.codigo) === chave)
}
