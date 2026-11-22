import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import { inicializarBanco } from './db/inicializar'
import './index.css'

registerSW({ immediate: true })

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
