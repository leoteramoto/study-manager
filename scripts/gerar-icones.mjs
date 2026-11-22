// Gera os ícones do PWA (PNG) e o favicon (SVG) sem dependências externas.
// Desenho: cronômetro branco sobre fundo índigo. Uso: npm run icones
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const INDIGO = [0x4f, 0x46, 0xe5]
const BRANCO = [0xff, 0xff, 0xff]

// Geometria em coordenadas unitárias (0..1), compartilhada entre PNG e SVG.
const G = {
  raioCanto: 0.22,
  centro: [0.5, 0.55],
  aroExterno: 0.3,
  aroInterno: 0.225,
  botao: { x: 0.44, y: 0.13, w: 0.12, h: 0.1 },
  ponteiro: {
    fim: [0.5 + 0.15 * Math.sin(Math.PI / 3), 0.55 - 0.15 * Math.cos(Math.PI / 3)],
    espessura: 0.045,
  },
  pino: 0.045,
}

function dentroRetanguloArredondado(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function distanciaSegmento(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function primeiroPlano(x, y) {
  const d = Math.hypot(x - G.centro[0], y - G.centro[1])
  if (d <= G.aroExterno && d >= G.aroInterno) return true
  const b = G.botao
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true
  if (distanciaSegmento(x, y, G.centro, G.ponteiro.fim) <= G.ponteiro.espessura / 2) return true
  return d <= G.pino
}

/** Retorna [r,g,b,a] de um ponto (u,v) do ícone. */
function amostrar(u, v, mascaravel) {
  if (!mascaravel && !dentroRetanguloArredondado(u, v, G.raioCanto)) return [0, 0, 0, 0]
  // No ícone mascarável o desenho fica na zona segura (80% central).
  const escala = mascaravel ? 0.8 : 1
  const x = (u - 0.5) / escala + 0.5
  const y = (v - 0.5) / escala + 0.5
  return [...(primeiroPlano(x, y) ? BRANCO : INDIGO), 255]
}

const tabelaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = tabelaCrc[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

function gerarPng(tamanho, mascaravel) {
  const SS = 4 // superamostragem para suavizar bordas
  const linha = tamanho * 4 + 1
  const bruto = Buffer.alloc(linha * tamanho)
  for (let py = 0; py < tamanho; py++) {
    bruto[py * linha] = 0
    for (let px = 0; px < tamanho; px++) {
      const soma = [0, 0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [r, g, b, a] = amostrar(
            (px + (sx + 0.5) / SS) / tamanho,
            (py + (sy + 0.5) / SS) / tamanho,
            mascaravel,
          )
          soma[0] += r * a
          soma[1] += g * a
          soma[2] += b * a
          soma[3] += a
        }
      }
      const o = py * linha + 1 + px * 4
      const alfa = soma[3] / (SS * SS)
      for (let i = 0; i < 3; i++) bruto[o + i] = soma[3] ? Math.round(soma[i] / soma[3]) : 0
      bruto[o + 3] = Math.round(alfa)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8 // profundidade
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(bruto, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

function gerarSvg() {
  const n = (v) => +(v * 100).toFixed(2)
  const [cx, cy] = G.centro
  const raioAro = (G.aroExterno + G.aroInterno) / 2
  const b = G.botao
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${n(G.raioCanto)}" fill="#4f46e5"/>
  <g fill="#fff" stroke="#fff">
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(raioAro)}" fill="none" stroke-width="${n(G.aroExterno - G.aroInterno)}"/>
    <rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" stroke="none"/>
    <line x1="${n(cx)}" y1="${n(cy)}" x2="${n(G.ponteiro.fim[0])}" y2="${n(G.ponteiro.fim[1])}" stroke-width="${n(G.ponteiro.espessura)}" stroke-linecap="round"/>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(G.pino)}" stroke="none"/>
  </g>
</svg>
`
}

const pastaIcones = join(raiz, 'public', 'icons')
mkdirSync(pastaIcones, { recursive: true })
writeFileSync(join(pastaIcones, 'icon-192.png'), gerarPng(192, false))
writeFileSync(join(pastaIcones, 'icon-512.png'), gerarPng(512, false))
writeFileSync(join(pastaIcones, 'icon-maskable-512.png'), gerarPng(512, true))
writeFileSync(join(pastaIcones, 'apple-touch-icon-180.png'), gerarPng(180, true))
writeFileSync(join(raiz, 'public', 'favicon.svg'), gerarSvg())
console.log('Ícones gerados em public/icons e public/favicon.svg')
