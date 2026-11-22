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
