/** Elementos em que o Espaço já tem função própria (digitar, marcar, clicar). */
const SELETOR_INTERATIVO = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="tab"]',
].join(',')

/**
 * O Espaço pausa/continua a sessão (RN26) só quando o foco não está num
 * elemento interativo e nenhum diálogo está aberto.
 */
export function atalhoEspacoPermitido(evento: KeyboardEvent): boolean {
  if (evento.code !== 'Space' && evento.key !== ' ') return false
  if (evento.repeat || evento.ctrlKey || evento.altKey || evento.metaKey || evento.shiftKey) {
    return false
  }
  if (evento.defaultPrevented) return false
  const alvo = evento.target
  if (alvo instanceof Element && alvo.closest(SELETOR_INTERATIVO)) return false
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
  return true
}
