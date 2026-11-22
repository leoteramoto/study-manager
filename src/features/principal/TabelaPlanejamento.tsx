import type { LinhaPlanejamento as Linha } from '@/domain/calculos'
import { LinhaPlanejamento } from './LinhaPlanejamento'

interface Props {
  linhas: Linha[]
  onSalvarPeso: (materiaId: string, peso: number) => void
  onRemover: (materiaId: string) => void
}

const COLUNAS = [
  { titulo: '% Concluída', direita: false },
  { titulo: 'Peso', direita: false },
  { titulo: 'Código', direita: false },
  { titulo: 'Matéria', direita: false },
  { titulo: 'Tempo estudado (min)', direita: true },
  { titulo: 'Meta da matéria', direita: true },
  { titulo: 'Tempo restante', direita: true },
  { titulo: 'Ações', direita: true },
] as const

/** Tabela principal do planejamento (RF05). */
export function TabelaPlanejamento({ linhas, onSalvarPeso, onRemover }: Props) {
  if (linhas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma matéria no planejamento. Use "Editar planejamento" para adicionar.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Matérias do planejamento do mês</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {COLUNAS.map(({ titulo, direita }) => (
              <th
                key={titulo}
                scope="col"
                className={`px-3 py-2 font-medium whitespace-nowrap ${direita ? 'text-right' : ''}`}
              >
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <LinhaPlanejamento
              key={linha.materiaId}
              linha={linha}
              onSalvarPeso={onSalvarPeso}
              onRemover={onRemover}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
