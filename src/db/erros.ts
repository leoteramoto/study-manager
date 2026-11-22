import type { z } from 'zod'

/** Erro de regra de negócio, com mensagem pronta para o usuário. */
export class ErroNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroNegocio'
  }
}

/** Valida com Zod e converte a primeira falha em `ErroNegocio`. */
export function validarOuFalhar<T extends z.ZodType>(esquema: T, dados: unknown): z.output<T> {
  const resultado = esquema.safeParse(dados)
  if (!resultado.success) {
    throw new ErroNegocio(resultado.error.issues[0]?.message ?? 'Dados inválidos.')
  }
  return resultado.data
}

/** Mensagem amigável para qualquer erro; detalhes só no console em desenvolvimento. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroNegocio) return erro.message
  if (import.meta.env.DEV) console.error(erro)
  return 'Não foi possível salvar. Tente novamente.'
}
