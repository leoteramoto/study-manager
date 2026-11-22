/**
 * Fonte de ticks do cronômetro. Ela só avisa "verifique agora": nunca informa
 * tempo. Todo cálculo usa o `Date` da thread principal (RN17), então trocar a
 * fonte não muda nenhum resultado.
 */
export interface FonteTicks {
  /** Começa a chamar `aoTick` a cada `intervaloMs`. Retorna a função que para. */
  iniciar(aoTick: () => void, intervaloMs: number): () => void
}

/** `setInterval` na thread principal (testes e E2E com relógio falso). */
export const fonteTicksPrincipal: FonteTicks = {
  iniciar(aoTick, intervaloMs) {
    const id = setInterval(aoTick, intervaloMs)
    return () => {
      clearInterval(id)
    }
  },
}

/** Ticks vindos de um Web Worker, que não sofre o limite de timers de abas ocultas. */
export function criarFonteTicksWorker(
  criarWorker: () => Worker = () =>
    new Worker(new URL('./relogio.worker.ts', import.meta.url), { type: 'module' }),
): FonteTicks {
  return {
    iniciar(aoTick, intervaloMs) {
      let worker: Worker
      try {
        worker = criarWorker()
      } catch {
        // Sem suporte a workers de módulo: cai para a thread principal.
        return fonteTicksPrincipal.iniciar(aoTick, intervaloMs)
      }
      worker.onmessage = () => {
        aoTick()
      }
      worker.postMessage(intervaloMs)
      return () => {
        worker.terminate()
      }
    },
  }
}

/**
 * Fonte padrão: o worker, a não ser que o build peça a thread principal
 * (`VITE_FONTE_TICKS=principal`, usado no E2E com `page.clock`) ou que o
 * navegador não tenha `Worker`.
 */
export function criarFonteTicks(): FonteTicks {
  if (import.meta.env.VITE_FONTE_TICKS === 'principal' || typeof Worker === 'undefined') {
    return fonteTicksPrincipal
  }
  return criarFonteTicksWorker()
}
