// Precisa ser o primeiro import (ver o arquivo).
import './lib/configurarZod'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import { sinalizarNovaVersao } from './app/pwa/novaVersao'
import { inicializarBanco } from './db/inicializar'
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

function renderizar() {
  createRoot(raiz as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

inicializarBanco()
  .catch((erro: unknown) => {
    // A tela de falha do banco (RN36) chega na Fase 6.
    if (import.meta.env.DEV) console.error('Falha ao inicializar o banco', erro)
  })
  .finally(renderizar)
