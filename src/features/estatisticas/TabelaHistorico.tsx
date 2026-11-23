import { PencilIcon, Trash2Icon } from 'lucide-react'
import { CodigoMateria } from '@/components/CodigoMateria'
import { Button } from '@/components/ui/button'
import type { Registro } from '@/db/tipos'
import { ROTULOS_ENCERRAMENTO } from '@/domain/cronometro'
import { MATERIA_DESCONHECIDA, type MateriaParaEstatistica } from '@/domain/estatisticas'
import { podeEditar, podeExcluir } from '@/domain/lancamentos'
import { formatarDataCurta, formatarHoraNoFuso, formatarMinutos } from '@/domain/tempo'

interface Props {
  /** Registros do período, já ordenados e sem os excluídos. */
  registros: readonly Registro[]
  materiaPorId: ReadonlyMap<string, MateriaParaEstatistica>
  fuso: string
  onEditar: (registro: Registro) => void
  onExcluir: (registro: Registro) => void
}

const COLUNAS = [
  { titulo: 'Data', direita: false },
  { titulo: 'Início', direita: false },
  { titulo: 'Término', direita: false },
  { titulo: 'Tempo (min)', direita: true },
  { titulo: 'Matéria', direita: false },
  { titulo: 'Origem', direita: false },
  { titulo: 'Ações', direita: true },
] as const

function hora(instante: string | null, fuso: string): string {
  return instante === null ? '—' : formatarHoraNoFuso(instante, fuso)
}

/**
 * Tabela 01, histórico do mês (RN28). O código é sempre o atual da matéria.
 * Só lançamentos manuais têm "Editar" (RN31).
 */
export function TabelaHistorico({ registros, materiaPorId, fuso, onEditar, onExcluir }: Props) {
  if (registros.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum estudo registrado neste mês.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Histórico de estudos do mês</caption>
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
          {registros.map((registro) => {
            const materia = materiaPorId.get(registro.materiaId) ?? MATERIA_DESCONHECIDA
            const data = formatarDataCurta(registro.data)
            return (
              <tr key={registro.id} className="border-b last:border-b-0">
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{data}</td>
                <td className="px-3 py-2 tabular-nums">{hora(registro.inicio, fuso)}</td>
                <td className="px-3 py-2 tabular-nums">{hora(registro.fim, fuso)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarMinutos(registro.duracaoSeg)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <CodigoMateria codigo={materia.codigo} cor={materia.cor} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {registro.origem === 'manual' ? (
                    'Manual'
                  ) : (
                    <>
                      Cronômetro
                      {registro.tipoEncerramento !== 'manual' && (
                        <span className="block text-xs text-muted-foreground">
                          {ROTULOS_ENCERRAMENTO[registro.tipoEncerramento]}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {podeEditar(registro) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar lançamento de ${materia.codigo} em ${data}`}
                      onClick={() => {
                        onEditar(registro)
                      }}
                    >
                      <PencilIcon />
                    </Button>
                  )}
                  {podeExcluir(registro) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir registro de ${materia.codigo} em ${data}`}
                      onClick={() => {
                        onExcluir(registro)
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
