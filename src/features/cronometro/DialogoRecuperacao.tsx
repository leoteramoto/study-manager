import { useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { formatarRelogio } from '@/domain/cronometro'
import { AvisoPausaAutomatica } from './AvisoPausaAutomatica'
import { ConfirmarDescarte } from './ConfirmarDescarte'
import { useCronometro } from './useCronometro'

interface Props {
  onFechar: () => void
}

/** "Sessão interrompida encontrada" (RN20): aparece só quando nenhuma aba estava com a sessão. */
export function DialogoRecuperacao({ onFechar }: Props) {
  const { sessao, materia, tempoMs, erro, limparErro, continuar, encerrarRecuperada, descartar } =
    useCronometro()
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)

  if (sessao?.estado !== 'pausado') return null

  const executar = async (acao: () => Promise<boolean>) => {
    if (await acao()) onFechar()
  }

  return (
    <>
      <AlertDialog open>
        <AlertDialogContent
          onEscapeKeyDown={(evento) => {
            evento.preventDefault()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Sessão interrompida encontrada</AlertDialogTitle>
            <AlertDialogDescription>
              {materia?.codigo ?? 'Matéria'}: {formatarRelogio(tempoMs)} contados de{' '}
              {sessao.duracaoPlanejadaMin} min planejados.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
          <AvisoPausaAutomatica />

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmandoDescarte(true)
              }}
            >
              Descartar
            </Button>
            <Button variant="outline" onClick={() => void executar(encerrarRecuperada)}>
              Encerrar e revisar
            </Button>
            <Button onClick={() => void executar(continuar)}>Continuar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {confirmandoDescarte && (
        <ConfirmarDescarte
          onConfirmar={() => {
            setConfirmandoDescarte(false)
            void executar(descartar)
          }}
          onFechar={() => {
            setConfirmandoDescarte(false)
          }}
        />
      )}
    </>
  )
}
