// Estado do aviso de nova versão do PWA. O registro do service worker fica no
// main.tsx (módulo virtual do vite-plugin-pwa); aqui só guardamos o sinal.
type Atualizar = () => Promise<void>

let disponivel = false
let atualizar: Atualizar | null = null
const ouvintes = new Set<() => void>()

function avisar() {
  for (const ouvinte of ouvintes) ouvinte()
}

/** Chamado pelo `onNeedRefresh` do service worker. */
export function sinalizarNovaVersao(funcaoAtualizar: Atualizar): void {
  disponivel = true
  atualizar = funcaoAtualizar
  avisar()
}

export function novaVersaoDisponivel(): boolean {
  return disponivel
}

export function assinarNovaVersao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/** Ativa o novo service worker e recarrega a página. */
export async function aplicarNovaVersao(): Promise<void> {
  await atualizar?.()
}

/** Só para testes. */
export function reiniciarNovaVersaoParaTestes(): void {
  disponivel = false
  atualizar = null
  avisar()
}
