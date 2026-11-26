// Confere o build com e sem VITE_GOOGLE_CLIENT_ID (Fase 7, RN40, RN51).
//
// Sem a variável: nenhum arquivo do dist menciona accounts.google.com nem
// googleapis.com, e a CSP é exatamente a de antes da Fase 7.
// Com a variável: a CSP ganha só os domínios do Google justificados.
//
// Uso: npm run verificar:dist-google
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CSP_SEM_GOOGLE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const CSP_COM_GOOGLE = CSP_SEM_GOOGLE.replace(
  "script-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
).replace(
  "connect-src 'self'",
  // A revogação (Fase 8, etapa 3) libera só o caminho exato, não o domínio.
  "connect-src 'self' https://accounts.google.com/gsi/ https://www.googleapis.com https://oauth2.googleapis.com/revoke",
)

const DOMINIOS = ['accounts.google.com', 'googleapis.com']
const URL_GIS = 'https://accounts.google.com/gsi/client'
const TEXTO = /\.(html|js|mjs|css|json|webmanifest|txt|svg)$/
/** Marcador único do destino falso do E2E (`src/features/nuvem/e2e/destinoE2E.ts`). */
const MARCADOR_E2E = 'study-manager:e2e-destino-falso'

function construir(clientId, destinoNuvem = '') {
  const destino = mkdtempSync(join(tmpdir(), 'study-manager-dist-'))
  const resultado = spawnSync(
    'npx',
    ['vite', 'build', '--outDir', destino, '--emptyOutDir', '--logLevel', 'error'],
    {
      stdio: 'inherit',
      // A variável do processo tem prioridade sobre o .env.local.
      env: { ...process.env, VITE_GOOGLE_CLIENT_ID: clientId, VITE_DESTINO_NUVEM: destinoNuvem },
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

/** Arquivos de texto do dist que contêm `trecho`. */
function mencionam(pasta, trecho) {
  return arquivos(pasta)
    .filter((c) => TEXTO.test(c) && readFileSync(c, 'utf8').includes(trecho))
    .map((c) => c.slice(pasta.length + 1))
}

function lerCsp(pasta) {
  const html = readFileSync(join(pasta, 'index.html'), 'utf8')
  const achado = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)
  return achado ? achado[1] : null
}

const problemas = []

const semGoogle = construir('')
try {
  const csp = lerCsp(semGoogle)
  if (csp !== CSP_SEM_GOOGLE) problemas.push(`Sem a variável, a CSP mudou:\n  ${csp}`)
  for (const nome of mencionam(semGoogle, MARCADOR_E2E)) {
    problemas.push(`Sem a variável, ${nome} traz o destino falso do E2E.`)
  }
  for (const caminho of arquivos(semGoogle).filter((c) => TEXTO.test(c))) {
    const conteudo = readFileSync(caminho, 'utf8')
    for (const dominio of DOMINIOS) {
      if (conteudo.includes(dominio)) {
        problemas.push(
          `Sem a variável, ${caminho.slice(semGoogle.length + 1)} menciona ${dominio}.`,
        )
      }
    }
  }
} finally {
  rmSync(semGoogle, { recursive: true, force: true })
}

const comGoogle = construir('verificacao.apps.googleusercontent.com')
try {
  const csp = lerCsp(comGoogle)
  if (csp !== CSP_COM_GOOGLE) problemas.push(`Com a variável, a CSP não é a esperada:\n  ${csp}`)
  // O código do destino real existe, mas fora do bundle inicial (import dinâmico).
  const html = readFileSync(join(comGoogle, 'index.html'), 'utf8')
  const scripts = arquivos(comGoogle).filter((c) => /\.m?js$/.test(c))
  const doGoogle = scripts.filter((c) => {
    const conteudo = readFileSync(c, 'utf8')
    return conteudo.includes('https://www.googleapis.com') && conteudo.includes(URL_GIS)
  })
  if (doGoogle.length === 0) {
    problemas.push('Com a variável, nenhum chunk traz o código do Google Drive.')
  }
  for (const chunk of doGoogle) {
    const nome = chunk.slice(comGoogle.length + 1)
    if (html.includes(nome)) problemas.push(`Com a variável, ${nome} está no bundle inicial.`)
  }
  for (const nome of mencionam(comGoogle, MARCADOR_E2E)) {
    problemas.push(`Com a variável, ${nome} traz o destino falso do E2E.`)
  }
} finally {
  rmSync(comGoogle, { recursive: true, force: true })
}

// Controle positivo: no build do E2E o marcador aparece (a busca acima funciona).
const doE2E = construir('e2e-teste.apps.googleusercontent.com', 'falso')
try {
  if (mencionam(doE2E, MARCADOR_E2E).length === 0) {
    problemas.push('No build do E2E o marcador do destino falso não foi achado: a busca não vale.')
  }
} finally {
  rmSync(doE2E, { recursive: true, force: true })
}

if (problemas.length > 0) {
  console.error(problemas.join('\n'))
  process.exit(1)
}
console.log(
  'Sem a variável: dist sem Google, sem destino falso e com a CSP de antes. Com a variável: CSP com o Google, código do Drive num chunk sob demanda e sem destino falso. Build do E2E: destino falso presente.',
)
