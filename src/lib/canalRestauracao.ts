// Aviso entre abas de que os dados foram substituídos por um backup.
// As outras abas recarregam para não ficar com estado de tela antigo.
//
// O BroadcastChannel entrega a mensagem a todos os *outros objetos* do canal,
// inclusive os da mesma página. Por isso a aba usa um objeto só para ouvir e
// avisar: quem envia não recebe a própria mensagem, e a aba que restaurou
// não recarrega antes de mostrar o sucesso.
const NOME_CANAL = 'study-manager:restauracao'
const MENSAGEM = 'dados-restaurados'

let canal: BroadcastChannel | null = null

function obterCanal(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  canal ??= new BroadcastChannel(NOME_CANAL)
  return canal
}

export function avisarRestauracao(): void {
  obterCanal()?.postMessage(MENSAGEM)
}

/** Chama `aoRestaurar` quando outra aba restaurar um backup. Devolve a função que para de ouvir. */
export function ouvirRestauracao(aoRestaurar: () => void): () => void {
  const atual = obterCanal()
  if (!atual) return () => undefined
  const ouvinte = (evento: MessageEvent<unknown>) => {
    if (evento.data === MENSAGEM) aoRestaurar()
  }
  atual.addEventListener('message', ouvinte)
  return () => {
    atual.removeEventListener('message', ouvinte)
  }
}
