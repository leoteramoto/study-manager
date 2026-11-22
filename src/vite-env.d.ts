/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `principal` faz o cronômetro usar `setInterval` da página em vez do worker (E2E). */
  readonly VITE_FONTE_TICKS?: string
}
