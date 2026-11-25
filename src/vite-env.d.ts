/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `principal` faz o cronômetro usar `setInterval` da página em vez do worker (E2E). */
  readonly VITE_FONTE_TICKS?: string
  /**
   * ID do cliente OAuth do Google (Fase 7). Público por natureza. Sem ele, o
   * backup no Google Drive não existe no build.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** `falso`: só no build de E2E, usa o destino falso no lugar do Google. */
  readonly VITE_DESTINO_NUVEM?: string
}
