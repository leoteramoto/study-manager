import { useLiveQuery } from 'dexie-react-hooks'
import { Volume2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { definirSom, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import type { Configuracoes } from '@/db/tipos'
import { tocarSom } from '@/features/cronometro/motor/alertas'
import { CLASSE_SELECT } from '@/lib/estilos'
import { SONS } from '@/lib/sons'
import { useExecutar } from '@/lib/useExecutar'

/** Som do fim do cronômetro (RN38): liga/desliga, escolha, volume e "Testar". */
export function SecaoSom() {
  const configuracoes = useLiveQuery(obterConfiguracoes)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Volume2Icon className="size-4" aria-hidden="true" />
            Som
          </h2>
        </CardTitle>
        <CardDescription>Tocado quando o tempo planejado do cronômetro acaba.</CardDescription>
      </CardHeader>
      <CardContent>{configuracoes && <FormularioSom configuracoes={configuracoes} />}</CardContent>
    </Card>
  )
}

function FormularioSom({ configuracoes }: { configuracoes: Configuracoes }) {
  const id = useId()
  const { erro, executar, limparErro } = useExecutar()
  // Valor local só enquanto arrasta; ao soltar, é gravado e volta a vir do banco.
  const [arrastando, setArrastando] = useState<number | null>(null)
  const { somAtivo, somId } = configuracoes
  const volume = arrastando ?? configuracoes.volume
  const percentual = Math.round(volume * 100)

  return (
    <div className="grid gap-4">
      {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
      <div className="flex items-center gap-3">
        <Switch
          id={`${id}-ativo`}
          checked={somAtivo}
          onCheckedChange={(ativo) => void executar(() => definirSom({ somAtivo: ativo }))}
        />
        <Label htmlFor={`${id}-ativo`}>Tocar som no fim do cronômetro</Label>
      </div>
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor={`${id}-som`}>Som</Label>
        <select
          id={`${id}-som`}
          className={CLASSE_SELECT}
          value={somId}
          disabled={!somAtivo}
          onChange={(evento) => {
            const novo = SONS.find((som) => som.id === evento.target.value)
            if (novo) void executar(() => definirSom({ somId: novo.id }))
          }}
        >
          {SONS.map((som) => (
            <option key={som.id} value={som.id}>
              {som.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:max-w-sm">
        <div className="flex items-center justify-between">
          <Label id={`${id}-volume`}>Volume</Label>
          <span className="text-muted-foreground text-sm tabular-nums">{percentual}%</span>
        </div>
        <Slider
          aria-labelledby={`${id}-volume`}
          rotulo="Volume"
          min={0}
          max={100}
          step={5}
          value={[percentual]}
          disabled={!somAtivo}
          onValueChange={([valor = 0]) => {
            setArrastando(valor / 100)
          }}
          onValueCommit={([valor = 0]) => {
            void executar(() => definirSom({ volume: valor / 100 })).finally(() => {
              setArrastando(null)
            })
          }}
        />
      </div>
      <div>
        {/* "Testar" toca mesmo com o som desligado: é um pedido explícito. */}
        <Button variant="outline" onClick={() => void tocarSom({ somAtivo: true, somId, volume })}>
          Testar
        </Button>
      </div>
    </div>
  )
}
