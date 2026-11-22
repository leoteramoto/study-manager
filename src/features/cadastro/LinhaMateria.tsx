import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { arquivarMateria, desarquivarMateria, moverMateria } from '@/db/materiasRepositorio'
import type { Materia, Objetivo } from '@/db/tipos'
import { BotoesOrdem } from './BotoesOrdem'
import { DialogoMateria } from './DialogoMateria'
import type { Executar } from './useExecutar'

interface Props {
  materia: Materia
  objetivo: Objetivo
  posicao: number
  ultima: boolean
  mostrarArquivados: boolean
  executar: Executar
}

export function LinhaMateria({
  materia,
  objetivo,
  posicao,
  ultima,
  mostrarArquivados,
  executar,
}: Props) {
  const [editando, setEditando] = useState(false)

  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2">
        <span
          aria-hidden
          className="inline-block size-3 rounded-full align-middle"
          style={{ backgroundColor: materia.cor }}
        />
      </td>
      <td className="px-3 py-2">
        <span className="font-medium">{materia.nome}</span>
        {!materia.ativo && (
          <Badge variant="outline" className="ml-2">
            Arquivada
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{materia.codigo}</td>
      <td className="max-w-xs px-3 py-2 text-muted-foreground">
        <span className="line-clamp-2 break-words" title={materia.descricao ?? undefined}>
          {materia.descricao ?? '—'}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="w-6 text-right tabular-nums">{posicao}</span>
          <BotoesOrdem
            rotulo={materia.nome}
            primeiro={posicao === 1}
            ultimo={ultima}
            onMover={(direcao) => {
              void executar(() => moverMateria(materia.id, direcao, mostrarArquivados))
            }}
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar ${materia.nome}`}
            title="Editar"
            onClick={() => {
              setEditando(true)
            }}
          >
            <PencilIcon />
          </Button>
          {materia.ativo ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Arquivar ${materia.nome}`}
              title="Arquivar"
              onClick={() => {
                void executar(() => arquivarMateria(materia.id))
              }}
            >
              <ArchiveIcon />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Desarquivar ${materia.nome}`}
              title="Desarquivar"
              onClick={() => {
                void executar(() => desarquivarMateria(materia.id))
              }}
            >
              <ArchiveRestoreIcon />
            </Button>
          )}
        </div>
        {editando && (
          <DialogoMateria
            objetivo={objetivo}
            materia={materia}
            corInicial={materia.cor}
            onFechar={() => {
              setEditando(false)
            }}
          />
        )}
      </td>
    </tr>
  )
}
