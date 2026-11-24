import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { dbNuvem } from '@/db/bancoNuvem'
import { type BackupGerado, gerarBackupValidado } from '@/db/backupRepositorio'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { ErroNegocio } from '@/db/erros'
import { criarMateria } from '@/db/materiasRepositorio'
import { obterEstadoNuvem } from '@/db/nuvemRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { definirPlanejamento } from '@/db/planejamentoRepositorio'
import { lancarManual } from '@/db/registrosRepositorio'
import { aplicarEvento, confirmarSessao, iniciarSessao, obterSessao } from '@/db/sessaoRepositorio'
import {
  appPropertiesDoBackup,
  ESPERA_AGRUPAMENTO_MS,
  indicadorCabecalho,
  MENSAGEM_SUSPENSAO,
  nomeArquivoNuvem,
} from '@/domain/backupNuvem'
import { DestinoFalso } from './destinoFalso'
import {
  type ComLock,
  criarOrquestradorNuvem,
  type DependenciasOrquestrador,
  executarComBackup,
  MENSAGENS_NUVEM,
  type MonitorConexao,
  type OrquestradorNuvem,
  type Temporizador,
} from './orquestrador'

const FUSO = 'America/Sao_Paulo'
const INICIO = Date.parse('2026-11-23T15:00:00.000Z')

// ---------------------------------------------------------------------------
// Dublês: relógio, temporizador, conexão e lock controlados pelo teste
// ---------------------------------------------------------------------------

/** Relógio que anda 1 ms a cada leitura (instantes sempre distintos). */
let instante = INICIO
const agora = () => new Date(instante++)

interface Agendada {
  funcao: () => void
  quando: number
  ativa: boolean
}

/** Temporizador manual: nada dispara até `avancar`. */
function criarTemporizador() {
  let tempo = 0
  const agendadas: Agendada[] = []
  const temporizador: Temporizador = {
    definir(funcao, ms) {
      const tarefa = { funcao, quando: tempo + ms, ativa: true }
      agendadas.push(tarefa)
      return () => {
        tarefa.ativa = false
      }
    },
  }
  return {
    temporizador,
    avancar(ms: number) {
      tempo += ms
      instante += ms
      for (const tarefa of agendadas) {
        if (tarefa.ativa && tarefa.quando <= tempo) {
          tarefa.ativa = false
          tarefa.funcao()
        }
      }
    },
    ativas: () => agendadas.filter((t) => t.ativa).length,
  }
}

function criarConexao() {
  let online = true
  const ouvintes = new Set<() => void>()
  const conexao: MonitorConexao = {
    online: () => online,
    aoVoltar(funcao) {
      ouvintes.add(funcao)
      return () => ouvintes.delete(funcao)
    },
  }
  return {
    conexao,
    cair() {
      online = false
    },
    voltar() {
      online = true
      for (const ouvinte of ouvintes) ouvinte()
    },
  }
}

/** Lock compartilhado entre os orquestradores (como `navigator.locks` entre abas). */
function criarLock(): ComLock {
  let fila: Promise<unknown> = Promise.resolve()
  return <T>(funcao: () => Promise<T>) => {
    const resultado = fila.then(funcao)
    fila = resultado.catch(() => undefined)
    return resultado
  }
}

/** Promessa controlada pelo teste. */
function criarAtraso() {
  let liberar: () => void = () => undefined
  const promessa = new Promise<void>((resolver) => {
    liberar = resolver
  })
  return { promessa, liberar }
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

let totalLocal = 40
const gerarBackupFalso = vi.fn((momento: Date): Promise<BackupGerado> =>
  Promise.resolve({
    arquivo: {
      nome: 'x.json',
      conteudo: JSON.stringify({ registros: totalLocal }),
      exportadoEm: momento.toISOString(),
    },
    resumo: {
      exportadoEm: momento.toISOString(),
      objetivos: 1,
      materias: 2,
      registros: totalLocal,
      registrosExcluidos: 0,
    },
    fuso: FUSO,
  }),
)

let relogio: ReturnType<typeof criarTemporizador>
let rede: ReturnType<typeof criarConexao>
let lock: ComLock
const criados: OrquestradorNuvem[] = []

function montar(destino = new DestinoFalso(), extra: Partial<DependenciasOrquestrador> = {}) {
  const orquestrador = criarOrquestradorNuvem({
    destino,
    gerarBackup: gerarBackupFalso,
    agora,
    temporizador: relogio.temporizador,
    conexao: rede.conexao,
    comLock: lock,
    registrarErro: () => undefined,
    ...extra,
  })
  criados.push(orquestrador)
  return { destino, orquestrador }
}

/** Orquestrador já conectado (com o primeiro envio feito). */
async function montarConectado(destino = new DestinoFalso()) {
  const montado = montar(destino)
  await montado.orquestrador.pronto
  const resultado = await montado.orquestrador.conectar()
  expect(resultado).toEqual({ ok: true, envio: 'enviado' })
  await montado.orquestrador.concluirPendentes()
  return montado
}

/** Pasta e um backup antigo no Drive, antes de conectar. */
async function semearDrive(destino: DestinoFalso, dia: string, registros: string) {
  destino.definirToken(true)
  const pasta = await destino.garantirPasta(null)
  destino.semear(pasta, nomeArquivoNuvem(dia), {
    ...appPropertiesDoBackup(dia, {
      exportadoEm: `${dia}T12:00:00.000Z`,
      objetivos: 1,
      materias: 1,
      registros: 0,
      registrosExcluidos: 0,
    }),
    registros,
  })
  destino.definirToken(false)
  return pasta
}

beforeEach(async () => {
  instante = INICIO
  totalLocal = 40
  gerarBackupFalso.mockClear()
  relogio = criarTemporizador()
  rede = criarConexao()
  lock = criarLock()
  await dbNuvem.delete()
  await dbNuvem.open()
})

afterEach(async () => {
  for (const orquestrador of criados.splice(0)) {
    orquestrador.encerrar()
    await orquestrador.concluirPendentes()
  }
  dbNuvem.close()
})

// ---------------------------------------------------------------------------
// RN42: a ação local nunca espera o Google
// ---------------------------------------------------------------------------

describe('a ação local não espera o envio (RN42)', () => {
  it('sem token e popup sem resposta: a ação conclui e o backup fica pendente', async () => {
    const { destino, orquestrador } = await montarConectado()
    destino.definirToken(false) // token vencido
    destino.modoAutorizacao = 'pendente' // popup nunca responde
    const acao = vi.fn(() => Promise.resolve('gravado'))

    const promessa = executarComBackup(orquestrador, acao)
    // O token é pedido de forma síncrona, ainda dentro do clique.
    expect(destino.pedidosAutorizacao.at(-1)).toEqual({
      dicaEmail: 'pessoa@example.com',
      escolherConta: false,
    })

    await expect(promessa).resolves.toBe('gravado')
    expect(acao).toHaveBeenCalledOnce()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')
    expect(destino.gravacoes).toBe(1) // só o envio da conexão
  })

  it('com o destino falhando: a ação conclui e a falha vai só para o estado', async () => {
    const { destino, orquestrador } = await montarConectado()
    destino.falhas.push('falha')

    await expect(executarComBackup(orquestrador, () => Promise.resolve(7))).resolves.toBe(7)
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect(await obterEstadoNuvem()).toMatchObject({
      situacao: 'erro',
      motivoErro: 'falha',
      mensagemErro: MENSAGENS_NUVEM.falhaEnvio,
    })
  })

  it('com o envio demorando: a ação já terminou enquanto o envio continua', async () => {
    const { destino, orquestrador } = await montarConectado()
    const atraso = criarAtraso()
    destino.atrasoGravacao = atraso.promessa

    await expect(executarComBackup(orquestrador, () => Promise.resolve('ok'))).resolves.toBe('ok')
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    // O envio está parado no meio; a ação local já devolveu o resultado.
    await vi.waitFor(() => {
      expect(gerarBackupFalso).toHaveBeenCalledTimes(2)
    })
    expect(destino.gravacoes).toBe(1)
    atraso.liberar()
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(2)
  })

  it('ação local que falha: o erro dela chega normalmente e nada é agendado', async () => {
    const { orquestrador } = await montarConectado()
    await expect(
      executarComBackup(orquestrador, () => Promise.reject(new ErroNegocio('Data no futuro.'))),
    ).rejects.toThrow('Data no futuro.')
    await orquestrador.concluirPendentes()
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
    expect(relogio.ativas()).toBe(0)
  })

  it('sem orquestrador (recurso desligado), só executa a ação', async () => {
    await expect(executarComBackup(null, () => Promise.resolve(1))).resolves.toBe(1)
  })

  describe('com os repositórios reais', () => {
    let materiaId = ''

    beforeEach(async () => {
      await db.delete()
      await db.open()
      await garantirConfiguracoesPadrao()
      await db.configuracoes.update('app', { fusoHorario: FUSO })
      const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
      const materia = await criarMateria(pf.id, {
        nome: 'Matemática',
        descricao: '',
        cor: '#4f46e5',
      })
      materiaId = materia.id
      await definirPlanejamento([materia.id])
    })

    afterEach(() => {
      db.close()
    })

    async function montarReal(modo: DestinoFalso['modoAutorizacao']) {
      const destino = new DestinoFalso()
      const { orquestrador } = montar(destino, { gerarBackup: gerarBackupValidado })
      await orquestrador.pronto
      await orquestrador.conectar()
      await orquestrador.concluirPendentes()
      destino.definirToken(false)
      destino.modoAutorizacao = modo
      return { destino, orquestrador }
    }

    it.each(['nega', 'pendente'] as const)(
      'confirmar sessão grava o registro com o popup %s',
      async (modo) => {
        const { destino, orquestrador } = await montarReal(modo)
        // Sessão de 60 min encerrada aos 2 min, com heartbeats (sem suspensão).
        const t0 = new Date('2026-11-23T13:00:00.000Z')
        const em = (ms: number) => new Date(t0.getTime() + ms)
        await iniciarSessao(materiaId, 60, t0)
        for (let t = 20_000; t < 2 * 60_000; t += 20_000) {
          await aplicarEvento({ tipo: 'heartbeat' }, em(t))
        }
        await aplicarEvento({ tipo: 'encerrar' }, em(2 * 60_000))

        const resultado = await executarComBackup(orquestrador, () =>
          confirmarSessao(new Date(t0.getTime() + 2 * 60_000)),
        )

        expect(resultado).toBe('confirmada')
        expect(await obterSessao()).toBeNull()
        expect(await db.registros.count()).toBe(1)
        expect(destino.pedidosAutorizacao.length).toBeGreaterThan(0)
        await orquestrador.concluirPendentes()
        expect((await obterEstadoNuvem()).situacao).toBe('pendente')
      },
    )

    it('lançamento manual grava com o popup bloqueado', async () => {
      const { orquestrador } = await montarReal('nega')
      const registro = await executarComBackup(orquestrador, () =>
        lancarManual(
          { data: '2026-11-22', minutos: 30, materiaId },
          new Date('2026-11-23T15:00:00.000Z'),
        ),
      )
      expect(await db.registros.get(registro.id)).toBeDefined()
      await orquestrador.concluirPendentes()
      const estado = await obterEstadoNuvem()
      expect(estado.situacao).toBe('pendente')
      expect(indicadorCabecalho(estado, false)).toBe('reconectar')
    })
  })
})

// ---------------------------------------------------------------------------
// RN43: agrupamento e pendência gravada na hora
// ---------------------------------------------------------------------------

describe('agrupamento (RN43)', () => {
  it('vários gatilhos em 5 s geram um envio só', async () => {
    const { destino, orquestrador } = await montarConectado()
    expect(destino.gravacoes).toBe(1)

    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(2_000)
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(2_000)
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()

    relogio.avancar(ESPERA_AGRUPAMENTO_MS - 1)
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(1)

    relogio.avancar(1)
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(2)
    expect(gerarBackupFalso).toHaveBeenCalledTimes(2)
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
  })

  it('"pendente" é gravado na hora do gatilho e aparece ao reabrir', async () => {
    const { orquestrador } = await montarConectado()
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    // Antes dos 5 s, já está gravado.
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')

    // A aba fecha antes do envio.
    orquestrador.encerrar()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)

    // Reaberta: sem token, o indicador pede para reconectar.
    const { orquestrador: reaberto } = montar()
    await reaberto.pronto
    expect(reaberto.estado().situacao).toBe('pendente')
    expect(indicadorCabecalho(reaberto.estado(), reaberto.temToken())).toBe('reconectar')
  })

  it('desconectado, o gatilho não grava nem agenda nada', async () => {
    const { orquestrador } = montar()
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    expect(relogio.ativas()).toBe(0)
    expect(await dbNuvem.estado.count()).toBe(0)
  })

  it('gatilho durante o envio: termina pendente e envia de novo', async () => {
    const { destino, orquestrador } = await montarConectado()
    const atraso = criarAtraso()
    destino.atrasoGravacao = atraso.promessa
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await vi.waitFor(() => {
      expect(gerarBackupFalso).toHaveBeenCalledTimes(2)
    })

    // Novo dado enquanto o envio anterior está no meio.
    orquestrador.gatilho()
    destino.atrasoGravacao = null
    atraso.liberar()
    await orquestrador.concluirPendentes()
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')

    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(3)
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// Conectar: primeiro envio na hora e referência do Drive (RN43, RN45)
// ---------------------------------------------------------------------------

describe('conectar', () => {
  it('envia na hora, sem esperar os 5 s', async () => {
    const { destino, orquestrador } = montar()
    await orquestrador.pronto
    const promessa = orquestrador.conectar()
    expect(destino.pedidosAutorizacao).toEqual([{ dicaEmail: null, escolherConta: true }])

    await expect(promessa).resolves.toEqual({ ok: true, envio: 'enviado' })
    expect(relogio.ativas()).toBe(0)
    expect(destino.gravacoes).toBe(1)
    const estado = await obterEstadoNuvem()
    expect(estado).toMatchObject({
      conectado: true,
      email: 'pessoa@example.com',
      situacao: 'ok',
      registrosUltimoEnvio: 40,
    })
    expect(estado.pastaId).not.toBeNull()
    const [arquivo] = destino.doApp(estado.pastaId ?? '')
    expect(arquivo?.meta.name).toBe('study-manager-backup-2026-11-23.json')
    expect(JSON.parse(arquivo?.conteudo ?? '')).toEqual({ registros: 40 })
  })

  it('navegador vazio e Drive com mais registros: suspende em vez de enviar', async () => {
    const destino = new DestinoFalso()
    await semearDrive(destino, '2026-11-20', '120')
    totalLocal = 0
    const { orquestrador } = montar(destino)
    await orquestrador.pronto

    await expect(orquestrador.conectar()).resolves.toEqual({ ok: true, envio: 'suspenso' })
    expect(destino.gravacoes).toBe(0)
    const estado = await obterEstadoNuvem()
    expect(estado).toMatchObject({
      conectado: true,
      registrosUltimoEnvio: 120,
      situacao: 'erro',
      motivoErro: 'suspenso',
      mensagemErro: MENSAGEM_SUSPENSAO,
    })
    expect(indicadorCabecalho(estado, true)).toBe('suspenso')
  })

  it('acha a pasta que já existe no Drive em vez de criar outra', async () => {
    const destino = new DestinoFalso()
    const pasta = await semearDrive(destino, '2026-11-20', '10')
    const { orquestrador } = montar(destino)
    await orquestrador.pronto
    await orquestrador.conectar()
    expect((await obterEstadoNuvem()).pastaId).toBe(pasta)
    expect(destino.doApp(pasta)).toHaveLength(2)
  })

  it('referência inválida no Drive: fica sem referência e envia', async () => {
    const destino = new DestinoFalso()
    await semearDrive(destino, '2026-11-20', 'muitos')
    totalLocal = 0
    const { orquestrador } = montar(destino)
    await orquestrador.pronto
    await expect(orquestrador.conectar()).resolves.toEqual({ ok: true, envio: 'enviado' })
    expect((await obterEstadoNuvem()).registrosUltimoEnvio).toBe(0)
  })

  it('popup recusado: não conecta', async () => {
    const destino = new DestinoFalso()
    destino.modoAutorizacao = 'nega'
    const { orquestrador } = montar(destino)
    await orquestrador.pronto
    await expect(orquestrador.conectar()).resolves.toEqual({
      ok: false,
      erro: MENSAGENS_NUVEM.autorizacaoRecusada,
    })
    expect((await obterEstadoNuvem()).conectado).toBe(false)
  })

  it('falha na API durante a conexão: não conecta', async () => {
    const destino = new DestinoFalso()
    destino.falhas.push('falha')
    const { orquestrador } = montar(destino)
    await orquestrador.pronto
    await expect(orquestrador.conectar()).resolves.toEqual({
      ok: false,
      erro: MENSAGENS_NUVEM.falhaConexao,
    })
    expect((await obterEstadoNuvem()).conectado).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// RN45: proteção contra sobrescrever um backup bom
// ---------------------------------------------------------------------------

describe('proteção do RN45', () => {
  it('envio automático com menos registros é suspenso', async () => {
    const { destino, orquestrador } = await montarConectado()
    totalLocal = 39
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(1)
    expect((await obterEstadoNuvem()).motivoErro).toBe('suspenso')
  })

  it('"Fazer backup agora" pede confirmação e só envia confirmado', async () => {
    const { destino, orquestrador } = await montarConectado()
    totalLocal = 10

    await expect(orquestrador.enviarAgora()).resolves.toBe('precisaConfirmar')
    expect(destino.gravacoes).toBe(1)
    expect((await obterEstadoNuvem()).motivoErro).toBe('suspenso')

    await expect(orquestrador.enviarAgora({ confirmado: true })).resolves.toBe('enviado')
    expect(destino.gravacoes).toBe(2)
    expect(await obterEstadoNuvem()).toMatchObject({
      situacao: 'ok',
      motivoErro: null,
      registrosUltimoEnvio: 10,
    })
  })

  it('com o total de volta à referência, o envio automático volta a sair', async () => {
    const { destino, orquestrador } = await montarConectado()
    totalLocal = 39
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect((await obterEstadoNuvem()).motivoErro).toBe('suspenso')

    totalLocal = 40
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    // O gatilho mantém a suspensão visível até o envio conferir.
    expect((await obterEstadoNuvem()).motivoErro).toBe('suspenso')
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(2)
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// Lock entre abas
// ---------------------------------------------------------------------------

describe('duas abas', () => {
  it('não enviam ao mesmo tempo, e a segunda não repete o envio', async () => {
    const drive = new DestinoFalso()
    const { orquestrador: aba1 } = await montarConectado(drive)
    const { orquestrador: aba2 } = montar(drive)
    await aba2.pronto
    await vi.waitFor(() => {
      expect(aba2.estado().conectado).toBe(true)
    })

    const atraso = criarAtraso()
    drive.atrasoGravacao = atraso.promessa
    aba1.gatilho()
    aba2.gatilho()
    await Promise.all([aba1.concluirPendentes(), aba2.concluirPendentes()])
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await vi.waitFor(() => {
      expect(gerarBackupFalso).toHaveBeenCalledTimes(2)
    })
    atraso.liberar()
    await Promise.all([aba1.concluirPendentes(), aba2.concluirPendentes()])

    expect(drive.maxGravacoesSimultaneas).toBe(1)
    expect(drive.gravacoes).toBe(2) // conexão + um envio para as duas abas
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
  })

  it('dois envios manuais simultâneos saem um depois do outro', async () => {
    const drive = new DestinoFalso()
    const { orquestrador: aba1 } = await montarConectado(drive)
    const { orquestrador: aba2 } = montar(drive)
    await aba2.pronto
    const atraso = criarAtraso()
    drive.atrasoGravacao = atraso.promessa
    const envios = Promise.all([aba1.enviarAgora(), aba2.enviarAgora()])
    await vi.waitFor(() => {
      expect(gerarBackupFalso).toHaveBeenCalledTimes(2)
    })
    atraso.liberar()
    await expect(envios).resolves.toEqual(['enviado', 'enviado'])
    expect(drive.maxGravacoesSimultaneas).toBe(1)
    // Mesmo dia: o segundo sobrescreve o arquivo do primeiro.
    expect(drive.doApp((await obterEstadoNuvem()).pastaId ?? '')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Offline e token
// ---------------------------------------------------------------------------

describe('offline', () => {
  it('fica pendente e reenvia ao voltar a conexão, com token', async () => {
    const { destino, orquestrador } = await montarConectado()
    rede.cair()
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(1)
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')

    rede.voltar()
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(2)
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
  })

  it('sem token, a volta da conexão não envia', async () => {
    const { destino, orquestrador } = await montarConectado()
    rede.cair()
    destino.definirToken(false)
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    rede.voltar()
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(1)
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')
  })

  it('erro de rede no meio do envio também fica pendente', async () => {
    const { destino, orquestrador } = await montarConectado()
    destino.falhas.push('offline')
    await expect(orquestrador.enviarAgora()).resolves.toBe('pendente')
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')
  })
})

describe('token', () => {
  it('quando o token chega, envia o que estava pendente', async () => {
    const { destino, orquestrador } = await montarConectado()
    destino.definirToken(false)
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(1)

    destino.definirToken(true) // por exemplo, resposta tardia do popup
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(2)
  })

  it('token recusado pela API (401) fica pendente e pede reconexão', async () => {
    const { destino, orquestrador } = await montarConectado()
    destino.falhas.push('semAutorizacao')
    await expect(orquestrador.enviarAgora()).resolves.toBe('pendente')
    const estado = await obterEstadoNuvem()
    expect(estado.situacao).toBe('pendente')
    expect(indicadorCabecalho(estado, orquestrador.temToken())).toBe('reconectar')
  })

  it('"Reconectar" pede o token com a dica de e-mail e envia', async () => {
    const { destino, orquestrador } = await montarConectado()
    destino.definirToken(false)
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()
    relogio.avancar(ESPERA_AGRUPAMENTO_MS)
    await orquestrador.concluirPendentes()

    const promessa = orquestrador.reconectar()
    expect(destino.pedidosAutorizacao.at(-1)).toEqual({
      dicaEmail: 'pessoa@example.com',
      escolherConta: false,
    })
    await promessa
    await orquestrador.concluirPendentes()
    expect(destino.gravacoes).toBe(2)
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
  })

  it('"Fazer backup agora" com popup recusado fica pendente', async () => {
    const { destino, orquestrador } = await montarConectado()
    destino.definirToken(false)
    destino.modoAutorizacao = 'nega'
    await expect(orquestrador.enviarAgora()).resolves.toBe('pendente')
    expect((await obterEstadoNuvem()).situacao).toBe('pendente')
  })

  it('com token válido, o clique não abre popup', async () => {
    const { destino, orquestrador } = await montarConectado()
    const pedidos = destino.pedidosAutorizacao.length
    orquestrador.prepararNoClique()
    expect(destino.pedidosAutorizacao).toHaveLength(pedidos)
  })
})

// ---------------------------------------------------------------------------
// Retenção, falhas e desconexão
// ---------------------------------------------------------------------------

describe('retenção (RN46)', () => {
  it('no 31º dia, o mais antigo vai para a lixeira; arquivos alheios ficam', async () => {
    const destino = new DestinoFalso()
    destino.definirToken(true)
    const pasta = await destino.garantirPasta(null)
    const ids: string[] = []
    for (let dia = 1; dia <= 30; dia++) {
      const data = `2026-10-${String(dia).padStart(2, '0')}`
      ids.push(
        destino.semear(
          pasta,
          nomeArquivoNuvem(data),
          appPropertiesDoBackup(data, {
            exportadoEm: `${data}T12:00:00.000Z`,
            objetivos: 1,
            materias: 1,
            registros: 1,
            registrosExcluidos: 0,
          }),
        ),
      )
    }
    const alheio = destino.semear(pasta, 'anotacoes.txt', {})
    destino.definirToken(false)

    const { orquestrador } = montar(destino)
    await orquestrador.pronto
    await orquestrador.conectar()

    expect(destino.arquivos.get(ids[0] ?? '')?.lixeira).toBe(true)
    expect(destino.arquivos.get(ids[1] ?? '')?.lixeira).toBe(false)
    expect(destino.arquivos.get(alheio)?.lixeira).toBe(false)
    expect(destino.doApp(pasta)).toHaveLength(31) // 30 dias + o arquivo alheio
  })

  it('falha ao mover para a lixeira não estraga o envio', async () => {
    const destino = new DestinoFalso()
    destino.definirToken(true)
    const pasta = await destino.garantirPasta(null)
    for (let dia = 1; dia <= 30; dia++) {
      const data = `2026-10-${String(dia).padStart(2, '0')}`
      destino.semear(pasta, nomeArquivoNuvem(data), {
        studyManager: 'backup',
        dia: data,
      })
    }
    destino.definirToken(false)
    const { orquestrador } = montar(destino)
    await orquestrador.pronto
    const moverOriginal = destino.moverParaLixeira.bind(destino)
    destino.moverParaLixeira = () => Promise.reject(new Error('cota'))
    await expect(orquestrador.conectar()).resolves.toEqual({ ok: true, envio: 'enviado' })
    expect((await obterEstadoNuvem()).situacao).toBe('ok')
    destino.moverParaLixeira = moverOriginal
  })

  it('o mesmo dia sobrescreve o arquivo do dia', async () => {
    const { destino, orquestrador } = await montarConectado()
    totalLocal = 41
    await orquestrador.enviarAgora()
    const pasta = (await obterEstadoNuvem()).pastaId ?? ''
    const arquivos = destino.doApp(pasta)
    expect(arquivos).toHaveLength(1)
    expect(JSON.parse(arquivos[0]?.conteudo ?? '')).toEqual({ registros: 41 })
    expect(arquivos[0]?.meta.appProperties?.registros).toBe('41')
  })
})

describe('falhas na geração', () => {
  it('validação falhou: nada é enviado e a mensagem vai para o estado', async () => {
    const { destino, orquestrador } = await montarConectado()
    gerarBackupFalso.mockRejectedValueOnce(new ErroNegocio('O backup não foi gerado porque…'))
    await expect(orquestrador.enviarAgora()).resolves.toBe('erro')
    expect(destino.gravacoes).toBe(1)
    expect(await obterEstadoNuvem()).toMatchObject({
      situacao: 'erro',
      motivoErro: 'falha',
      mensagemErro: 'O backup não foi gerado porque…',
    })
  })

  it('erro inesperado na leitura usa mensagem genérica', async () => {
    const { orquestrador } = await montarConectado()
    gerarBackupFalso.mockRejectedValueOnce(new Error('IDB quebrou'))
    await orquestrador.enviarAgora()
    expect((await obterEstadoNuvem()).mensagemErro).toBe(MENSAGENS_NUVEM.falhaGeracao)
  })
})

describe('desconectar', () => {
  it('revoga o token, limpa o estado e não apaga nada no Drive', async () => {
    const { destino, orquestrador } = await montarConectado()
    const arquivosAntes = destino.arquivos.size
    orquestrador.gatilho()
    await orquestrador.concluirPendentes()

    await orquestrador.desconectar()
    expect(destino.revogacoes).toBe(1)
    expect(destino.temToken()).toBe(false)
    expect(await obterEstadoNuvem()).toMatchObject({ conectado: false, situacao: 'ok' })
    expect(relogio.ativas()).toBe(0)
    expect(destino.arquivos.size).toBe(arquivosAntes)
    expect([...destino.arquivos.values()].every((a) => !a.lixeira)).toBe(true)
  })

  it('envio que termina depois de desconectar não reescreve o estado', async () => {
    const { destino, orquestrador } = await montarConectado()
    const atraso = criarAtraso()
    destino.atrasoGravacao = atraso.promessa
    const envio = orquestrador.enviarAgora()
    await vi.waitFor(() => {
      expect(gerarBackupFalso).toHaveBeenCalledTimes(2)
    })
    await orquestrador.desconectar()
    atraso.liberar()
    await envio
    expect(await obterEstadoNuvem()).toMatchObject({ conectado: false, ultimoEnvioEm: null })
  })
})
