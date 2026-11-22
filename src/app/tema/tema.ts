/** Preferência de tema da interface. Fica no localStorage, fora do banco e do backup. */
export type PreferenciaTema = 'sistema' | 'claro' | 'escuro'

export const CHAVE_TEMA = 'study-manager:tema'
export const CONSULTA_ESCURO = '(prefers-color-scheme: dark)'

export const OPCOES_TEMA: readonly { valor: PreferenciaTema; rotulo: string }[] = [
  { valor: 'sistema', rotulo: 'Sistema' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
]

export function ehPreferenciaTema(valor: unknown): valor is PreferenciaTema {
  return valor === 'sistema' || valor === 'claro' || valor === 'escuro'
}

export function lerPreferenciaTema(): PreferenciaTema {
  try {
    const valor = localStorage.getItem(CHAVE_TEMA)
    return ehPreferenciaTema(valor) ? valor : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function salvarPreferenciaTema(preferencia: PreferenciaTema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, preferencia)
  } catch {
    // Sem localStorage (modo privado restrito): a escolha vale só nesta sessão.
  }
}

export function resolverTemaEscuro(preferencia: PreferenciaTema, sistemaEscuro: boolean): boolean {
  return preferencia === 'escuro' || (preferencia === 'sistema' && sistemaEscuro)
}

export function sistemaPrefereEscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_ESCURO).matches
}
