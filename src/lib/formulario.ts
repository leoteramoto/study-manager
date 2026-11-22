import type { z } from 'zod'

/** Primeira mensagem de erro de cada campo de um formulário validado com Zod. */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const erros: Record<string, string> = {}
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? '')
    erros[campo] ??= issue.message
  }
  return erros
}
