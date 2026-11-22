import { useLiveQuery } from 'dexie-react-hooks'
import { PencilIcon } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { definirMetaMensal, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { listarMaterias } from '@/db/materiasRepositorio'
import { listarObjetivos } from '@/db/objetivosRepositorio'
import {
  alterarPeso,
  listarPlanejamento,
  removerDoPlanejamento,
} from '@/db/planejamentoRepositorio'
import { listarRegistrosDoIntervalo } from '@/db/registrosRepositorio'
import {
  calcularPainel,
  montarLinhasPlanejamento,
  somarSegundosPorMateria,
} from '@/domain/calculos'
import { dataNoFuso, intervaloDoMes, mesNoFuso } from '@/domain/tempo'
import { FUSO_PADRAO } from '@/lib/fuso'
import { useAgora } from '@/lib/useAgora'
import { useExecutar } from '@/lib/useExecutar'
import { CardCronometro } from '@/features/cronometro/CardCronometro'
import { DialogoPlanejamento } from './DialogoPlanejamento'
import { PainelIndicadores } from './PainelIndicadores'
import { TabelaPlanejamento } from './TabelaPlanejamento'

// Ferramenta de desenvolvimento: fora do bundle de produção.
const BotaoSeed = import.meta.env.DEV
  ? lazy(() => import('./BotaoSeed').then((m) => ({ default: m.BotaoSeed })))
  : null

export function PaginaPrincipal() {
  const agora = useAgora()
  const configuracoes = useLiveQuery(obterConfiguracoes)
  const planejamento = useLiveQuery(listarPlanejamento)
  const materias = useLiveQuery(listarMaterias)
  const objetivos = useLiveQuery(listarObjetivos)
  const [editandoPlano, setEditandoPlano] = useState(false)
  const { erro, executar, limparErro } = useExecutar()

  const fuso = configuracoes?.fusoHorario ?? FUSO_PADRAO
  const hoje = dataNoFuso(agora, fuso)
  // O mês vem do relógio no fuso configurado: a consulta muda sozinha na virada (RN12).
  const { inicio, fim } = intervaloDoMes(mesNoFuso(agora, fuso))
  const registros = useLiveQuery(() => listarRegistrosDoIntervalo(inicio, fim), [inicio, fim])
  const metaMensalHoras = configuracoes?.metaMensalHoras ?? null

  const soma = useMemo(
    () => somarSegundosPorMateria(registros ?? [], { inicio, fim }),
    [registros, inicio, fim],
  )
  const linhas = useMemo(
    () =>
      montarLinhasPlanejamento({
        planejamento: planejamento ?? [],
        materias: materias ?? [],
        objetivos: objetivos ?? [],
        segundosPorMateria: soma.porMateria,
        metaMensalHoras,
      }),
    [planejamento, materias, objetivos, soma, metaMensalHoras],
  )
  const painel = useMemo(
    () => calcularPainel(metaMensalHoras, soma.totalSeg, linhas.length),
    [metaMensalHoras, soma, linhas.length],
  )

  const carregando =
    configuracoes === undefined ||
    planejamento === undefined ||
    materias === undefined ||
    objetivos === undefined ||
    registros === undefined

  return (
    <>
      <CabecalhoPagina titulo="Principal">
        {BotaoSeed && (
          <Suspense fallback={null}>
            <BotaoSeed executar={executar} />
          </Suspense>
        )}
      </CabecalhoPagina>

      {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <PainelIndicadores
            hoje={hoje}
            painel={painel}
            metaMensalHoras={metaMensalHoras}
            onSalvarMeta={(horas) => {
              void executar(() => definirMetaMensal(horas))
            }}
          />

          <CardCronometro materias={linhas} />

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                <h2>Planejamento</h2>
              </CardTitle>
              <Button
                variant="outline"
                onClick={() => {
                  setEditandoPlano(true)
                }}
              >
                <PencilIcon />
                Editar planejamento
              </Button>
            </CardHeader>
            <CardContent>
              <TabelaPlanejamento
                linhas={linhas}
                onSalvarPeso={(materiaId, peso) => {
                  void executar(() => alterarPeso(materiaId, peso))
                }}
                onRemover={(materiaId) => {
                  void executar(() => removerDoPlanejamento(materiaId))
                }}
              />
            </CardContent>
          </Card>
        </>
      )}

      {editandoPlano && (
        <DialogoPlanejamento
          selecionadasIniciais={(planejamento ?? []).map((item) => item.materiaId)}
          onFechar={() => {
            setEditandoPlano(false)
          }}
        />
      )}
    </>
  )
}
