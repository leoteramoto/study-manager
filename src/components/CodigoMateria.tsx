interface Props {
  codigo: string
  cor: string
}

/** Código da matéria com a bolinha da sua cor, para identificação. */
export function CodigoMateria({ codigo, cor }: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
      {codigo}
    </span>
  )
}
