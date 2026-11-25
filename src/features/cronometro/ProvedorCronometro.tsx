import { useLiveQuery } from 'dexie-react-hooks'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { obterConfiguracoes } from '@/db/configuracoesRepositorio'
import { mensagemDeErro } from '@/db/erros'
import { buscarMateria } from '@/db/materiasRepositorio'
import { buscarObjetivo } from '@/db/objetivosRepositorio'
import {
  aplicarEvento,
  confirmarSessao,
  iniciarSessao,
  obterSessao,
  type EventoSessao,
} from '@/db/sessaoRepositorio'
import {
  decidirAoAssumir,
  INTERVALO_HEARTBEAT_MS,
  INTERVALO_TICK_MS,
  tempoContadoMs,
  transicionar,
  type ResultadoTransicao,
} from '@/domain/cronometro'
import { useComBackup } from '@/features/nuvem/useComBackup'
import { FUSO_PADRAO } from '@/lib/fuso'
import { gravarUltimaDuracao } from '@/lib/preferencias'
import { SOM_PADRAO } from '@/lib/sons'
import { ContextoCronometro, type CausaPausa, type ValorCronometro } from './contextoCronometro'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { DialogoRecuperacao } from './DialogoRecuperacao'
import { destravarAudio, notificar, tocarSom } from './motor/alertas'
import { criarFonteTicks, type FonteTicks } from './motor/fonteTicks'
import { liderancaPadrao, type Lideranca } from './motor/lideranca'
import { atalhoEspacoPermitido } from './motor/teclado'

interface Props {
  children: ReactNode
  /** Injetável para testes (padrão: worker). */
  fonteTicks?: FonteTicks
  /** Injetável para testes (padrão: `navigator.locks`). */
  lideranca?: Lideranca
}

function abaFoiDescartada(): boolean {
  return (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true
}

/**
 * Motor do cronômetro, válido em todas as telas: ticks, heartbeat (RN18),
 * suspensão (RN19), recuperação (RN20), alertas (RN25), saída da página (RN23)
 * e atalho de teclado (RN26). Também abre os modais de confirmação e recuperação.
 */
export function ProvedorCronometro({ children, fonteTicks, lideranca }: Props) {
  const fonte = useMemo(() => fonteTicks ?? criarFonteTicks(), [fonteTicks])
  const gestor = lideranca ?? liderancaPadrao()
  const papel = useSyncExternalStore(gestor.assinar, gestor.obter)

  const sessao = useLiveQuery(obterSessao)
  const configuracoes = useLiveQuery(obterConfiguracoes)
  const materiaId = sessao?.materiaId
  const materia = useLiveQuery(
    () => (materiaId ? buscarMateria(materiaId) : undefined),
    [materiaId],
  )
  const objetivoId = materia?.objetivoId
  const objetivo = useLiveQuery(
    () => (objetivoId ? buscarObjetivo(objetivoId) : undefined),
    [objetivoId],
  )

  const [agora, setAgora] = useState(() => new Date())
  /** `inicioEm` da sessão cujo modal de recuperação está aberto. */
  const [recuperando, setRecuperando] = useState<string | null>(null)
  const [causaPausa, setCausaPausa] = useState<CausaPausa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /** A aba já decidiu o que fazer ao virar líder (abertura × sucessão). */
  const [pronta, setPronta] = useState(false)

  const ehLider = papel.papel === 'lider'

  // Valores mais recentes para os callbacks de timers e eventos do navegador.
  const sessaoRef = useRef(sessao)
  const configuracoesRef = useRef(configuracoes)
  const materiaRef = useRef(materia)
  const ativoRef = useRef(false)
  const ocupadoRef = useRef(false)
  const retomouRef = useRef(false)
  const assumidoRef = useRef(false)
  useEffect(() => {
    sessaoRef.current = sessao
    configuracoesRef.current = configuracoes
    materiaRef.current = materia
    ativoRef.current = ehLider && pronta
  })

  const processarEfeitos = useCallback((resultado: ResultadoTransicao) => {
    if (resultado.efeitos.includes('pausaAutomatica')) {
      setCausaPausa(retomouRef.current ? 'congelamento' : null)
    }
    if (resultado.efeitos.includes('alertaFim')) {
      // O destaque visual vem do estado; notificação e som não podem travá-lo.
      const config = configuracoesRef.current
      const codigo = materiaRef.current?.codigo ?? 'Sessão'
      const minutos = resultado.sessao?.duracaoPlanejadaMin ?? 0
      notificar(
        config?.notificacoesAtivas ?? false,
        'Tempo de estudo concluído',
        `${codigo}: ${minutos} min. Confirme para registrar.`,
      )
      void tocarSom({
        somAtivo: config?.somAtivo ?? true,
        somId: config?.somId ?? SOM_PADRAO,
        volume: config?.volume ?? 0.7,
      })
    }
  }, [])

  /** Verificação da líder: suspensão, fim do tempo e heartbeat (RN18, RN19, RN15). */
  const verificar = useCallback(
    async (instante: Date) => {
      if (!ativoRef.current || ocupadoRef.current) return
      const atual = sessaoRef.current
      if (atual?.estado !== 'em_andamento') return
      const precisaHeartbeat =
        instante.getTime() - Date.parse(atual.ultimoHeartbeatEm) >= INTERVALO_HEARTBEAT_MS
      const precisaTick = transicionar(atual, { tipo: 'tick' }, instante).alterada
      if (!precisaHeartbeat && !precisaTick) return
      ocupadoRef.current = true
      try {
        // O heartbeat passa antes pela mesma verificação do tick.
        processarEfeitos(
          await aplicarEvento({ tipo: precisaHeartbeat ? 'heartbeat' : 'tick' }, instante),
        )
      } catch (e) {
        if (import.meta.env.DEV) console.error('Falha ao atualizar a sessão', e)
      } finally {
        ocupadoRef.current = false
      }
    },
    [processarEfeitos],
  )

  // Ticks: todas as abas atualizam a tela; só a líder verifica e grava.
  useEffect(
    () =>
      fonte.iniciar(() => {
        const instante = new Date()
        setAgora(instante)
        void verificar(instante)
      }, INTERVALO_TICK_MS),
    [fonte, verificar],
  )

  // Ao virar líder: abertura → recuperação (RN20); sucessão → segue normalmente.
  useEffect(() => {
    if (papel.papel !== 'lider' || assumidoRef.current) return
    assumidoRef.current = true
    const modo = papel.modo
    void (async () => {
      try {
        const encontrada = await obterSessao()
        const decisao = decidirAoAssumir(modo, encontrada)
        if (decisao.evento?.tipo === 'recuperar') {
          processarEfeitos(await aplicarEvento(decisao.evento))
        }
        if (decisao.abrirRecuperacao) {
          if (abaFoiDescartada()) setCausaPausa('descarte')
          setRecuperando(encontrada?.inicioEm ?? null)
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error('Falha ao recuperar a sessão', e)
      } finally {
        setPronta(true)
      }
    })()
  }, [papel, processarEfeitos])

  // Aba visível de novo ou descongelada pelo navegador: verifica na hora (RN19).
  useEffect(() => {
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') void verificar(new Date())
    }
    const aoRetomar = () => {
      retomouRef.current = true
      void verificar(new Date()).finally(() => {
        retomouRef.current = false
      })
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    document.addEventListener('resume', aoRetomar)
    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      document.removeEventListener('resume', aoRetomar)
    }
  }, [verificar])

  const temSessao = Boolean(sessao)
  // RN23: confirma a saída enquanto houver sessão.
  useEffect(() => {
    if (!temSessao) return
    const aoSair = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
    }
    window.addEventListener('beforeunload', aoSair)
    return () => {
      window.removeEventListener('beforeunload', aoSair)
    }
  }, [temSessao])

  const executarEvento = useCallback(
    async (evento: EventoSessao): Promise<boolean> => {
      setErro(null)
      try {
        processarEfeitos(await aplicarEvento(evento))
        return true
      } catch (e) {
        setErro(mensagemDeErro(e))
        return false
      }
    },
    [processarEfeitos],
  )

  // RN26: Espaço pausa e continua, fora de campos e diálogos.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (!atalhoEspacoPermitido(evento)) return
      const estado = sessaoRef.current?.estado
      if (estado === 'em_andamento') {
        evento.preventDefault()
        void executarEvento({ tipo: 'pausar' })
      } else if (estado === 'pausado') {
        evento.preventDefault()
        void executarEvento({ tipo: 'continuar' })
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
    }
  }, [executarEvento])

  const comBackup = useComBackup()

  const valor = useMemo<ValorCronometro>(() => {
    const executar = async (acao: () => Promise<unknown>) => {
      setErro(null)
      try {
        await acao()
        return true
      } catch (e) {
        setErro(mensagemDeErro(e))
        return false
      }
    }
    return {
      sessao,
      materia,
      objetivo,
      agora,
      tempoMs: sessao ? tempoContadoMs(sessao, agora) : 0,
      causaPausa: sessao?.motivoPausaAutomatica ? causaPausa : null,
      fuso: configuracoes?.fusoHorario ?? FUSO_PADRAO,
      erro,
      limparErro: () => {
        setErro(null)
      },
      iniciar: (id, duracaoMin) => {
        // Ainda dentro do clique: libera o autoplay do alerta de fim.
        destravarAudio(configuracoes?.somId ?? SOM_PADRAO)
        return executar(async () => {
          await iniciarSessao(id, duracaoMin)
          gravarUltimaDuracao(duracaoMin)
          setAgora(new Date())
        })
      },
      pausar: () => executarEvento({ tipo: 'pausar' }),
      continuar: () => executarEvento({ tipo: 'continuar' }),
      encerrar: () => executarEvento({ tipo: 'encerrar' }),
      descartar: () => executarEvento({ tipo: 'descartar' }),
      contarIntervalo: () => executarEvento({ tipo: 'contarIntervalo' }),
      encerrarRecuperada: () => executarEvento({ tipo: 'encerrarRecuperada' }),
      confirmar: () => {
        // Síncrono no clique: o pedido de token ao Google sai antes de qualquer
        // await (RN41). A confirmação nunca espera o Google (RN42).
        const confirmacao = comBackup(() => confirmarSessao())
        return executar(() => confirmacao)
      },
    }
  }, [sessao, materia, objetivo, agora, causaPausa, erro, configuracoes, executarEvento, comBackup])

  const estado = sessao?.estado

  return (
    <ContextoCronometro.Provider value={valor}>
      {children}
      {estado === 'aguardando_confirmacao' && <DialogoConfirmacao />}
      {recuperando !== null && estado === 'pausado' && sessao?.inicioEm === recuperando && (
        <DialogoRecuperacao
          onFechar={() => {
            setRecuperando(null)
          }}
        />
      )}
    </ContextoCronometro.Provider>
  )
}
