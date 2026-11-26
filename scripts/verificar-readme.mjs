// Confere que o README não perdeu as seções principais (pendência da Fase 7).
//
// Motivo: na Fase 7, um script de edição truncou o README sem que nenhuma
// verificação acusasse. Cada título precisa existir como cabeçalho de nível 2
// (`## Título`, com ou sem complemento depois, como "(opcional)").
//
// Uso: npm run verificar:readme [caminho]   (padrão: README.md)
import { readFileSync } from 'node:fs'

const TITULOS = ['Como usar', 'Backup e restauração', 'Backup no Google Drive', 'Deploy']

const caminho = process.argv[2] ?? 'README.md'

let texto
try {
  texto = readFileSync(caminho, 'utf8')
} catch (erro) {
  console.error(`Não foi possível ler ${caminho}: ${erro.message}`)
  process.exit(1)
}

const cabecalhos = texto
  .split(/\r?\n/)
  .filter((linha) => linha.startsWith('## '))
  .map((linha) => linha.slice(3).trim())

const faltando = TITULOS.filter(
  (titulo) => !cabecalhos.some((c) => c === titulo || c.startsWith(`${titulo} `)),
)

if (faltando.length > 0) {
  console.error(`${caminho}: faltam as seções ${faltando.map((t) => `"${t}"`).join(', ')}.`)
  process.exit(1)
}

console.log(`${caminho}: as ${TITULOS.length} seções principais estão presentes.`)
