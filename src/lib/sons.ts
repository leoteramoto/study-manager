/** Sons de alerta disponíveis (RN25/RN38). Os arquivos de áudio entram na Fase 4. */
export const SONS = [
  { id: 'sino', nome: 'Sino', arquivo: 'sounds/sino.mp3' },
  { id: 'digital', nome: 'Digital', arquivo: 'sounds/digital.mp3' },
  { id: 'suave', nome: 'Suave', arquivo: 'sounds/suave.mp3' },
] as const

export type IdSom = (typeof SONS)[number]['id']

export const SOM_PADRAO: IdSom = SONS[0].id
