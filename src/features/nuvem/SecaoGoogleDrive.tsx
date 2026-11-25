import { useLiveQuery } from 'dexie-react-hooks'
import { CloudIcon, CloudUploadIcon, LogOutIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { AvisoErro } from '@/components/AvisoErro'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { obterConfiguracoes } from '@/db/configuracoesRepositorio'
import type { EstadoNuvem } from '@/domain/backupNuvem'
import { formatarDataHoraNoFuso } from '@/domain/tempo'
import type { ResultadoEnvio } from './orquestrador'
import { RestaurarDoDrive } from './RestaurarDoDrive'
import { useEstadoNuvem, useNuvem, useTemTokenNuvem } from './useNuvem'

/** Destino do link do indicador "Backup no Drive suspenso" (RN53). */
export const SECAO_GOOGLE_DRIVE = 'google-drive'

export const TEXTO_SUGESTAO_RESTAURAR =
  'Se este navegador é novo ou está sem os seus dados, restaure um backup do Google Drive.'

export const TEXTO_NADA_APAGADO =
  'Desconectar não apaga nada no Google Drive: os backups continuam na pasta "Study Manager".'

const MENSAGENS_ENVIO: Partial<Record<ResultadoEnvio, string>> = {
  enviado: 'Backup enviado para o Google Drive.',
  pendente:
    'Não foi possível enviar agora (sem autorização do Google ou sem internet). O envio ficou pendente.',
}

type Dialogo = 'nenhum' | 'confirmarEnvio' | 'desconectar'

/** Seção "Google Drive" de Configurações (RN48). Sem o recurso, não aparece. */
export function SecaoGoogleDrive() {
  const { disponivel, orquestrador } = useNuvem()
  const estado = useEstadoNuvem()
  const temToken = useTemTokenNuvem()
  const configuracoes = useLiveQuery(obterConfiguracoes)
  const titulo = useRef<HTMLHeadingElement>(null)
  const local = useLocation()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<Dialogo>('nenhum')

  // Seção exibida: o script do Google já fica pronto para o clique (RN41).
  useEffect(() => {
    orquestrador?.preparar()
  }, [orquestrador])

  // Vindo do indicador do cabeçalho: rola até a seção e põe o foco no título.
  const destino: unknown = Reflect.get(Object(local.state), 'secao')
  const carregada = Boolean(estado)
  useEffect(() => {
    if (destino !== SECAO_GOOGLE_DRIVE || !carregada) return
    titulo.current?.scrollIntoView({ block: 'start' })
    titulo.current?.focus()
  }, [destino, carregada, local.key])

  if (!disponivel) return null

  /** Executa uma ação já disparada (de forma síncrona) no clique. */
  const acompanhar = async (tarefa: Promise<void>) => {
    setOcupado(true)
    setErro(null)
    setAviso(null)
    try {
      await tarefa
    } finally {
      setOcupado(false)
    }
  }

  const conectar = () => {
    if (!orquestrador) return
    const conexao = orquestrador.conectar() // síncrono no clique (popup)
    void acompanhar(
      conexao.then((resultado) => {
        if (!resultado.ok) setErro(resultado.erro)
      }),
    )
  }

  const enviar = (confirmado: boolean) => {
    if (!orquestrador) return
    const envio = orquestrador.enviarAgora({ confirmado }) // síncrono no clique (popup)
    setDialogo('nenhum')
    void acompanhar(
      envio.then((resultado) => {
        if (resultado === 'precisaConfirmar') setDialogo('confirmarEnvio')
        setAviso(MENSAGENS_ENVIO[resultado] ?? null)
      }),
    )
  }

  const desconectar = () => {
    if (!orquestrador) return
    setDialogo('nenhum')
    void acompanhar(orquestrador.desconectar())
  }

  const fuso = configuracoes?.fusoHorario
  const pronto = Boolean(orquestrador && estado && fuso)

  return (
    <Card id={SECAO_GOOGLE_DRIVE} aria-labelledby="titulo-google-drive">
      <CardHeader>
        <CardTitle>
          <h2
            id="titulo-google-drive"
            ref={titulo}
            tabIndex={-1}
            className="flex items-center gap-2 outline-none"
          >
            <CloudIcon className="size-4" aria-hidden="true" />
            Google Drive
          </h2>
        </CardTitle>
        <CardDescription>
          Envia cópias automáticas dos seus dados para a pasta &quot;Study Manager&quot; no seu
          Google Drive. Os dados continuam neste navegador: o Drive é só um destino de backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {erro && (
          <AvisoErro
            mensagem={erro}
            onFechar={() => {
              setErro(null)
            }}
          />
        )}
        {!pronto || !estado || !fuso ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : estado.conectado ? (
          <Conectado
            estado={estado}
            fuso={fuso}
            temToken={temToken}
            ocupado={ocupado}
            aviso={aviso}
            onEnviar={() => {
              enviar(false)
            }}
            onDesconectar={() => {
              setDialogo('desconectar')
            }}
          />
        ) : (
          <div className="grid gap-3">
            <p className="text-sm">
              Ao conectar, o Google pede para você escolher a conta e autorizar o app. O app só tem
              acesso à pasta e aos arquivos que ele mesmo criar no seu Drive.
            </p>
            <div>
              <Button disabled={ocupado} onClick={conectar}>
                <CloudIcon aria-hidden="true" />
                {ocupado ? 'Conectando…' : 'Conectar ao Google Drive'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={dialogo === 'confirmarEnvio'}
        onOpenChange={(aberto) => {
          if (!aberto) setDialogo('nenhum')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar mesmo com menos registros?</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados deste navegador têm menos registros que o último backup no Google Drive. Se
              você enviar, o backup de hoje no Drive será substituído por estes dados. Os backups
              dos dias anteriores continuam na pasta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                enviar(true)
              }}
            >
              Enviar mesmo assim
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialogo === 'desconectar'}
        onOpenChange={(aberto) => {
          if (!aberto) setDialogo('nenhum')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar do Google Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              O app deixa de enviar backups e esquece a conta conectada neste navegador.{' '}
              {TEXTO_NADA_APAGADO}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={desconectar}>
              Desconectar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

interface PropsConectado {
  estado: EstadoNuvem
  fuso: string
  temToken: boolean
  ocupado: boolean
  aviso: string | null
  onEnviar: () => void
  onDesconectar: () => void
}

function TextoSituacao({ estado, temToken }: { estado: EstadoNuvem; temToken: boolean }) {
  if (estado.situacao === 'ok') return <>Em dia.</>
  if (estado.situacao === 'pendente') {
    return (
      <>
        Envio pendente.
        {!temToken &&
          ' Para enviar, clique em "Fazer backup agora" (o Google pode pedir para confirmar a conta).'}
      </>
    )
  }
  return <>{estado.mensagemErro ?? 'Erro no último envio.'}</>
}

function Conectado({
  estado,
  fuso,
  temToken,
  ocupado,
  aviso,
  onEnviar,
  onDesconectar,
}: PropsConectado) {
  const suspenso = estado.motivoErro === 'suspenso'
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Conta</dt>
        <dd className="break-all">{estado.email ?? 'Conta conectada (e-mail não informado)'}</dd>
        <dt className="text-muted-foreground">Último envio</dt>
        <dd>
          {estado.ultimoEnvioEm
            ? formatarDataHoraNoFuso(estado.ultimoEnvioEm, fuso)
            : 'nenhum envio ainda'}
        </dd>
        <dt className="text-muted-foreground">Situação</dt>
        <dd
          data-testid="situacao-nuvem"
          className={estado.situacao === 'erro' ? 'text-destructive font-medium' : undefined}
        >
          <TextoSituacao estado={estado} temToken={temToken} />
        </dd>
      </dl>
      {/*
        Uma instância só do RestaurarDoDrive, sempre na mesma posição: a
        restauração limpa a suspensão, e trocar o componente de lugar o
        desmontaria junto com o diálogo "Backup restaurado".
      */}
      <div className="grid gap-2">
        {suspenso && (
          <p role="alert" className="text-sm">
            {TEXTO_SUGESTAO_RESTAURAR}
          </p>
        )}
        <RestaurarDoDrive fuso={fuso} />
      </div>
      {aviso && (
        <p role="status" className="text-sm">
          {aviso}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={onEnviar}>
          <CloudUploadIcon aria-hidden="true" />
          {ocupado ? 'Enviando…' : 'Fazer backup agora'}
        </Button>
        <Button variant="outline" disabled={ocupado} onClick={onDesconectar}>
          <LogOutIcon aria-hidden="true" />
          Desconectar
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">{TEXTO_NADA_APAGADO}</p>
    </div>
  )
}
