/** Sons de alerta disponíveis (RN25/RN38). Arquivos gerados por scripts/gerar-sons.mjs. */
export const SONS = [
  { id: 'sino', nome: 'Sino', arquivo: 'sounds/sino.wav' },
  { id: 'digital', nome: 'Digital', arquivo: 'sounds/digital.wav' },
  { id: 'suave', nome: 'Suave', arquivo: 'sounds/suave.wav' },
] as const

export type IdSom = (typeof SONS)[number]['id']

export const SOM_PADRAO: IdSom = SONS[0].id
