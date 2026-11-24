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
import { type DestinoBackupNuvem, ErroNuvem } from './destino'

export const NOME_LOCK_NUVEM = 'study-manager:nuvem'

export const MENSAGENS_NUVEM = {
  falhaEnvio:
    'Não foi possível enviar o backup para o Google Drive. O app tentará de novo no próximo envio.',
  falhaGeracao: 'O backup não foi enviado porque não foi possível ler os dados deste navegador.',
  autorizacaoRecusada:
    'A conexão com o Google Drive não foi concluída: a janela do Google foi fechada, bloqueada pelo navegador ou não respondeu. Tente de novo e, se preciso, permita janelas pop-up para este site.',
  falhaConexao:
    'Não foi possível conectar ao Google Drive. Verifique a conexão com a internet e tente de novo.',
} as const

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

const comLockPadrao: ComLock = (funcao) =>
  typeof navigator !== 'undefined' && 'locks' in navigator
    ? navigator.locks.request(NOME_LOCK_NUVEM, funcao)
    : funcao()

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

  const pararDeObservar = observarEstado((novo) => {
    atualizar(novo)
    marcarPronto()
  })
  const pararToken = destino.aoMudarToken(() => {
    if (destino.temToken()) aoPoderEnviar()
  })
  const pararConexao = conexao.aoVoltar(aoPoderEnviar)

  return {
    pronto,
    estado: () => estado,
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
            await gravarGatilho()
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
          await gravarGatilho()
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

/**
 * Executa uma ação local que dispara backup (RN42, RN43). Chamar de forma
 * síncrona no clique. A ação roda sempre e o resultado dela é devolvido sem
 * esperar o Google; o envio só é agendado se a ação der certo.
 */
export async function executarComBackup<T>(
  orquestrador: OrquestradorNuvem | null,
  acao: () => Promise<T>,
): Promise<T> {
  orquestrador?.prepararNoClique()
  const resultado = await acao()
  orquestrador?.gatilho()
  return resultado
}
