// Worker do relógio: só avisa "verifique agora" a cada intervalo. Não informa
// tempo nenhum; quem calcula é a thread principal, pelo relógio (RN17).
// Timers de workers dedicados não sofrem o limite de 1×/min que o Chrome
// aplica a abas ocultas, mas param de verdade quando o computador dorme.
let id: ReturnType<typeof setInterval> | undefined

self.onmessage = (evento: MessageEvent<number>) => {
  if (id !== undefined) clearInterval(id)
  id = setInterval(() => {
    self.postMessage('tick')
  }, evento.data)
}
