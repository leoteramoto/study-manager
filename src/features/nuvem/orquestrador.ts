// Orquestrador do backup no Google Drive (RN41–RN46). Decide quando enviar e
// grava o estado no banco da nuvem; as regras ficam em `domain/backupNuvem` e
// o acesso ao Google fica atrás de `DestinoBackupNuvem`.
//
// Regra principal (RN42): a ação local nunca espera o Google. Os cliques só
// *disparam* o pedido de token (de forma síncrona, por causa do bloqueio de
// popup) e o gatilho; nenhuma falha daqui chega à ação local.
import { liveQuery } from 'dexie'
import type { BackupGerado } from '@/db/backupRepositorio'
import { ErroNegocio } from '@/db/erros'
import { MENSAGENS_BACKUP } from '@/domain/backup'
import {
  obterEstadoNuvem,
  registrarConexaoNuvem,
  registrarDesconexaoNuvem,
  registrarEnvioNuvem,
  registrarFalhaNuvem,
  registrarGatilhoNuvem,
  registrarSuspensaoNuvem,
} from '@/db/nuvemRepositorio'
import {
  appPropertiesDoBackup,
  backupDoDia,
  type BackupNuvem,
  backupsParaLixeira,
  DIAS_RETENCAO_NUVEM,
  diaDoBackupNuvem,
  envioSuspenso,
  ESPERA_AGRUPAMENTO_MS,
  type EstadoNuvem,
  estadoInicialNuvem,
  nomeArquivoNuvem,
  referenciaDoDrive,
} from '@/domain/backupNuvem'
import { type DestinoBackupNuvem, ErroArquivoGrande, ErroNuvem } from './destino'

export const NOME_LOCK_NUVEM = 'study-manager:nuvem'

/** Esperas de 1 ms pelo relógio passar do milissegundo do próprio gatilho. */
export const MAXIMO_ESPERAS_RELOGIO = 20

export const MENSAGENS_NUVEM = {
  falhaEnvio:
    'Não foi possível enviar o backup para o Google Drive. O app tentará de novo no próximo envio.',
  falhaGeracao: 'O backup não foi enviado porque não foi possível ler os dados deste navegador.',
  autorizacaoRecusada:
    'A conexão com o Google Drive não foi concluída: a janela do Google foi fechada, bloqueada pelo navegador ou não respondeu. Tente de novo e, se preciso, permita janelas pop-up para este site.',
  falhaConexao:
    'Não foi possível conectar ao Google Drive. Verifique a conexão com a internet e tente de novo.',
  restauracaoSemAutorizacao:
    'Não foi possível acessar o Google Drive sem a autorização do Google: a janela foi fechada, bloqueada pelo navegador ou não respondeu. Tente de novo e, se preciso, permita janelas pop-up para este site.',
  restauracaoOffline:
    'Sem conexão com a internet. Verifique a conexão e tente de novo. Nenhum dado foi alterado.',
  falhaLista: 'Não foi possível listar os backups do Google Drive. Tente de novo.',
  falhaDownload:
    'Não foi possível baixar o backup do Google Drive. Tente de novo. Nenhum dado foi alterado.',
} as const

/** Erro do destino na restauração, em mensagem amigável (RN47, RN51). */
function erroDeRestauracao(erro: unknown, mensagemFalha: string): ErroNegocio {
  if (erro instanceof ErroArquivoGrande) return new ErroNegocio(MENSAGENS_BACKUP.grande)
  if (erro instanceof ErroNuvem && erro.tipo === 'semAutorizacao') {
    return new ErroNegocio(MENSAGENS_NUVEM.restauracaoSemAutorizacao)
  }
  if (erro instanceof ErroNuvem && erro.tipo === 'offline') {
    return new ErroNegocio(MENSAGENS_NUVEM.restauracaoOffline)
  }
  return new ErroNegocio(mensagemFalha)
}

/**
 * - `enviado`: o arquivo do dia foi gravado no Drive.
 * - `ignorado`: nada a enviar (já estava em dia, ou desconectado).
 * - `pendente`: sem token ou sem internet; fica para depois.
 * - `suspenso`: envio automático suspenso pelo RN45.
 * - `precisaConfirmar`: "Fazer backup agora" com menos registros (RN45).
 * - `erro`: falha registrada no estado, com mensagem.
 */
export type ResultadoEnvio =
  'enviado' | 'ignorado' | 'pendente' | 'suspenso' | 'precisaConfirmar' | 'erro'

export type ResultadoConexao = { ok: true; envio: ResultadoEnvio } | { ok: false; erro: string }

export interface Temporizador {
  /** Agenda `funcao` e devolve a função que cancela. */
  definir(funcao: () => void, ms: number): () => void
}

export interface MonitorConexao {
  online(): boolean
  /** Chama `funcao` quando a conexão volta. Devolve a função que para de ouvir. */
  aoVoltar(funcao: () => void): () => void
}

export type ComLock = <T>(funcao: () => Promise<T>) => Promise<T>

export interface DependenciasOrquestrador {
  destino: DestinoBackupNuvem
  /** O mesmo `gerarBackup` da exportação, com resumo e fuso (RN44). */
  gerarBackup: (agora: Date) => Promise<BackupGerado>
  agora?: () => Date
  temporizador?: Temporizador
  conexao?: MonitorConexao
  /** Exclusão mútua entre abas (Web Lock). */
  comLock?: ComLock
  /** Observa o estado gravado (inclusive mudanças de outras abas). */
  observarEstado?: (ouvinte: (estado: EstadoNuvem) => void) => () => void
  /** Erros técnicos, só para o console de desenvolvimento. */
  registrarErro?: (contexto: string, erro: unknown) => void
}

export interface OrquestradorNuvem {
  /** Resolve quando o estado gravado foi lido pela primeira vez. */
  readonly pronto: Promise<void>
  estado(): EstadoNuvem
  /** A seção Google Drive foi exibida: prepara a autorização para o clique. */
  preparar(): void
  temToken(): boolean
  aoMudarToken(ouvinte: () => void): () => void
  /**
   * Chamar de forma síncrona no clique de uma ação que dispara envio: pede o
   * token, se faltar, enquanto o navegador ainda permite o popup. Não espera nada.
   */
  prepararNoClique(): void
  /** Depois que a ação local terminou: grava "pendente" e agenda o envio. Nunca lança. */
  gatilho(): void
  /** "Conectar" (chamar de forma síncrona no clique). */
  conectar(): Promise<ResultadoConexao>
  /** "Desconectar": revoga o token e limpa o estado local. Nada é apagado no Drive. */
  desconectar(): Promise<void>
  /** "Fazer backup agora" (chamar de forma síncrona no clique). */
  enviarAgora(opcoes?: { confirmado?: boolean }): Promise<ResultadoEnvio>
  /** Indicador "Reconectar Google Drive" (chamar de forma síncrona no clique). */
  reconectar(): Promise<ResultadoEnvio>
  /**
   * Backups do Drive para restaurar (RN47), do mais recente para o mais antigo.
   * Chamar de forma síncrona no clique (pede o token). Falha: `ErroNegocio`
   * com mensagem amigável.
   */
  listarBackupsParaRestaurar(): Promise<BackupNuvem[]>
  /**
   * Texto do backup escolhido, com o tamanho conferido antes e depois (RN47).
   * Chamar de forma síncrona no clique. Falha: `ErroNegocio` amigável. Não
   * valida o conteúdo: isso é do fluxo da restauração.
   */
  baixarBackupParaRestaurar(id: string): Promise<string>
  /** Espera as tarefas em andamento (testes e encerramento). */
  concluirPendentes(): Promise<void>
  encerrar(): void
}

const temporizadorPadrao: Temporizador = {
  definir(funcao, ms) {
    const id = setTimeout(funcao, ms)
    return () => {
      clearTimeout(id)
    }
  },
}

const conexaoPadrao: MonitorConexao = {
  online: () => typeof navigator === 'undefined' || navigator.onLine,
  aoVoltar(funcao) {
    window.addEventListener('online', funcao)
    return () => {
      window.removeEventListener('online', funcao)
    }
  },
}

/** Fila da própria aba, para navegadores sem Web Locks (e o jsdom). */
let filaLocal: Promise<unknown> = Promise.resolve()

function comFilaLocal<T>(funcao: () => Promise<T>): Promise<T> {
  const resultado = filaLocal.then(funcao)
  filaLocal = resultado.catch(() => undefined)
  return resultado
}

const comLockPadrao: ComLock = (funcao) =>
  typeof navigator !== 'undefined' && 'locks' in navigator
    ? navigator.locks.request(NOME_LOCK_NUVEM, funcao)
    : comFilaLocal(funcao)

function observarEstadoPadrao(ouvinte: (estado: EstadoNuvem) => void): () => void {
  const assinatura = liveQuery(() => obterEstadoNuvem()).subscribe({ next: ouvinte })
  return () => {
    assinatura.unsubscribe()
  }
}

function registrarErroPadrao(contexto: string, erro: unknown): void {
  // Só a mensagem do erro, nunca token ou conteúdo (os erros daqui não os contêm).
  if (import.meta.env.DEV) console.error(`Backup na nuvem (${contexto})`, erro)
}

type ModoEnvio = 'automatico' | 'manual'

export function criarOrquestradorNuvem(dependencias: DependenciasOrquestrador): OrquestradorNuvem {
  const {
    destino,
    gerarBackup,
    agora = () => new Date(),
    temporizador = temporizadorPadrao,
    conexao = conexaoPadrao,
    comLock = comLockPadrao,
    observarEstado = observarEstadoPadrao,
    registrarErro = registrarErroPadrao,
  } = dependencias

  let estado = estadoInicialNuvem()
  let cancelarEspera: (() => void) | null = null
  const tarefas = new Set<Promise<unknown>>()

  let marcarPronto: () => void = () => undefined
  const pronto = new Promise<void>((resolver) => {
    marcarPronto = resolver
  })

  function atualizar(novo: EstadoNuvem): void {
    estado = novo
  }

  /** Registra a tarefa para `concluirPendentes` e nunca deixa rejeição solta. */
  function acompanhar<T>(tarefa: Promise<T>): Promise<T> {
    tarefas.add(tarefa)
    const remover = () => {
      tarefas.delete(tarefa)
    }
    tarefa.then(remover, remover)
    return tarefa
  }

  function pedirToken(escolherConta: boolean): Promise<boolean> | null {
    if (destino.temToken()) return null
    // Chamada síncrona: o popup só é permitido logo depois do clique. Não é
    // acompanhada: o tempo limite (RN41) é do destino, e o token que chegar
    // depois é aproveitado por `aoMudarToken`.
    return destino.autorizar({ dicaEmail: estado.email, escolherConta }).catch(() => false)
  }

  function cancelarAgendamento(): void {
    cancelarEspera?.()
    cancelarEspera = null
  }

  function agendar(): void {
    cancelarAgendamento()
    cancelarEspera = temporizador.definir(() => {
      cancelarEspera = null
      void acompanhar(enviar('automatico'))
    }, ESPERA_AGRUPAMENTO_MS)
  }

  async function tratarErro(erro: unknown): Promise<ResultadoEnvio> {
    registrarErro('envio', erro)
    if (erro instanceof ErroNuvem && erro.tipo !== 'falha') return 'pendente'
    try {
      atualizar(await registrarFalhaNuvem(MENSAGENS_NUVEM.falhaEnvio))
    } catch (erroGravacao) {
      registrarErro('estado', erroGravacao)
    }
    return 'erro'
  }

  async function moverAntigosParaLixeira(backups: BackupNuvem[], dia: string): Promise<void> {
    for (const backup of backupsParaLixeira(backups, DIAS_RETENCAO_NUVEM, dia)) {
      try {
        await destino.moverParaLixeira(backup.id)
      } catch (erro) {
        // A limpeza não afeta o envio: tenta de novo no próximo.
        registrarErro('lixeira', erro)
      }
    }
  }

  async function enviarComLock(modo: ModoEnvio, confirmado: boolean): Promise<ResultadoEnvio> {
    const atual = await obterEstadoNuvem()
    atualizar(atual)
    if (!atual.conectado) return 'ignorado'
    // Outra aba pode já ter enviado os mesmos dados.
    if (modo === 'automatico' && atual.situacao === 'ok') return 'ignorado'

    const iniciadoEm = agora()
    let gerado: BackupGerado
    try {
      gerado = await gerarBackup(iniciadoEm)
    } catch (erro) {
      registrarErro('geracao', erro)
      const mensagem = erro instanceof ErroNegocio ? erro.message : MENSAGENS_NUVEM.falhaGeracao
      atualizar(await registrarFalhaNuvem(mensagem))
      return 'erro'
    }

    if (envioSuspenso(gerado.resumo.registros, atual.registrosUltimoEnvio)) {
      if (modo === 'automatico') {
        atualizar(await registrarSuspensaoNuvem())
        return 'suspenso'
      }
      if (!confirmado) {
        atualizar(await registrarSuspensaoNuvem())
        return 'precisaConfirmar'
      }
    }

    const pastaId = await destino.garantirPasta(atual.pastaId)
    const backups = await destino.listarBackups(pastaId)
    const dia = diaDoBackupNuvem(iniciadoEm, gerado.fuso)
    await destino.gravarBackup({
      pastaId,
      nome: nomeArquivoNuvem(dia),
      conteudo: gerado.arquivo.conteudo,
      appProperties: appPropertiesDoBackup(dia, gerado.resumo),
      idExistente: backupDoDia(backups, dia)?.id ?? null,
    })
    const novo = await registrarEnvioNuvem({
      iniciadoEm,
      concluidoEm: agora(),
      totalRegistros: gerado.resumo.registros,
      pastaId,
    })
    atualizar(novo)
    await moverAntigosParaLixeira(backups, dia)
    // Houve gatilho durante o envio: os dados mudaram, então envia de novo.
    if (novo.situacao === 'pendente') agendar()
    return 'enviado'
  }

  async function enviar(modo: ModoEnvio, confirmado = false): Promise<ResultadoEnvio> {
    try {
      if (!conexao.online()) return 'pendente'
      if (!destino.temToken()) return 'pendente'
      return await comLock(() => enviarComLock(modo, confirmado))
    } catch (erro) {
      return tratarErro(erro)
    }
  }

  /**
   * Token novo ou conexão de volta: envia o que ficou pendente. Não decide pelo
   * estado em memória (uma emissão atrasada do `liveQuery` pode estar velha):
   * `enviarComLock` relê o banco e não envia nada se estiver em dia.
   */
  function aoPoderEnviar(): void {
    if (cancelarEspera) return
    void acompanhar(enviar('automatico'))
  }

  async function gravarGatilho(): Promise<void> {
    atualizar(await registrarGatilhoNuvem(agora()))
  }

  /**
   * Gatilho seguido de envio na hora ("Conectar", "Fazer backup agora"). O
   * envio só começa depois que o relógio passa do milissegundo do gatilho:
   * no mesmo milissegundo, `aoEnviar` trataria o próprio gatilho como
   * posterior ao início (dados talvez desatualizados), deixaria "pendente" e
   * agendaria um segundo envio sem necessidade. A espera é limitada: com o
   * relógio parado (por exemplo, `Date` falso), o envio segue assim mesmo.
   */
  async function gravarGatilhoAntesDeEnviar(): Promise<void> {
    await gravarGatilho()
    const gatilho = estado.ultimoGatilhoEm === null ? null : Date.parse(estado.ultimoGatilhoEm)
    if (gatilho === null) return
    for (
      let tentativa = 0;
      tentativa < MAXIMO_ESPERAS_RELOGIO && agora().getTime() <= gatilho;
      tentativa++
    ) {
      await new Promise((resolver) => setTimeout(resolver, 1))
    }
  }

  const pararDeObservar = observarEstado((novo) => {
    atualizar(novo)
    // Conectado: o script do Google já fica pronto para o próximo clique.
    if (novo.conectado) destino.preparar()
    marcarPronto()
  })
  const pararToken = destino.aoMudarToken(() => {
    if (destino.temToken()) aoPoderEnviar()
  })
  const pararConexao = conexao.aoVoltar(aoPoderEnviar)

  return {
    pronto,
    estado: () => estado,
    preparar: () => {
      destino.preparar()
    },
    temToken: () => destino.temToken(),
    aoMudarToken: (ouvinte) => destino.aoMudarToken(ouvinte),

    prepararNoClique() {
      if (estado.conectado) void pedirToken(false)
    },

    gatilho() {
      void acompanhar(
        (async () => {
          // "Pendente" é gravado na hora do gatilho, não depois da espera. A
          // decisão vem do banco (desconectado, nada é gravado nem agendado).
          await gravarGatilho()
          if (estado.conectado) agendar()
        })().catch((erro: unknown) => {
          registrarErro('gatilho', erro)
        }),
      )
    },

    conectar() {
      // Síncrono no clique: o popup só é permitido aqui.
      const autorizacao = destino
        .autorizar({ dicaEmail: null, escolherConta: true })
        .catch(() => false)
      return acompanhar(
        (async (): Promise<ResultadoConexao> => {
          if (!(await autorizacao)) return { ok: false, erro: MENSAGENS_NUVEM.autorizacaoRecusada }
          try {
            const anterior = await obterEstadoNuvem()
            const email = await destino.obterEmail()
            const pastaId = await destino.garantirPasta(anterior.pastaId)
            // A referência do Drive só vale sem referência local (RN45).
            const referenciaDrive =
              anterior.registrosUltimoEnvio === null
                ? referenciaDoDrive(await destino.listarBackups(pastaId))
                : null
            atualizar(await registrarConexaoNuvem({ email, pastaId, referenciaDrive }))
            // "Conectar" é gatilho imediato, sem a espera de 5 s (RN43).
            await gravarGatilhoAntesDeEnviar()
          } catch (erro) {
            registrarErro('conexao', erro)
            return { ok: false, erro: MENSAGENS_NUVEM.falhaConexao }
          }
          return { ok: true, envio: await enviar('automatico') }
        })(),
      )
    },

    async desconectar() {
      cancelarAgendamento()
      try {
        await destino.revogar()
      } catch (erro) {
        registrarErro('revogacao', erro)
      }
      atualizar(await registrarDesconexaoNuvem())
    },

    enviarAgora({ confirmado = false } = {}) {
      const autorizacao = pedirToken(false)
      return acompanhar(
        (async (): Promise<ResultadoEnvio> => {
          cancelarAgendamento()
          await gravarGatilhoAntesDeEnviar()
          if (autorizacao && !(await autorizacao)) return 'pendente'
          return enviar('manual', confirmado)
        })(),
      )
    },

    reconectar() {
      const autorizacao = pedirToken(false)
      return acompanhar(
        (async (): Promise<ResultadoEnvio> => {
          if (autorizacao && !(await autorizacao)) return 'pendente'
          return enviar('automatico')
        })(),
      )
    },

    listarBackupsParaRestaurar() {
      const autorizacao = pedirToken(false) // síncrono no clique (popup)
      return (async () => {
        if (autorizacao && !(await autorizacao)) {
          throw new ErroNegocio(MENSAGENS_NUVEM.restauracaoSemAutorizacao)
        }
        try {
          const atual = await obterEstadoNuvem()
          const pastaId = await destino.garantirPasta(atual.pastaId)
          return await destino.listarBackups(pastaId)
        } catch (erro) {
          registrarErro('lista', erro)
          throw erroDeRestauracao(erro, MENSAGENS_NUVEM.falhaLista)
        }
      })()
    },

    baixarBackupParaRestaurar(id) {
      const autorizacao = pedirToken(false) // síncrono no clique (popup)
      return (async () => {
        if (autorizacao && !(await autorizacao)) {
          throw new ErroNegocio(MENSAGENS_NUVEM.restauracaoSemAutorizacao)
        }
        try {
          return await destino.baixarBackup(id)
        } catch (erro) {
          registrarErro('download', erro)
          throw erroDeRestauracao(erro, MENSAGENS_NUVEM.falhaDownload)
        }
      })()
    },

    async concluirPendentes() {
      while (tarefas.size > 0) await Promise.allSettled([...tarefas])
    },

    encerrar() {
      cancelarAgendamento()
      pararDeObservar()
      pararToken()
      pararConexao()
    },
  }
}

export interface OpcoesComBackup {
  /**
   * O recurso existe neste build. Com ele ligado e o orquestrador ainda
   * carregando (import dinâmico), o gatilho não se perde: o "pendente" é
   * gravado direto no banco da nuvem.
   */
  disponivel?: boolean
  /** Gravação direta do gatilho (padrão: `registrarGatilhoNuvem`). */
  gravarGatilho?: () => Promise<unknown>
  registrarErro?: (contexto: string, erro: unknown) => void
}

/**
 * Executa uma ação local que dispara backup (RN42, RN43). **Chamar de forma
 * síncrona no handler do clique ou do submit**, antes de qualquer `await`: o
 * pedido de token sai aqui, enquanto o navegador ainda permite o popup.
 *
 * A ação roda sempre e o resultado (ou o erro) dela é devolvido sem esperar
 * o Google; nenhuma falha do Google chega a quem chamou. O gatilho só é
 * registrado se a ação der certo.
 */
export function executarComBackup<T>(
  orquestrador: OrquestradorNuvem | null,
  acao: () => Promise<T>,
  opcoes: OpcoesComBackup = {},
): Promise<T> {
  const {
    disponivel = false,
    gravarGatilho = () => registrarGatilhoNuvem(),
    registrarErro = registrarErroPadrao,
  } = opcoes
  try {
    orquestrador?.prepararNoClique()
  } catch (erro) {
    registrarErro('autorizacao', erro)
  }
  return (async () => {
    const resultado = await acao()
    if (orquestrador) {
      orquestrador.gatilho()
    } else if (disponivel) {
      // Orquestrador ainda carregando: só grava o "pendente" (sem mudança se desconectado).
      void gravarGatilho().catch((erro: unknown) => {
        registrarErro('gatilho', erro)
      })
    }
    return resultado
  })()
}
