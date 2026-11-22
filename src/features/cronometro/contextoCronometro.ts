import { createContext } from 'react'
import type { Materia, Objetivo, SessaoAtiva } from '@/db/tipos'

/** Por que a sessão foi pausada sozinha, quando o navegador avisou. */
export type CausaPausa = 'congelamento' | 'descarte'

export interface ValorCronometro {
  /** `undefined` enquanto carrega; `null` sem sessão. */
  sessao: SessaoAtiva | null | undefined
  materia: Materia | undefined
  objetivo: Objetivo | undefined
  /** Instante do último tick (atualizado a cada segundo). */
  agora: Date
  /** Tempo contado, em milissegundos, pelo relógio (RN17). */
  tempoMs: number
  causaPausa: CausaPausa | null
  /** Fuso configurado, para exibir datas e horas. */
  fuso: string
  erro: string | null
  limparErro: () => void
  iniciar: (materiaId: string, duracaoMin: number) => Promise<boolean>
  pausar: () => Promise<boolean>
  continuar: () => Promise<boolean>
  encerrar: () => Promise<boolean>
  descartar: () => Promise<boolean>
  contarIntervalo: () => Promise<boolean>
  encerrarRecuperada: () => Promise<boolean>
  confirmar: () => Promise<boolean>
}

export const ContextoCronometro = createContext<ValorCronometro | null>(null)
