/**
 * O Web Crypto (`crypto.subtle`), usado no checksum do backup, só existe em
 * contexto seguro (https ou localhost). Aberto por http num IP da rede, ele falta.
 */
export function criptografiaDisponivel(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined'
}

export const MENSAGEM_SEM_CRIPTOGRAFIA =
  'O backup não está disponível neste endereço: o navegador só libera a criptografia usada no backup em conexões seguras (https ou localhost). Abra o app pelo endereço https.'
