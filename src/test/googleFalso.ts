// Dublês do Google para os testes (RN52): `google.accounts.oauth2` e `fetch`
// da API do Drive. Nenhum teste acessa o Google de verdade.
import type { ConfigTokenClientGis, Oauth2Gis, PedidoTokenGis } from '@/features/nuvem/google/gis'

export const TOKEN_FALSO = 'ya29.token-secreto-de-teste'

export type ModoRevogacao = 'responde' | 'lanca' | 'silencio'

/** `google.accounts.oauth2` controlado pelo teste. */
export function criarGoogleFalso() {
  let config: ConfigTokenClientGis | null = null
  const pedidos: PedidoTokenGis[] = []
  const revogados: string[] = []
  let modoRevogacao: ModoRevogacao = 'responde'
  let falharPedido = false

  const oauth2: Oauth2Gis = {
    initTokenClient(novo) {
      config = novo
      return {
        requestAccessToken(pedido) {
          if (falharPedido) throw new Error('requestAccessToken falhou')
          pedidos.push(pedido ?? { prompt: 'padrão' })
        },
      }
    },
    revoke(token, concluido) {
      if (modoRevogacao === 'lanca') throw new Error('revoke falhou')
      revogados.push(token)
      if (modoRevogacao === 'responde') concluido({ successful: true })
    },
  }

  function configuracao(): ConfigTokenClientGis {
    if (!config) throw new Error('initTokenClient não foi chamado')
    return config
  }

  return {
    oauth2,
    pedidos,
    revogados,
    configuracao,
    /** O Google devolve um token com o escopo pedido. */
    concederToken(expiraEmSeg = 3599, escopo = 'https://www.googleapis.com/auth/drive.file') {
      configuracao().callback({ access_token: TOKEN_FALSO, expires_in: expiraEmSeg, scope: escopo })
    },
    responder(resposta: unknown) {
      configuracao().callback(resposta)
    },
    erroPopup(tipo: string) {
      configuracao().error_callback({ type: tipo, message: `detalhe ${TOKEN_FALSO}` })
    },
    definirRevogacao(modo: ModoRevogacao) {
      modoRevogacao = modo
    },
    definirFalhaNoPedido(valor: boolean) {
      falharPedido = valor
    },
  }
}

export interface ChamadaFetch {
  url: string
  metodo: string
  cabecalhos: Headers
  corpo: string | null
  credenciais: RequestCredentials | undefined
}

export type Resposta = Response | (() => Response) | 'rede'

interface Rota {
  metodo: string
  /** Começo da URL (sem a query) ou expressão regular sobre a URL inteira. */
  padrao: string | RegExp
  respostas: Resposta[]
}

export function json(corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
  })
}

/** `fetch` falso com rotas por método e URL; grava todas as chamadas. */
export function criarFetchFalso() {
  const rotas: Rota[] = []
  const chamadas: ChamadaFetch[] = []

  const buscar: typeof fetch = (entrada, init) => {
    const url =
      typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const metodo = (init?.method ?? 'GET').toUpperCase()
    const corpo = typeof init?.body === 'string' ? init.body : null
    chamadas.push({
      url,
      metodo,
      cabecalhos: new Headers(init?.headers),
      corpo,
      credenciais: init?.credentials,
    })
    const rota = rotas.find((candidata) => {
      if (candidata.metodo !== metodo || candidata.respostas.length === 0) return false
      if (typeof candidata.padrao === 'string') return url.split('?')[0] === candidata.padrao
      return candidata.padrao.test(url)
    })
    const resposta = rota?.respostas.shift()
    if (resposta === undefined) {
      return Promise.resolve(json({ error: 'rota não configurada' }, 599))
    }
    if (resposta === 'rede') return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve(typeof resposta === 'function' ? resposta() : resposta)
  }

  return {
    fetch: buscar,
    chamadas,
    /** Responde (em ordem) às próximas chamadas que casarem com a rota. */
    em(metodo: string, padrao: string | RegExp, ...respostas: Resposta[]) {
      rotas.push({ metodo, padrao, respostas })
    },
  }
}

export const API = 'https://www.googleapis.com/drive/v3'
export const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
export const SESSAO =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=SESSAO-SECRETA'

export function arquivoApi(
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: `${id}.json`,
    mimeType: 'application/json',
    modifiedTime: '2026-11-23T12:00:00.000Z',
    size: '10',
    ...extra,
  }
}

export function pastaApi(id: string, extra: Record<string, unknown> = {}) {
  return arquivoApi(id, {
    name: 'Study Manager',
    mimeType: 'application/vnd.google-apps.folder',
    size: undefined,
    appProperties: { studyManager: 'pasta' },
    ...extra,
  })
}
