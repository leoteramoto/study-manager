import { useCronometro } from '@/features/cronometro/useCronometro'
import { ID_SONDA_HEARTBEAT } from './idSondaHeartbeat'

/**
 * Sonda só de teste: mostra o `ultimoHeartbeatEm` que o provedor já recebeu
 * do banco. O motor decide o próximo heartbeat por esse valor; os testes
 * esperam por ele antes de avançar o relógio de novo.
 */
export function SondaHeartbeat() {
  const { sessao } = useCronometro()
  return (
    <span hidden data-testid={ID_SONDA_HEARTBEAT}>
      {sessao?.ultimoHeartbeatEm ?? ''}
    </span>
  )
}
