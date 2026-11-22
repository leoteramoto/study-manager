import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { arquivarObjetivo, desarquivarObjetivo, moverObjetivo } from '@/db/objetivosRepositorio'
import type { Materia, Objetivo } from '@/db/tipos'
import { cn } from '@/lib/utils'
import { BotoesOrdem } from './BotoesOrdem'
import { ConfirmarArquivamento } from './ConfirmarArquivamento'
import { DialogoMateria } from './DialogoMateria'
import { DialogoObjetivo } from './DialogoObjetivo'
import { TabelaMaterias } from './TabelaMaterias'
import type { Executar } from '@/lib/useExecutar'

interface Props {
  objetivo: Objetivo
  /** Matérias visíveis do objetivo, já ordenadas. */
  materias: Materia[]
  posicao: number
  ultimo: boolean
  mostrarArquivados: boolean
  /** Cor sugerida para a próxima matéria criada. */
  corNovaMateria: string
  executar: Executar
}

type Dialogo = 'editar' | 'arquivar' | 'nova-materia' | null

function rotuloQuantidade(quantidade: number): string {
  return quantidade === 1 ? '1 matéria' : `${quantidade} matérias`
}

export function ItemObjetivo({
  objetivo,
  materias,
  posicao,
  ultimo,
  mostrarArquivados,
  corNovaMateria,
  executar,
}: Props) {
  const [aberto, setAberto] = useState(true)
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const materiasAtivas = materias.filter((m) => m.ativo).length
  const fechar = () => {
    setDialogo(null)
  }

  return (
    <li>
      <Card className="gap-0 py-0">
        <Collapsible open={aberto} onOpenChange={setAberto}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="-ml-2 h-auto min-w-0 px-2 py-1 text-base">
                <ChevronRightIcon
                  aria-hidden
                  className={cn('transition-transform', aberto && 'rotate-90')}
                />
                <span className="truncate font-semibold">{objetivo.nome}</span>
              </Button>
            </CollapsibleTrigger>
            <Badge variant="secondary">{objetivo.sigla}</Badge>
            {!objetivo.ativo && <Badge variant="outline">Arquivado</Badge>}
            <span className="text-sm text-muted-foreground">
              {rotuloQuantidade(materiasAtivas)}
            </span>

            <div className="ml-auto flex items-center gap-1">
              <span className="w-6 text-right text-sm tabular-nums" title="Ordem">
                <span className="sr-only">Ordem </span>
                {posicao}
              </span>
              <BotoesOrdem
                rotulo={objetivo.nome}
                primeiro={posicao === 1}
                ultimo={ultimo}
                onMover={(direcao) => {
                  void executar(() => moverObjetivo(objetivo.id, direcao, mostrarArquivados))
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${objetivo.nome}`}
                title="Editar"
                onClick={() => {
                  setDialogo('editar')
                }}
              >
                <PencilIcon />
              </Button>
              {objetivo.ativo ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Arquivar ${objetivo.nome}`}
                  title="Arquivar"
                  onClick={() => {
                    setDialogo('arquivar')
                  }}
                >
                  <ArchiveIcon />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Desarquivar ${objetivo.nome}`}
                  title="Desarquivar"
                  onClick={() => {
                    void executar(() => desarquivarObjetivo(objetivo.id))
                  }}
                >
                  <ArchiveRestoreIcon />
                </Button>
              )}
            </div>
          </div>

          <CollapsibleContent>
            <div className="grid gap-3 border-t px-4 py-3">
              <TabelaMaterias
                objetivo={objetivo}
                materias={materias}
                mostrarArquivados={mostrarArquivados}
                executar={executar}
              />
              {objetivo.ativo && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDialogo('nova-materia')
                    }}
                  >
                    <PlusIcon />
                    Nova matéria
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {dialogo === 'editar' && <DialogoObjetivo objetivo={objetivo} onFechar={fechar} />}
      {dialogo === 'nova-materia' && (
        <DialogoMateria objetivo={objetivo} corInicial={corNovaMateria} onFechar={fechar} />
      )}
      {dialogo === 'arquivar' && (
        <ConfirmarArquivamento
          nome={objetivo.nome}
          materiasAtivas={materiasAtivas}
          onFechar={fechar}
          onConfirmar={() => {
            void executar(() => arquivarObjetivo(objetivo.id))
          }}
        />
      )}
    </li>
  )
}
