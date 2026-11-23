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
  /** Ex.: "Matemática-PF em 22/11/2026, 45 min". */
  descricao: string
  onConfirmar: () => void
  onFechar: () => void
}

/** Confirmação antes da exclusão lógica de um registro (RN31). */
export function ConfirmarExclusao({ descricao, onConfirmar, onFechar }: Props) {
  return (
    <AlertDialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) onFechar()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
          <AlertDialogDescription>
            {descricao}. O tempo sai das estatísticas e da tela Principal, mas o registro continua
            guardado nos backups.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={onConfirmar}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
