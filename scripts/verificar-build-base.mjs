// Confere o build com o caminho base do GitHub Pages (Fase 8, Etapa 2).
//
// O Pages serve o app em https://<usuário>.github.io/<repo>/, e a raiz da
// origem pode ser de outro site da mesma conta. Nada do app pode apontar para
// a raiz. Confere, no build com VITE_BASE_PATH=/study-manager/:
// - os src/href do index.html (todos sob o caminho, e os arquivos existem);
// - start_url, scope e ícones do manifest (relativos ao manifest);
// - o registro e o escopo do service worker;
// - o navigateFallback do Workbox e a lista de pré-cache (relativa);
// - o worker do cronômetro, os sons, o tema.js e os ícones;
// - a CSP igual à do build na raiz (sem e com o Google);
// - nenhum literal "/arquivo-do-app" apontando para a raiz em HTML/JS.
// Controle positivo: no build na raiz a busca de literais acha o "/sw.js".
//
// Uso: npm run verificar:build-base
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = '/study-manager/'
const TEXTO = /\.(html|js|mjs|css|json|webmanifest)$/
/** Literal entre aspas que aponta para um arquivo do app a partir da raiz. */
const LITERAL_NA_RAIZ =
  /["'`]\/(assets\/|sounds\/|icons\/|sw\.js|tema\.js|manifest\.webmanifest|favicon\.svg|workbox-)/g

const problemas = []

function construir({ base = '', clientId = '' } = {}) {
  const destino = mkdtempSync(join(tmpdir(), 'study-manager-base-'))
  const resultado = spawnSync(
    'npx',
    ['vite', 'build', '--outDir', destino, '--emptyOutDir', '--logLevel', 'error'],
    {
      stdio: 'inherit',
      // A variável do processo tem prioridade sobre o .env.local.
      env: {
        ...process.env,
        VITE_BASE_PATH: base,
        VITE_GOOGLE_CLIENT_ID: clientId,
        VITE_DESTINO_NUVEM: '',
      },
    },
  )
  if (resultado.status !== 0) {
    console.error('O build falhou.')
    process.exit(1)
  }
  return destino
}

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho]
  })
}

function lerCsp(pasta) {
  const html = readFileSync(join(pasta, 'index.html'), 'utf8')
  const achado = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)
  return achado ? achado[1] : null
}

/** Literais que apontam para a raiz, por arquivo (caminho relativo ao dist). */
function literaisNaRaiz(pasta) {
  return arquivos(pasta)
    .filter((c) => TEXTO.test(c))
    .flatMap((c) =>
      [...readFileSync(c, 'utf8').matchAll(LITERAL_NA_RAIZ)].map(
        (m) => `${c.slice(pasta.length + 1)}: ${m[0]}`,
      ),
    )
}

/** Confere que `relativo` (sem barra inicial) existe no dist. */
function exigirArquivo(pasta, relativo, origem) {
  if (!existsSync(join(pasta, relativo))) problemas.push(`${origem}: ${relativo} não existe.`)
}

function conferirBase(pasta, rotulo) {
  // index.html
  const html = readFileSync(join(pasta, 'index.html'), 'utf8')
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1])
  if (refs.length === 0) problemas.push(`${rotulo}: nenhum src/href no index.html.`)
  for (const ref of refs) {
    if (!ref.startsWith(BASE)) {
      problemas.push(`${rotulo}: index.html referencia ${ref} fora de ${BASE}.`)
    } else {
      exigirArquivo(pasta, ref.slice(BASE.length), `${rotulo}, index.html`)
    }
  }
  for (const nome of ['tema.js', 'favicon.svg', 'manifest.webmanifest']) {
    if (!refs.includes(`${BASE}${nome}`)) {
      problemas.push(`${rotulo}: index.html não carrega ${BASE}${nome}.`)
    }
  }

  // manifest
  const manifest = JSON.parse(readFileSync(join(pasta, 'manifest.webmanifest'), 'utf8'))
  const urlManifest = new URL(`${BASE}manifest.webmanifest`, 'https://exemplo.github.io')
  for (const campo of ['start_url', 'scope']) {
    const resolvido = new URL(manifest[campo], urlManifest).pathname
    if (resolvido !== BASE) {
      problemas.push(`${rotulo}: manifest.${campo} resolve para ${resolvido}, não ${BASE}.`)
    }
  }
  for (const icone of manifest.icons ?? []) {
    if (icone.src.startsWith('/')) problemas.push(`${rotulo}: ícone ${icone.src} absoluto.`)
    else exigirArquivo(pasta, icone.src, `${rotulo}, manifest`)
  }

  // service worker gerado pelo Workbox
  const sw = readFileSync(join(pasta, 'sw.js'), 'utf8')
  if (!sw.includes('createHandlerBoundToURL("index.html")')) {
    problemas.push(`${rotulo}: navigateFallback do Workbox não é "index.html" (relativo).`)
  }
  const precache = [...sw.matchAll(/url:"([^"]*)"/g)].map((m) => m[1])
  if (precache.length === 0) problemas.push(`${rotulo}: lista de pré-cache vazia.`)
  for (const url of precache) {
    if (url.startsWith('/')) problemas.push(`${rotulo}: pré-cache com ${url} absoluto.`)
    else exigirArquivo(pasta, url, `${rotulo}, pré-cache`)
  }
  for (const necessario of ['tema.js', 'index.html', 'manifest.webmanifest']) {
    if (!precache.includes(necessario)) {
      problemas.push(`${rotulo}: ${necessario} fora do pré-cache.`)
    }
  }
  for (const pasta2 of ['sounds/', 'icons/']) {
    if (!precache.some((u) => u.startsWith(pasta2))) {
      problemas.push(`${rotulo}: nenhum arquivo de ${pasta2} no pré-cache.`)
    }
  }

  // JS: registro do service worker e worker do cronômetro
  const js = arquivos(pasta)
    .filter((c) => c.endsWith('.js') && c.includes(`${join(pasta, 'assets')}`))
    .map((c) => readFileSync(c, 'utf8'))
    .join('\n')
  const registro = /[`'"]([^`'"]*sw\.js)[`'"],\s*\{\s*scope:\s*[`'"]([^`'"]*)[`'"]/.exec(js)
  if (!registro) {
    problemas.push(`${rotulo}: registro do service worker não encontrado no JS.`)
  } else if (registro[1] !== `${BASE}sw.js` || registro[2] !== BASE) {
    problemas.push(
      `${rotulo}: service worker registrado em ${registro[1]} com escopo ${registro[2]}.`,
    )
  }
  const worker = /new URL\([`'"]([^`'"]*relogio\.worker[^`'"]*\.js)[`'"]/.exec(js)
  if (!worker) {
    problemas.push(`${rotulo}: worker do cronômetro não encontrado no JS.`)
  } else if (!worker[1].startsWith(`${BASE}assets/`)) {
    problemas.push(`${rotulo}: worker do cronômetro em ${worker[1]}.`)
  } else {
    exigirArquivo(pasta, worker[1].slice(BASE.length), `${rotulo}, worker`)
  }
  const sons = [...js.matchAll(/arquivo:[`'"]([^`'"]*)[`'"]/g)].map((m) => m[1])
  if (sons.length === 0) problemas.push(`${rotulo}: lista de sons não encontrada no JS.`)
  for (const som of sons) {
    if (som.startsWith('/')) problemas.push(`${rotulo}: som ${som} absoluto.`)
    else exigirArquivo(pasta, som, `${rotulo}, sons`)
  }

  for (const achado of literaisNaRaiz(pasta)) {
    problemas.push(`${rotulo}: caminho na raiz em ${achado}.`)
  }
}

const pastas = []
try {
  const raiz = construir()
  pastas.push(raiz)
  const comBase = construir({ base: BASE })
  pastas.push(comBase)
  const comBaseGoogle = construir({
    base: BASE,
    clientId: 'verificacao.apps.googleusercontent.com',
  })
  pastas.push(comBaseGoogle)

  // Controle positivo: na raiz, a busca de literais acha o registro do service worker.
  if (!literaisNaRaiz(raiz).some((a) => a.includes('/sw.js'))) {
    problemas.push('No build na raiz a busca de literais não achou "/sw.js": a busca não vale.')
  }

  conferirBase(comBase, 'Sem Google')
  conferirBase(comBaseGoogle, 'Com Google')

  const cspRaiz = lerCsp(raiz)
  if (!cspRaiz) problemas.push('Build na raiz sem CSP.')
  if (lerCsp(comBase) !== cspRaiz) {
    problemas.push(`Sem Google, a CSP com o caminho base difere da raiz:\n  ${lerCsp(comBase)}`)
  }
  const cspGoogleEsperada = cspRaiz
    ?.replace("script-src 'self'", "script-src 'self' https://accounts.google.com/gsi/client")
    .replace(
      "connect-src 'self'",
      "connect-src 'self' https://accounts.google.com/gsi/ https://www.googleapis.com https://oauth2.googleapis.com/revoke",
    )
  if (lerCsp(comBaseGoogle) !== cspGoogleEsperada) {
    problemas.push(
      `Com Google, a CSP com o caminho base não é a esperada:\n  ${lerCsp(comBaseGoogle)}`,
    )
  }
} finally {
  for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true })
}

if (problemas.length > 0) {
  console.error(problemas.join('\n'))
  process.exit(1)
}
console.log(
  `Build com ${BASE}: HTML, manifest, service worker, pré-cache, worker e sons sob o caminho; CSP igual à da raiz (sem e com o Google); nenhum caminho na raiz.`,
)
