import { HardDriveIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { consultarPersistencia, solicitarPersistencia } from '@/db/armazenamento'

type Situacao = 'carregando' | 'persistente' | 'nao_persistente' | 'nao_suportado' | 'pedindo'

const TEXTO: Record<Situacao, string> = {
  carregando: 'Verificando…',
  persistente: 'Persistente. O navegador não apaga os dados para liberar espaço.',
  nao_persistente:
    'Não persistente. Sob falta de espaço, o navegador pode apagar os dados. Faça backups com frequência.',
  nao_suportado: 'Este navegador não informa se o armazenamento é persistente.',
  pedindo: 'Aguardando a resposta do navegador…',
}

function paraSituacao(valor: boolean | null): Situacao {
  if (valor === null) return 'nao_suportado'
  return valor ? 'persistente' : 'nao_persistente'
}

/** Situação do armazenamento persistente (RN35), com botão para pedir de novo. */
export function SecaoArmazenamento() {
  const [situacao, setSituacao] = useState<Situacao>('carregando')

  useEffect(() => {
    let ativo = true
    void consultarPersistencia().then((valor) => {
      if (ativo) setSituacao(paraSituacao(valor))
    })
    return () => {
      ativo = false
    }
  }, [])

  const pedir = async () => {
    setSituacao('pedindo')
    await solicitarPersistencia()
    setSituacao(paraSituacao(await consultarPersistencia()))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <HardDriveIcon className="size-4" aria-hidden="true" />
            Armazenamento
          </h2>
        </CardTitle>
        <CardDescription>Os dados ficam no banco local deste navegador.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p role="status" className="text-sm">
          <span className="font-medium">Situação: </span>
          {TEXTO[situacao]}
        </p>
        {(situacao === 'nao_persistente' || situacao === 'pedindo') && (
          <div>
            <Button
              variant="outline"
              disabled={situacao === 'pedindo'}
              onClick={() => void pedir()}
            >
              Pedir armazenamento persistente
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
