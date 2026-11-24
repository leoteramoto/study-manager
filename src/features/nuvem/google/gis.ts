// Carregador do Google Identity Services (GIS). É a única exceção à regra
// "sem scripts externos" (RN41, RN51): o Google só permite carregá-lo desta
// URL. Carregado uma vez, sob demanda, e só com `VITE_GOOGLE_CLIENT_ID`.
//
// Os tipos abaixo cobrem só o que o app usa do token model (sem dependência
// nova). O objeto global é conferido antes do uso.

export const URL_SCRIPT_GIS = 'https://accounts.google.com/gsi/client'

export interface ConfigTokenClientGis {
  client_id: string
  scope: string
  /** Resposta do token (ou de erro OAuth, com `error`). */
  callback: (resposta: unknown) => void
  /** Erros do popup: `popup_failed_to_open`, `popup_closed` ou `unknown`. */
  error_callback: (erro: unknown) => void
}

export interface PedidoTokenGis {
  /** `''`: só pede consentimento na primeira vez; `select_account`: escolher a conta. */
  prompt: string
  login_hint?: string
}

export interface TokenClientGis {
  requestAccessToken(pedido?: PedidoTokenGis): void
}

export interface Oauth2Gis {
  initTokenClient(config: ConfigTokenClientGis): TokenClientGis
  revoke(token: string, concluido: (resposta: unknown) => void): void
}

/** Lê `window.google.accounts.oauth2`, conferindo a forma antes de usar. */
export function lerOauth2Gis(janela: object): Oauth2Gis | null {
  const google: unknown = Reflect.get(janela, 'google')
  if (typeof google !== 'object' || google === null) return null
  const contas: unknown = Reflect.get(google, 'accounts')
  if (typeof contas !== 'object' || contas === null) return null
  const oauth2: unknown = Reflect.get(contas, 'oauth2')
  if (typeof oauth2 !== 'object' || oauth2 === null) return null
  const init: unknown = Reflect.get(oauth2, 'initTokenClient')
  const revoke: unknown = Reflect.get(oauth2, 'revoke')
  if (typeof init !== 'function' || typeof revoke !== 'function') return null
  return oauth2 as Oauth2Gis
}

let carregamento: Promise<Oauth2Gis | null> | null = null

/**
 * Insere o `<script>` do GIS uma vez e resolve com a API, ou `null` se o
 * carregamento falhar (sem internet, CSP, bloqueador). Depois de uma falha,
 * a próxima chamada tenta de novo.
 */
export function carregarGis(documento: Document = document): Promise<Oauth2Gis | null> {
  const janela = documento.defaultView
  if (!janela) return Promise.resolve(null)
  const jaCarregado = lerOauth2Gis(janela)
  if (jaCarregado) return Promise.resolve(jaCarregado)
  if (carregamento) return carregamento

  carregamento = new Promise<Oauth2Gis | null>((resolver) => {
    const script = documento.createElement('script')
    script.src = URL_SCRIPT_GIS
    script.async = true
    script.addEventListener('load', () => {
      const api = lerOauth2Gis(janela)
      if (!api) {
        script.remove()
        carregamento = null
      }
      resolver(api)
    })
    script.addEventListener('error', () => {
      script.remove()
      carregamento = null
      resolver(null)
    })
    documento.head.append(script)
  })
  return carregamento
}

/** Só para testes: esquece o carregamento em andamento. */
export function reiniciarCarregadorGis(): void {
  carregamento = null
}
