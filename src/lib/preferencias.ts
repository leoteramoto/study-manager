// Preferências de tela guardadas no localStorage (fora do banco e do backup).
import { DURACAO_MAXIMA_MIN, DURACAO_MINIMA_MIN } from '@/domain/cronometro'

const CHAVE_ULTIMA_DURACAO = 'study-manager:ultimaDuracaoMin'
export const DURACAO_INICIAL_MIN = 60

/** Último valor usado no campo de minutos do cronômetro; na primeira vez, 60. */
export function lerUltimaDuracao(): number {
  try {
    const valor = Number(localStorage.getItem(CHAVE_ULTIMA_DURACAO))
    return Number.isInteger(valor) && valor >= DURACAO_MINIMA_MIN && valor <= DURACAO_MAXIMA_MIN
      ? valor
      : DURACAO_INICIAL_MIN
  } catch {
    return DURACAO_INICIAL_MIN
  }
}

export function gravarUltimaDuracao(minutos: number): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_DURACAO, String(minutos))
  } catch {
    // Armazenamento indisponível (janela privada etc.): só não lembra o valor.
  }
}
