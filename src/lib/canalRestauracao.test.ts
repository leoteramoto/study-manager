import { describe, expect, it, vi } from 'vitest'
import { avisarRestauracao, ouvirRestauracao } from './canalRestauracao'

const NOME_CANAL = 'study-manager:restauracao'

function esperar(ms = 50) {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

describe('canalRestauracao', () => {
  it('a aba que avisa não recebe o próprio aviso; as outras recebem', async () => {
    const propria = vi.fn()
    const parar = ouvirRestauracao(propria)
    const outraAba = new BroadcastChannel(NOME_CANAL)
    const recebidas: unknown[] = []
    outraAba.onmessage = (evento: MessageEvent<unknown>) => {
      recebidas.push(evento.data)
    }

    avisarRestauracao()
    await esperar()
    expect(recebidas).toEqual(['dados-restaurados'])
    expect(propria).not.toHaveBeenCalled()

    outraAba.postMessage('dados-restaurados')
    await esperar()
    expect(propria).toHaveBeenCalledTimes(1)

    parar()
    outraAba.postMessage('dados-restaurados')
    await esperar()
    expect(propria).toHaveBeenCalledTimes(1)
    outraAba.close()
  })
})
