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
  "connect-src 'self' https://accounts.google.com/gsi/ https://www.googleapis.com",
)

const DOMINIOS = ['accounts.google.com', 'googleapis.com']
const TEXTO = /\.(html|js|mjs|css|json|webmanifest|txt|svg)$/

function construir(clientId) {
  const destino = mkdtempSync(join(tmpdir(), 'study-manager-dist-'))
  const resultado = spawnSync(
    'npx',
    ['vite', 'build', '--outDir', destino, '--emptyOutDir', '--logLevel', 'error'],
    {
      stdio: 'inherit',
      // A variável do processo tem prioridade sobre o .env.local.
      env: { ...process.env, VITE_GOOGLE_CLIENT_ID: clientId },
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

const problemas = []

const semGoogle = construir('')
try {
  const csp = lerCsp(semGoogle)
  if (csp !== CSP_SEM_GOOGLE) problemas.push(`Sem a variável, a CSP mudou:\n  ${csp}`)
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
} finally {
  rmSync(comGoogle, { recursive: true, force: true })
}

if (problemas.length > 0) {
  console.error(problemas.join('\n'))
  process.exit(1)
}
console.log('dist sem Google sem a variável; CSP correta com e sem a variável.')
