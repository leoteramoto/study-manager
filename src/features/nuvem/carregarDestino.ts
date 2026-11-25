// Ponto único de entrada do destino real (RN40, RN52). O `DestinoGoogle` é
// importado de forma dinâmica e só quando há `VITE_GOOGLE_CLIENT_ID`: o Vite
// troca a variável pelo valor no build, então sem ela o `import()` some do
// código e nada do Google entra no bundle (conferido por
// `scripts/verificar-dist-google.mjs`).
import type { DestinoBackupNuvem } from './destino'

/** O recurso do Google Drive existe neste build. */
export const NUVEM_DISPONIVEL = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

export async function carregarDestinoGoogle(
  registrarErro?: (contexto: string, erro: unknown) => void,
): Promise<DestinoBackupNuvem | null> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) return null
  // Só no build de E2E: o destino falso, sem Google. O Vite resolve a condição
  // no build; nos builds normais o import some (conferido pelo verificar:dist-google).
  if (import.meta.env.VITE_DESTINO_NUVEM === 'falso') {
    const { criarDestinoE2E } = await import('./e2e/destinoE2E')
    return criarDestinoE2E()
  }
  const { DestinoGoogle } = await import('./google/destinoGoogle')
  return new DestinoGoogle({ clientId, registrarErro })
}
