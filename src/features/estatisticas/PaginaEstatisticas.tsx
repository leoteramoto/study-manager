import { useLiveQuery } from 'dexie-react-hooks'
import { PlusIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { listarMaterias } from '@/db/materiasRepositorio'
import { listarObjetivos } from '@/db/objetivosRepositorio'
import {
  excluirRegistro,
  listarAnosComRegistros,
  listarRegistrosDoIntervalo,
} from '@/db/registrosRepositorio'
import type { Registro } from '@/db/tipos'
import { anosDisponiveis, MESES, NOMES_MESES } from '@/domain/estatisticas'
import { dataNoFuso, intervaloDoAno, mesNoFuso } from '@/domain/tempo'
import { CLASSE_SELECT } from '@/lib/estilos'
import { FUSO_PADRAO } from '@/lib/fuso'
import { useAgora } from '@/lib/useAgora'
import { useExecutar } from '@/lib/useExecutar'
import { ConfirmarExclusao } from './ConfirmarExclusao'
import { ConteudoPeriodo } from './ConteudoPeriodo'
import { DialogoLancamento } from './DialogoLancamento'

const ABA_ANO = 'ano'

/** `aba`: `'1'`…`'12'` para os meses, `'ano'` para a visão anual. */
interface Selecao {
  ano: number
  aba: string
}

type Dialogo =
  | { tipo: 'lancar' }
  | { tipo: 'editar'; registro: Registro }
  | { tipo: 'excluir'; registro: Registro; descricao: string }

/** Estatísticas (RF07, RF08): seletor de ano, abas Jan–Dez e Ano, lançamentos manuais. */
export function PaginaEstatisticas() {
  const idAno = useId()
  const agora = useAgora()
  const configuracoes = useLiveQuery(obterConfiguracoes)
  const materias = useLiveQuery(listarMaterias)
  const objetivos = useLiveQuery(listarObjetivos)
  const anosComRegistros = useLiveQuery(listarAnosComRegistros)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const { erro, executar, limparErro } = useExecutar()

  const fuso = configuracoes?.fusoHorario ?? FUSO_PADRAO
  const hoje = dataNoFuso(agora, fuso)
  const { ano: anoAtual, mes: mesAtual } = mesNoFuso(agora, fuso)

  // `null` = acompanhar o mês atual: com a tela aberta, a aba vira sozinha na
  // virada do mês (useAgora). Escolher outro ano ou outra aba fixa a seleção;
  // voltar para o mês atual volta a acompanhá-lo.
  const [selecao, setSelecao] = useState<Selecao | null>(null)
  const ano = selecao?.ano ?? anoAtual
  const aba = selecao?.aba ?? String(mesAtual)
  const selecionar = (novoAno: number, novaAba: string) => {
    const ehAtual = novoAno === anoAtual && novaAba === String(mesAtual)
    setSelecao(ehAtual ? null : { ano: novoAno, aba: novaAba })
  }

  const registrosDoAno = useLiveQuery(() => {
    const { inicio, fim } = intervaloDoAno(ano)
    return listarRegistrosDoIntervalo(inicio, fim)
  }, [ano])

  // O ano exibido continua no seletor enquanto estiver selecionado, mesmo sem registros.
  const anos = anosDisponiveis(anosComRegistros ?? [], anoAtual, ano)

  const carregando =
    configuracoes === undefined ||
    materias === undefined ||
    objetivos === undefined ||
    registrosDoAno === undefined

  return (
    <>
      <CabecalhoPagina titulo="Estatísticas">
        <Button
          onClick={() => {
            setDialogo({ tipo: 'lancar' })
          }}
          disabled={carregando}
        >
          <PlusIcon />
          Lançar estudo manual
        </Button>
      </CabecalhoPagina>

      {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}

      {carregando ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <label htmlFor={idAno} className="text-sm font-medium">
              Ano
            </label>
            <select
              id={idAno}
              className={`${CLASSE_SELECT} w-32`}
              value={ano}
              onChange={(e) => {
                selecionar(Number(e.target.value), aba)
              }}
            >
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <Tabs
            value={aba}
            onValueChange={(valor) => {
              selecionar(ano, valor)
            }}
          >
            <div className="max-w-full overflow-x-auto">
              <TabsList aria-label={`Períodos de ${ano}`} className="w-max">
                {MESES.map((rotulo, indice) => (
                  <TabsTrigger
                    key={rotulo}
                    value={String(indice + 1)}
                    aria-label={`${NOMES_MESES[indice] ?? rotulo} de ${ano}`}
                  >
                    {rotulo}
                  </TabsTrigger>
                ))}
                <TabsTrigger value={ABA_ANO}>Ano</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={aba}>
              <ConteudoPeriodo
                ano={ano}
                mes={aba === ABA_ANO ? null : Number(aba)}
                registros={registrosDoAno}
                materias={materias}
                fuso={fuso}
                onEditar={(registro) => {
                  setDialogo({ tipo: 'editar', registro })
                }}
                onExcluir={(registro, descricao) => {
                  setDialogo({ tipo: 'excluir', registro, descricao })
                }}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      {(dialogo?.tipo === 'lancar' || dialogo?.tipo === 'editar') && (
        <DialogoLancamento
          hoje={hoje}
          materias={materias ?? []}
          objetivos={objetivos ?? []}
          registro={dialogo.tipo === 'editar' ? dialogo.registro : undefined}
          onFechar={() => {
            setDialogo(null)
          }}
        />
      )}
      {dialogo?.tipo === 'excluir' && (
        <ConfirmarExclusao
          descricao={dialogo.descricao}
          onConfirmar={() => {
            const { id } = dialogo.registro
            setDialogo(null)
            void executar(() => excluirRegistro(id))
          }}
          onFechar={() => {
            setDialogo(null)
          }}
        />
      )}
    </>
  )
}
