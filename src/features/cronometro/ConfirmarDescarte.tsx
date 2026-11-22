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
import { buttonVariants } from '@/components/ui/button'

interface Props {
  onConfirmar: () => void
  onFechar: () => void
}

/** Segunda confirmação antes de descartar uma sessão: nada será gravado (RN15, RN21). */
export function ConfirmarDescarte({ onConfirmar, onFechar }: Props) {
  return (
    <AlertDialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) onFechar()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar esta sessão?</AlertDialogTitle>
          <AlertDialogDescription>
            O tempo desta sessão não será registrado. Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={onConfirmar}
          >
            Descartar sessão
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
