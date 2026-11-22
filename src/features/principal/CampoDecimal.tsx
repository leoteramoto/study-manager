import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { interpretarNumeroBr } from '@/domain/calculos'
import { formatarDecimal } from '@/lib/formatacao'
import { cn } from '@/lib/utils'

interface Props {
  /** Valor gravado; `null` quando ainda não foi definido. */
  valor: number | null
  rotulo: string
  /** Grava o novo valor; quem chama valida e mostra o erro. */
  onSalvar: (valor: number) => void
  className?: string
  id?: string
  placeholder?: string
}

/**
 * Campo decimal editável no lugar (RN07, RN08). Aceita vírgula ou ponto,
 * grava ao sair do campo ou com Enter, e Esc cancela. Texto vazio ou inválido
 * volta ao último valor válido; valores fora da faixa são rejeitados por quem grava.
 */
export function CampoDecimal({ valor, rotulo, onSalvar, className, id, placeholder }: Props) {
  const [rascunho, setRascunho] = useState<string | null>(null)
  const cancelado = useRef(false)
  const exibido = rascunho ?? (valor === null ? '' : formatarDecimal(valor))

  function confirmar() {
    const texto = rascunho
    setRascunho(null)
    if (cancelado.current || texto === null) {
      cancelado.current = false
      return
    }
    const numero = interpretarNumeroBr(texto)
    if (numero === null || numero === valor) return
    onSalvar(numero)
  }

  return (
    <Input
      id={id}
      aria-label={id ? undefined : rotulo}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      className={cn('tabular-nums', className)}
      value={exibido}
      onFocus={() => {
        setRascunho(exibido)
      }}
      onChange={(e) => {
        setRascunho(e.target.value)
      }}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancelado.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}
