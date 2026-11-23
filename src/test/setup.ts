import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

type ListaMidia = Omit<MediaQueryList, 'addListener' | 'removeListener'>

// jsdom não implementa matchMedia; os testes partem do tema claro do sistema.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => {
      const lista: ListaMidia = {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }
      return lista as MediaQueryList
    },
  })
}

// jsdom não implementa reprodução de mídia; os testes de alerta trocam por rejeição.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value: () => Promise.resolve(),
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value: () => undefined,
})

// jsdom não implementa ResizeObserver, usado pelo Slider do Radix para medir o controle.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverFalso {
    observe() {
      return undefined
    }
    unobserve() {
      return undefined
    }
    disconnect() {
      return undefined
    }
  }
  globalThis.ResizeObserver = ResizeObserverFalso
}
