import { useLiveQuery } from 'dexie-react-hooks'
import { GlobeIcon } from 'lucide-react'
import { useId, useMemo, useState, type SyntheticEvent } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { definirFuso, obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { CLASSE_SELECT } from '@/lib/estilos'
import { FUSOS_BRASIL, fusoDoBrasil, listarFusosIana } from '@/lib/fuso'
import { useExecutar } from '@/lib/useExecutar'

const OUTROS = 'outros'

/** Fuso horário (RN37): 4 fusos brasileiros com nome amigável e "Outros". */
export function SecaoFuso() {
  const configuracoes = useLiveQuery(obterConfiguracoes)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <GlobeIcon className="size-4" aria-hidden="true" />
            Fuso horário
          </h2>
        </CardTitle>
        <CardDescription>
          Define a data de hoje, o mês atual e a data dos novos registros. Registros já gravados
          mantêm a data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {configuracoes && (
          // A chave recria o formulário quando o fuso muda (inclusive em outra aba).
          <FormularioFuso key={configuracoes.fusoHorario} fusoAtual={configuracoes.fusoHorario} />
        )}
      </CardContent>
    </Card>
  )
}

function FormularioFuso({ fusoAtual }: { fusoAtual: string }) {
  const id = useId()
  const { erro, executar, limparErro } = useExecutar()
  const [outros, setOutros] = useState(!fusoDoBrasil(fusoAtual))
  const [texto, setTexto] = useState(fusoDoBrasil(fusoAtual) ? '' : fusoAtual)
  const fusosIana = useMemo(() => listarFusosIana(), [])

  const aplicarOutro = (evento: SyntheticEvent) => {
    evento.preventDefault()
    void executar(() => definirFuso(texto))
  }

  return (
    <div className="grid gap-3">
      {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor={`${id}-fuso`}>Fuso</Label>
        <select
          id={`${id}-fuso`}
          className={CLASSE_SELECT}
          value={outros ? OUTROS : fusoAtual}
          onChange={(evento) => {
            const valor = evento.target.value
            if (valor === OUTROS) {
              setOutros(true)
              return
            }
            setOutros(false)
            void executar(() => definirFuso(valor))
          }}
        >
          {FUSOS_BRASIL.map((fuso) => (
            <option key={fuso.id} value={fuso.id}>
              {fuso.nome} ({fuso.id})
            </option>
          ))}
          <option value={OUTROS}>Outros</option>
        </select>
      </div>
      {outros && (
        <form className="grid gap-2 sm:max-w-sm" onSubmit={aplicarOutro}>
          <Label htmlFor={`${id}-outro`}>Fuso IANA</Label>
          <div className="flex gap-2">
            <Input
              id={`${id}-outro`}
              list={`${id}-lista`}
              placeholder="Ex.: Europe/Lisbon"
              autoComplete="off"
              spellCheck={false}
              value={texto}
              onChange={(evento) => {
                setTexto(evento.target.value)
              }}
            />
            <Button type="submit" variant="outline">
              Aplicar
            </Button>
          </div>
          <datalist id={`${id}-lista`}>
            {fusosIana.map((fuso) => (
              <option key={fuso} value={fuso} />
            ))}
          </datalist>
          {!fusoDoBrasil(fusoAtual) && (
            <p className="text-muted-foreground text-sm">Fuso atual: {fusoAtual}</p>
          )}
        </form>
      )}
    </div>
  )
}
