// Gera os 3 sons de alerta do cronômetro (RN25) em public/sounds/, por síntese.
// Os sons são criados aqui mesmo, sem amostras de terceiros: não há direitos autorais.
// Uso: npm run sons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TAXA = 22050
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds')

/** Codifica amostras (-1..1) como WAV PCM 16 bits mono. */
function wav(amostras) {
  const dados = Buffer.alloc(amostras.length * 2)
  amostras.forEach((valor, i) => {
    const limitado = Math.max(-1, Math.min(1, valor))
    dados.writeInt16LE(Math.round(limitado * 32767), i * 2)
  })
  const cabecalho = Buffer.alloc(44)
  cabecalho.write('RIFF', 0)
  cabecalho.writeUInt32LE(36 + dados.length, 4)
  cabecalho.write('WAVE', 8)
  cabecalho.write('fmt ', 12)
  cabecalho.writeUInt32LE(16, 16)
  cabecalho.writeUInt16LE(1, 20) // PCM
  cabecalho.writeUInt16LE(1, 22) // mono
  cabecalho.writeUInt32LE(TAXA, 24)
  cabecalho.writeUInt32LE(TAXA * 2, 28)
  cabecalho.writeUInt16LE(2, 32)
  cabecalho.writeUInt16LE(16, 34)
  cabecalho.write('data', 36)
  cabecalho.writeUInt32LE(dados.length, 40)
  return Buffer.concat([cabecalho, dados])
}

/** Soma notas `{ inicio, freq, duracao, volume, decaimento, parciais }` numa faixa. */
function sintetizar(duracaoTotal, notas) {
  const amostras = new Float64Array(Math.ceil(duracaoTotal * TAXA))
  for (const nota of notas) {
    const inicio = Math.floor(nota.inicio * TAXA)
    const total = Math.floor(nota.duracao * TAXA)
    const ataque = Math.floor(0.005 * TAXA)
    for (let i = 0; i < total && inicio + i < amostras.length; i++) {
      const t = i / TAXA
      const envelope = Math.min(1, i / ataque) * Math.exp(-nota.decaimento * t)
      let valor = 0
      for (const [multiplo, peso] of nota.parciais) {
        valor += peso * Math.sin(2 * Math.PI * nota.freq * multiplo * t)
      }
      amostras[inicio + i] += nota.volume * envelope * valor
    }
  }
  // Suaviza o fim para não estalar.
  const saida = Math.floor(0.02 * TAXA)
  for (let i = 0; i < saida; i++) amostras[amostras.length - 1 - i] *= i / saida
  // Normaliza o pico em 0,8: sem distorção e com volume parecido entre os sons.
  const pico = amostras.reduce((maior, valor) => Math.max(maior, Math.abs(valor)), 0)
  return Array.from(amostras, (valor) => (valor / pico) * 0.8)
}

const SINO = [
  [1, 1],
  [2.0, 0.5],
  [3.01, 0.25],
  [4.2, 0.12],
]
const PURO = [[1, 1]]

const sons = {
  sino: sintetizar(1.8, [
    { inicio: 0, freq: 880, duracao: 1.8, volume: 0.35, decaimento: 3, parciais: SINO },
    { inicio: 0.45, freq: 880, duracao: 1.35, volume: 0.3, decaimento: 3, parciais: SINO },
  ]),
  digital: sintetizar(
    0.9,
    [0, 0.2, 0.4].map((inicio) => ({
      inicio,
      freq: 1200,
      duracao: 0.12,
      volume: 0.3,
      decaimento: 4,
      parciais: [
        [1, 1],
        [3, 0.2],
      ],
    })),
  ),
  suave: sintetizar(
    1.6,
    [523.25, 659.25, 783.99].map((freq, i) => ({
      inicio: i * 0.22,
      freq,
      duracao: 1.6 - i * 0.22,
      volume: 0.3,
      decaimento: 2.5,
      parciais: PURO,
    })),
  ),
}

mkdirSync(destino, { recursive: true })
for (const [nome, amostras] of Object.entries(sons)) {
  writeFileSync(join(destino, `${nome}.wav`), wav(amostras))
  console.log(`public/sounds/${nome}.wav`)
}
