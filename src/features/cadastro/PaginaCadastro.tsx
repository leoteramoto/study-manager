import { useLiveQuery } from 'dexie-react-hooks'
import { PlusIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { listarMaterias } from '@/db/materiasRepositorio'
import { listarObjetivos } from '@/db/objetivosRepositorio'
import { corPadrao, ordenarPorOrdem } from '@/domain/cadastro'
import { AvisoErro } from '@/components/AvisoErro'
import { DialogoObjetivo } from './DialogoObjetivo'
import { ItemObjetivo } from './ItemObjetivo'
import { useExecutar } from '@/lib/useExecutar'

export function PaginaCadastro() {
  const idArquivados = useId()
  const objetivos = useLiveQuery(listarObjetivos)
  const materias = useLiveQuery(listarMaterias)
  const [mostrarArquivados, setMostrarArquivados] = useState(false)
  const [criando, setCriando] = useState(false)
  const { erro, executar, limparErro } = useExecutar()

  const visiveis = useMemo(
    () => ordenarPorOrdem(objetivos ?? []).filter((o) => mostrarArquivados || o.ativo),
    [objetivos, mostrarArquivados],
  )

  const materiasPorObjetivo = useMemo(() => {
    const mapa = new Map<string, NonNullable<typeof materias>>()
    for (const materia of ordenarPorOrdem(materias ?? [])) {
      if (!mostrarArquivados && !materia.ativo) continue
      const lista = mapa.get(materia.objetivoId) ?? []
      lista.push(materia)
      mapa.set(materia.objetivoId, lista)
    }
    return mapa
  }, [materias, mostrarArquivados])

  const carregando = objetivos === undefined || materias === undefined
  const corNovaMateria = corPadrao(materias?.length ?? 0)

  return (
    <>
      <CabecalhoPagina titulo="Cadastro">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={idArquivados}
              checked={mostrarArquivados}
              onCheckedChange={setMostrarArquivados}
            />
            <Label htmlFor={idArquivados}>Mostrar arquivados</Label>
          </div>
          <Button
            onClick={() => {
              setCriando(true)
            }}
          >
            <PlusIcon />
            Novo objetivo
          </Button>
        </div>
      </CabecalhoPagina>

      {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">
              {objetivos.length === 0
                ? 'Nenhum objetivo cadastrado. Comece criando um em "Novo objetivo".'
                : 'Todos os objetivos estão arquivados. Ative "Mostrar arquivados" para vê-los.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul aria-label="Objetivos" className="grid gap-3">
          {visiveis.map((objetivo, indice) => (
            <ItemObjetivo
              key={objetivo.id}
              objetivo={objetivo}
              materias={materiasPorObjetivo.get(objetivo.id) ?? []}
              posicao={indice + 1}
              ultimo={indice === visiveis.length - 1}
              mostrarArquivados={mostrarArquivados}
              corNovaMateria={corNovaMateria}
              executar={executar}
            />
          ))}
        </ul>
      )}

      {criando && (
        <DialogoObjetivo
          onFechar={() => {
            setCriando(false)
          }}
        />
      )}
    </>
  )
}
