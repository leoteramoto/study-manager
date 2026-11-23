// Precisa ser o primeiro import (ver o arquivo).
import './lib/configurarZod'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import { TelaFalhaBanco } from './app/TelaFalhaBanco'
import { sinalizarNovaVersao } from './app/pwa/novaVersao'
import { classificarFalhaBanco, inicializarBanco } from './db/inicializar'
import { ouvirRestauracao } from './lib/canalRestauracao'
import { recarregarPagina } from './lib/recarregar'
import './index.css'

// Nova versão não recarrega sozinha: o usuário escolhe quando, e nunca com
// o cronômetro em andamento (ver AvisoNovaVersao).
const atualizarServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    sinalizarNovaVersao(() => atualizarServiceWorker(true))
  },
})

// Outra aba restaurou um backup: recarrega para não ficar com estado de tela antigo.
ouvirRestauracao(recarregarPagina)

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado')

function renderizar(conteudo: ReactNode) {
  createRoot(raiz as HTMLElement).render(<StrictMode>{conteudo}</StrictMode>)
}

inicializarBanco()
  .then(() => {
    renderizar(<App />)
  })
  .catch((erro: unknown) => {
    // RN36: tela de falha em vez de tela branca. Detalhes só no console em desenvolvimento.
    if (import.meta.env.DEV) console.error('Falha ao inicializar o banco', erro)
    renderizar(<TelaFalhaBanco tipo={classificarFalhaBanco(erro)} />)
  })
