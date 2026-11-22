import { useLiveQuery } from 'dexie-react-hooks'
import { BellIcon } from 'lucide-react'
import { useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { definirNotificacoesAtivas, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import {
  pedirPermissaoNotificacao,
  statusNotificacao,
  type StatusNotificacao,
} from '@/features/cronometro/motor/alertas'
import { useExecutar } from '@/lib/useExecutar'

const TEXTO_STATUS: Record<StatusNotificacao, string> = {
  permitidas: 'Permitidas pelo navegador.',
  bloqueadas: 'Bloqueadas pelo navegador. Para liberar, use o ícone ao lado do endereço do site.',
  nao_solicitadas: 'Ainda não solicitadas.',
  nao_suportadas: 'Este navegador não oferece notificações.',
}

/** Permissão de notificações do sistema (RN39), usadas no fim do cronômetro (RN25). */
export function SecaoNotificacoes() {
  const configuracoes = useLiveQuery(obterConfiguracoes)
  const [status, setStatus] = useState<StatusNotificacao>(statusNotificacao)
  const { erro, executar, limparErro } = useExecutar()
  const ativas = configuracoes?.notificacoesAtivas ?? false

  const pedir = () =>
    executar(async () => {
      const novo = await pedirPermissaoNotificacao()
      setStatus(novo)
      await definirNotificacoesAtivas(novo === 'permitidas')
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <BellIcon className="size-4" aria-hidden="true" />
            Notificações
          </h2>
        </CardTitle>
        <CardDescription>
          Avisam quando o tempo do cronômetro acaba e o app está em segundo plano.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
        <p role="status" className="text-sm">
          <span className="font-medium">Situação: </span>
          {TEXTO_STATUS[status]}
          {status === 'permitidas' && (ativas ? ' Ativadas no app.' : ' Desativadas no app.')}
        </p>
        <div className="flex flex-wrap gap-2">
          {status === 'nao_solicitadas' && (
            <Button onClick={() => void pedir()}>Permitir notificações</Button>
          )}
          {status === 'permitidas' && (
            <Button
              variant="outline"
              onClick={() => void executar(() => definirNotificacoesAtivas(!ativas))}
            >
              {ativas ? 'Desativar notificações' : 'Ativar notificações'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
