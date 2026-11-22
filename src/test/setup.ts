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
