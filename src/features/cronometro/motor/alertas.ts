// Alertas de fim de sessão (RN25): notificação do sistema e som.
// O destaque visual vem do próprio estado da sessão e não depende de nada aqui.
import { SONS, SOM_PADRAO } from '@/lib/sons'

export interface PreferenciasSom {
  somAtivo: boolean
  somId: string
  volume: number
}

let audio: HTMLAudioElement | null = null

function urlDoSom(somId: string): string {
  const som = SONS.find((s) => s.id === somId) ?? SONS.find((s) => s.id === SOM_PADRAO)
  return `${import.meta.env.BASE_URL}${som?.arquivo ?? SONS[0].arquivo}`
}

/** Um único elemento de áudio, reaproveitado: o destravamento vale para ele. */
function elementoAudio(somId: string): HTMLAudioElement {
  const url = urlDoSom(somId)
  audio ??= new Audio()
  if (audio.dataset.som !== url) {
    audio.src = url
    audio.dataset.som = url
  }
  return audio
}

/** `play()` pode lançar na hora ou devolver promessa rejeitada (autoplay bloqueado). */
async function tocar(elemento: HTMLAudioElement): Promise<void> {
  await Promise.resolve().then(() => elemento.play())
}

/**
 * Chamado no clique de Iniciar (gesto do usuário): toca o som mudo e para,
 * para o navegador liberar o autoplay do alerta de fim. Falhas são ignoradas.
 */
export function destravarAudio(somId: string): void {
  try {
    const elemento = elementoAudio(somId)
    elemento.muted = true
    tocar(elemento)
      .then(() => {
        elemento.pause()
        elemento.currentTime = 0
      })
      .catch(() => undefined)
      .finally(() => {
        elemento.muted = false
      })
  } catch {
    // Sem suporte a áudio: o alerta visual continua.
  }
}

/**
 * Toca o som configurado. Nunca lança: com o autoplay bloqueado, só devolve
 * `false` (o destaque visual e a notificação continuam valendo).
 */
export async function tocarSom(prefs: PreferenciasSom): Promise<boolean> {
  if (!prefs.somAtivo) return false
  try {
    const elemento = elementoAudio(prefs.somId)
    elemento.muted = false
    elemento.volume = Math.min(1, Math.max(0, prefs.volume))
    elemento.currentTime = 0
    await tocar(elemento)
    return true
  } catch (erro) {
    if (import.meta.env.DEV) console.warn('Não foi possível tocar o som de alerta', erro)
    return false
  }
}

/** Situação da permissão de notificações do navegador (RN39). */
export type StatusNotificacao = 'permitidas' | 'bloqueadas' | 'nao_solicitadas' | 'nao_suportadas'

export function statusNotificacao(): StatusNotificacao {
  if (typeof Notification === 'undefined') return 'nao_suportadas'
  switch (Notification.permission) {
    case 'granted':
      return 'permitidas'
    case 'denied':
      return 'bloqueadas'
    default:
      return 'nao_solicitadas'
  }
}

export async function pedirPermissaoNotificacao(): Promise<StatusNotificacao> {
  if (typeof Notification === 'undefined') return 'nao_suportadas'
  await Notification.requestPermission()
  return statusNotificacao()
}

/**
 * Notificação do sistema, só com a permissão concedida e a aba em segundo
 * plano (RN25). Nunca lança.
 */
export function notificar(ativas: boolean, titulo: string, corpo: string): boolean {
  if (!ativas || statusNotificacao() !== 'permitidas') return false
  if (document.visibilityState !== 'hidden') return false
  try {
    new Notification(titulo, { body: corpo, tag: 'study-manager-cronometro', lang: 'pt-BR' })
    return true
  } catch {
    return false
  }
}

/** Só para testes: esquece o elemento de áudio. */
export function reiniciarAudioParaTestes(): void {
  audio = null
}
