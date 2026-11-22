const formatoDecimal = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 10,
  useGrouping: false,
})

/** Número decimal para campos editáveis, com vírgula (`1,5`) e sem separador de milhar. */
export function formatarDecimal(valor: number): string {
  return formatoDecimal.format(valor)
}
