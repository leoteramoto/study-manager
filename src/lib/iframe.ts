/** Partes da janela usadas pela detecção (injetáveis nos testes). */
export interface JanelaComTopo {
  readonly self: unknown
  readonly top: unknown
}

/**
 * Indica se o app está dentro de um iframe (proteção contra clickjacking, Fase 8).
 *
 * O GitHub Pages não deixa mandar `X-Frame-Options` nem `frame-ancestors` (a
 * `<meta>` CSP ignora essa diretiva), então a proteção é no próprio app.
 * Comparar `self` com `top` funciona mesmo com o topo em outra origem. Se a
 * leitura lançar erro (navegador restritivo), trata como iframe: na dúvida, o
 * app não monta.
 */
export function estaEmIframe(janela: JanelaComTopo = window): boolean {
  try {
    return janela.self !== janela.top
  } catch {
    return true
  }
}
