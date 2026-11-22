import type { Materia, Objetivo } from '@/db/tipos'
import { LinhaMateria } from './LinhaMateria'
import type { Executar } from './useExecutar'

interface Props {
  objetivo: Objetivo
  /** Matérias visíveis, já ordenadas. */
  materias: Materia[]
  mostrarArquivados: boolean
  executar: Executar
}

export function TabelaMaterias({ objetivo, materias, mostrarArquivados, executar }: Props) {
  if (materias.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma matéria neste objetivo.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Matérias de {objetivo.nome}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              Cor
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Nome
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Código
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Descrição
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Ordem
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {materias.map((materia, indice) => (
            <LinhaMateria
              key={materia.id}
              materia={materia}
              objetivo={objetivo}
              posicao={indice + 1}
              ultima={indice === materias.length - 1}
              mostrarArquivados={mostrarArquivados}
              executar={executar}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
