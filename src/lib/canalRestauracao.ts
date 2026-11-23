// Aviso entre abas de que os dados foram substituídos por um backup.
// As outras abas recarregam para não ficar com estado de tela antigo.
const NOME_CANAL = 'study-manager:restauracao'
const MENSAGEM = 'dados-restaurados'

export function avisarRestauracao(): void {
  if (typeof BroadcastChannel === 'undefined') return
  const canal = new BroadcastChannel(NOME_CANAL)
  canal.postMessage(MENSAGEM)
  canal.close()
}

/** Chama `aoRestaurar` quando outra aba restaurar um backup. Devolve a função que para de ouvir. */
export function ouvirRestauracao(aoRestaurar: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined
  const canal = new BroadcastChannel(NOME_CANAL)
  canal.onmessage = (evento: MessageEvent<unknown>) => {
    if (evento.data === MENSAGEM) aoRestaurar()
  }
  return () => {
    canal.close()
  }
}
