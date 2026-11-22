import { useState } from 'react'
import { AvisoErro } from '@/components/AvisoErro'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { podeGravar, ROTULOS_ENCERRAMENTO } from '@/domain/cronometro'
import { dataNoFuso, formatarDataCurta, formatarHoraNoFuso, formatarMinutos } from '@/domain/tempo'
import { ConfirmarDescarte } from './ConfirmarDescarte'
import { useCronometro } from './useCronometro'

/**
 * Confirmação da sessão (RN21). Abre sozinha em qualquer tela e só sai por
 * Confirmar ou Cancelar: Esc e clique fora não a fecham.
 */
export function DialogoConfirmacao() {
  const { sessao, materia, objetivo, fuso, erro, limparErro, confirmar, descartar } =
    useCronometro()
  const [salvando, setSalvando] = useState(false)
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)

  if (sessao?.estado !== 'aguardando_confirmacao') return null

  const gravavel = podeGravar(sessao)
  const segundos = Math.floor(Number(sessao.acumuladoSeg.toPrecision(12)))
  const linhas: [string, string][] = [
    ['Matéria', materia?.nome ?? '—'],
    ['Código', materia?.codigo ?? '—'],
    ['Objetivo', objetivo?.nome ?? '—'],
    ['Data', formatarDataCurta(dataNoFuso(new Date(sessao.inicioEm), fuso))],
    ['Início', formatarHoraNoFuso(sessao.inicioEm, fuso)],
    ['Término', sessao.fimEm ? formatarHoraNoFuso(sessao.fimEm, fuso) : '—'],
    ['Tempo estudado', `${formatarMinutos(segundos)} min`],
    ['Tempo planejado', `${sessao.duracaoPlanejadaMin} min`],
    ['Encerramento', sessao.tipoEncerramento ? ROTULOS_ENCERRAMENTO[sessao.tipoEncerramento] : '—'],
  ]

  const aoConfirmar = async () => {
    if (salvando) return
    setSalvando(true)
    try {
      await confirmar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <AlertDialog open>
        <AlertDialogContent
          onEscapeKeyDown={(evento) => {
            evento.preventDefault()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sessao.tipoEncerramento === 'concluido' ? 'Tempo concluído!' : 'Revisar sessão'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {gravavel
                ? 'Confira os dados. O estudo só é registrado ao confirmar.'
                : 'Sessões com menos de 1 minuto não podem ser registradas.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {erro && <AvisoErro mensagem={erro} onFechar={limparErro} />}

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            {linhas.map(([rotulo, valor]) => (
              <div key={rotulo} className="contents">
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className="font-medium tabular-nums">{valor}</dd>
              </div>
            ))}
          </dl>

          <AlertDialogFooter>
            {gravavel ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmandoDescarte(true)
                  }}
                >
                  Cancelar
                </Button>
                <Button disabled={salvando} onClick={() => void aoConfirmar()}>
                  Confirmar
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => void descartar()}>
                Descartar
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </>
  )
}
