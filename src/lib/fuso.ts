export const FUSO_PADRAO = 'America/Sao_Paulo'

/** Indica se o identificador IANA é aceito pelo `Intl` do navegador. */
export function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso })
    return true
  } catch {
    return false
  }
}

/**
 * Fuso horário do navegador; se não for possível detectá-lo,
 * `America/Sao_Paulo` (tabela `configuracoes`, campo `fusoHorario`).
 */
export function detectarFusoNavegador(
  obterFuso: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  try {
    const fuso = obterFuso()
    return fuso && fusoValido(fuso) ? fuso : FUSO_PADRAO
  } catch {
    return FUSO_PADRAO
  }
}

/** Fusos brasileiros com nome amigável (RN37). */
export const FUSOS_BRASIL = [
  { id: 'America/Noronha', nome: 'Fernando de Noronha' },
  { id: 'America/Sao_Paulo', nome: 'Brasília' },
  { id: 'America/Manaus', nome: 'Amazonas' },
  { id: 'America/Rio_Branco', nome: 'Acre' },
] as const

export function fusoDoBrasil(fuso: string): boolean {
  return FUSOS_BRASIL.some((f) => f.id === fuso)
}

/**
 * Nome canônico do fuso segundo o `Intl` (ex.: `america/sao_paulo` vira
 * `America/Sao_Paulo`). Retorna `null` para fuso desconhecido.
 */
export function canonizarFuso(fuso: string): string | null {
  const limpo = fuso.trim()
  if (!limpo || !fusoValido(limpo)) return null
  return new Intl.DateTimeFormat('pt-BR', { timeZone: limpo }).resolvedOptions().timeZone
}

/** Todos os fusos IANA conhecidos pelo navegador, para a opção "Outros". */
export function listarFusosIana(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}
