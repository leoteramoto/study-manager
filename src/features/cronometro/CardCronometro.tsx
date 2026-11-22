import { PauseIcon, PlayIcon, SquareIcon, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { DURACAO_MAXIMA_MIN, DURACAO_MINIMA_MIN, formatarRelogio } from '@/domain/cronometro'
import { lerUltimaDuracao } from '@/lib/preferencias'
import { cn } from '@/lib/utils'
import { AvisoPausaAutomatica } from './AvisoPausaAutomatica'
import { ConfirmarDescarte } from './ConfirmarDescarte'
import { useCronometro } from './useCronometro'

export interface MateriaDoPlano {
  materiaId: string
  codigo: string
  cor: string
}

interface Props {
  /** Matérias do planejamento, já na ordem objetivo → matéria. */
  materias: readonly MateriaDoPlano[]
}

const CLASSE_SELECT =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

/** Card do cronômetro na tela Principal (RN15, RN16, RN13). */
export function CardCronometro({ materias }: Props) {
  const {
    sessao,
    materia,
    tempoMs,
    erro,
    limparErro,
    iniciar,
    pausar,
    continuar,
    encerrar,
    descartar,
  } = useCronometro()
  const idMateria = useId()
  const idMinutos = useId()
  const [escolhida, setEscolhida] = useState('')
  const [minutosTexto, setMinutosTexto] = useState(() => String(lerUltimaDuracao()))
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)

  const emSessao = Boolean(sessao)
  const materiaId = materias.some((m) => m.materiaId === escolhida)
    ? escolhida
    : (materias[0]?.materiaId ?? '')
  const corSelecionada = emSessao
    ? materia?.cor
    : materias.find((m) => m.materiaId === materiaId)?.cor
  const minutos = Number(minutosTexto)
  const minutosValidos =
    Number.isInteger(minutos) && minutos >= DURACAO_MINIMA_MIN && minutos <= DURACAO_MAXIMA_MIN
  const planoVazio = materias.length === 0
  const duracaoMs = (sessao?.duracaoPlanejadaMin ?? 0) * 60_000
  const percentual = sessao ? Math.min(100, (tempoMs / duracaoMs) * 100) : 0
  const tempoExibido = sessao ? tempoMs : 0

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <h2>Cronômetro</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
        {planoVazio && !emSessao && (
          <p role="status" className="text-sm text-muted-foreground">
            Adicione matérias ao planejamento para usar o cronômetro.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="grid gap-1.5">
            <Label htmlFor={idMateria}>Matéria</Label>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full border"
                style={{ backgroundColor: corSelecionada ?? 'transparent' }}
              />
              <select
                id={idMateria}
                className={CLASSE_SELECT}
                value={emSessao ? (sessao?.materiaId ?? '') : materiaId}
                disabled={emSessao || planoVazio}
                onChange={(evento) => {
                  setEscolhida(evento.target.value)
                }}
              >
                {emSessao && materia && !materias.some((m) => m.materiaId === materia.id) && (
                  <option value={materia.id}>{materia.codigo}</option>
                )}
                {materias.map((m) => (
                  <option key={m.materiaId} value={m.materiaId}>
                    {m.codigo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={idMinutos}>Minutos</Label>
            <Input
              id={idMinutos}
              type="number"
              inputMode="numeric"
              min={DURACAO_MINIMA_MIN}
              max={DURACAO_MAXIMA_MIN}
              step={1}
              value={emSessao ? String(sessao?.duracaoPlanejadaMin ?? '') : minutosTexto}
              disabled={emSessao}
              aria-invalid={!emSessao && !minutosValidos}
              onChange={(evento) => {
                setMinutosTexto(evento.target.value)
              }}
            />
          </div>
        </div>
        {!emSessao && !minutosValidos && (
          <p className="text-sm text-destructive">Informe um número inteiro de 1 a 480 minutos.</p>
        )}

        <div className="grid gap-2">
          <p
            className={cn(
              'text-center text-5xl font-semibold tabular-nums tracking-tight',
              sessao?.estado === 'pausado' && 'text-muted-foreground',
            )}
            aria-live="off"
            data-testid="tempo-cronometro"
          >
            {formatarRelogio(tempoExibido)}
          </p>
          <Progress value={percentual} aria-label="Progresso da sessão" />
          {sessao?.estado === 'pausado' && (
            <p className="text-center text-sm text-muted-foreground">Pausado</p>
          )}
        </div>

        <AvisoPausaAutomatica />

        <div className="flex flex-wrap justify-center gap-2">
          {!emSessao && (
            <Button
              disabled={planoVazio || !materiaId || !minutosValidos}
              onClick={() => void iniciar(materiaId, minutos)}
            >
              <PlayIcon />
              Iniciar
            </Button>
          )}
          {sessao?.estado === 'em_andamento' && (
            <Button variant="secondary" onClick={() => void pausar()}>
              <PauseIcon />
              Pausar
            </Button>
          )}
          {sessao?.estado === 'pausado' && (
            <Button onClick={() => void continuar()}>
              <PlayIcon />
              Continuar
            </Button>
          )}
          {(sessao?.estado === 'em_andamento' || sessao?.estado === 'pausado') && (
            <>
              <Button variant="outline" onClick={() => void encerrar()}>
                <SquareIcon />
                Encerrar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmandoDescarte(true)
                }}
              >
                <XIcon />
                Cancelar sessão
              </Button>
            </>
          )}
        </div>
        {emSessao && (
          <p className="text-center text-xs text-muted-foreground">
            Atalho: Espaço pausa e continua.
          </p>
        )}
      </CardContent>

      {confirmandoDescarte && (
        <ConfirmarDescarte
          onConfirmar={() => {
            setConfirmandoDescarte(false)
            void descartar()
          }}
          onFechar={() => {
            setConfirmandoDescarte(false)
          }}
        />
      )}
    </Card>
  )
}
