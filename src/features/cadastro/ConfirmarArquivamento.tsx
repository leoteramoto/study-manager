import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Props {
  nome: string
  materiasAtivas: number
  onConfirmar: () => void
  onFechar: () => void
}

/** Confirmação antes de arquivar um objetivo, que arquiva as matérias em cascata (RN04). */
export function ConfirmarArquivamento({ nome, materiasAtivas, onConfirmar, onFechar }: Props) {
  const afetadas =
    materiasAtivas === 0
      ? 'Este objetivo não tem matérias ativas.'
      : materiasAtivas === 1
        ? 'A matéria ativa deste objetivo também será arquivada e sairá do planejamento.'
        : `As ${materiasAtivas} matérias ativas deste objetivo também serão arquivadas e sairão do planejamento.`

  return (
    <AlertDialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) onFechar()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar {nome}?</AlertDialogTitle>
          <AlertDialogDescription>
            {afetadas} O histórico de estudos é mantido, e você pode desarquivar depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>Arquivar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
