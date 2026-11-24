import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbNuvem } from '@/db/bancoNuvem'
import type { BackupGerado } from '@/db/backupRepositorio'
import { obterEstadoNuvem } from '@/db/nuvemRepositorio'
import {
  API,
  arquivoApi,
  criarFetchFalso,
  criarGoogleFalso,
  json,
  pastaApi,
  SESSAO,
  TOKEN_FALSO,
  UPLOAD,
} from '@/test/googleFalso'
import { criarOrquestradorNuvem, type OrquestradorNuvem } from '../orquestrador'
import { DestinoGoogle } from './destinoGoogle'

const CONTEUDO = '{"marcador":"CONTEUDO-DO-BACKUP"}'
const PROIBIDOS = [TOKEN_FALSO, 'Bearer', 'upload_id', 'SESSAO-SECRETA', 'CONTEUDO-DO-BACKUP']

const gerarBackup = (agora: Date): Promise<BackupGerado> =>
  Promise.resolve({
    arquivo: { nome: 'x.json', conteudo: CONTEUDO, exportadoEm: agora.toISOString() },
    resumo: {
      exportadoEm: agora.toISOString(),
      objetivos: 1,
      materias: 1,
      registros: 5,
      registrosExcluidos: 0,
    },
    fuso: 'America/Sao_Paulo',
  })

let google: ReturnType<typeof criarGoogleFalso>
let rede: ReturnType<typeof criarFetchFalso>
let registrarErro: ReturnType<typeof vi.fn<(contexto: string, erro: unknown) => void>>
let destino: DestinoGoogle
let orquestrador: OrquestradorNuvem

/** Tudo o que um log poderia mostrar de um argumento. */
function serializar(parte: unknown): string {
  if (parte instanceof Error) {
    return `${parte.name} ${parte.message} ${String(parte.stack)} ${JSON.stringify(parte)}`
  }
  return typeof parte === 'string' ? parte : JSON.stringify(parte)
}

/** Rotas de um envio: confere a pasta pelo id e lista os backups dela. */
function rotasDeEnvio() {
  rede.em('GET', `${API}/files/pasta1`, json(pastaApi('pasta1')))
  rede.em('GET', `${API}/files`, json({ files: [] }))
}

/** Conexão (e-mail, busca e criação da pasta, referência) e o começo do envio. */
function rotasAteOUpload() {
  rede.em('GET', `${API}/about`, json({ user: { emailAddress: 'pessoa@example.com' } }))
  rede.em('GET', `${API}/files`, json({ files: [] }), json({ files: [] }))
  rede.em('POST', `${API}/files`, json(pastaApi('pasta1')))
  rotasDeEnvio()
}

/** Conecta: o teste faz o papel do usuário no popup. */
async function conectar() {
  await destino.autorizacao.preparar()
  const promessa = orquestrador.conectar()
  google.concederToken()
  return promessa
}

beforeEach(async () => {
  google = criarGoogleFalso()
  rede = criarFetchFalso()
  registrarErro = vi.fn<(contexto: string, erro: unknown) => void>()
  destino = new DestinoGoogle({
    clientId: 'cliente.apps.googleusercontent.com',
    fetch: rede.fetch,
    carregarGis: () => Promise.resolve(google.oauth2),
    registrarErro,
  })
  await dbNuvem.delete()
  await dbNuvem.open()
  orquestrador = criarOrquestradorNuvem({
    destino,
    gerarBackup,
    registrarErro,
    comLock: (funcao) => funcao(),
    temporizador: { definir: () => () => undefined },
    conexao: { online: () => true, aoVoltar: () => () => undefined },
  })
  await orquestrador.pronto
})

afterEach(async () => {
  orquestrador.encerrar()
  await orquestrador.concluirPendentes()
  dbNuvem.close()
})

describe('DestinoGoogle com o orquestrador', () => {
  it('conecta e envia o arquivo do dia pelo upload resumable', async () => {
    rotasAteOUpload()
    rede.em('POST', UPLOAD, json({}, 200, { Location: SESSAO }))
    rede.em('PUT', /upload_id=/, json(arquivoApi('dia')))
    await expect(conectar()).resolves.toEqual({ ok: true, envio: 'enviado' })
    expect(await obterEstadoNuvem()).toMatchObject({
      conectado: true,
      email: 'pessoa@example.com',
      pastaId: 'pasta1',
      situacao: 'ok',
      registrosUltimoEnvio: 5,
    })
    const envio = rede.chamadas.find((chamada) => chamada.metodo === 'PUT')
    expect(envio?.corpo).toBe(CONTEUDO)
  })

  it('nenhum log contém token, Authorization, URL de sessão ou conteúdo', async () => {
    // Conexão com o envio falhando no meio (503 no PUT).
    rotasAteOUpload()
    rede.em('POST', UPLOAD, json({}, 200, { Location: SESSAO }))
    rede.em('PUT', /upload_id=/, json({ error: TOKEN_FALSO }, 503))
    await expect(conectar()).resolves.toEqual({ ok: true, envio: 'erro' })

    // Location de outro domínio (com dados sensíveis na URL).
    rotasDeEnvio()
    rede.em(
      'POST',
      UPLOAD,
      json({}, 200, { Location: `https://evil.example/?upload_id=SESSAO-SECRETA` }),
    )
    await expect(orquestrador.enviarAgora()).resolves.toBe('erro')

    // Falha de rede no envio do conteúdo.
    rotasDeEnvio()
    rede.em('POST', UPLOAD, json({}, 200, { Location: SESSAO }))
    rede.em('PUT', /upload_id=/, 'rede')
    await expect(orquestrador.enviarAgora()).resolves.toBe('pendente')

    // 401: o token é esquecido.
    rotasDeEnvio()
    rede.em('POST', UPLOAD, json({}, 401))
    await expect(orquestrador.enviarAgora()).resolves.toBe('pendente')
    expect(destino.temToken()).toBe(false)

    // Popup fechado ao reconectar (a mensagem do Google traz o token).
    const reconexao = orquestrador.reconectar()
    google.erroPopup('popup_closed')
    await expect(reconexao).resolves.toBe('pendente')

    // Revogação que falha.
    const nova = orquestrador.reconectar()
    google.concederToken()
    await nova
    google.definirRevogacao('lanca')
    await orquestrador.desconectar()

    expect(registrarErro.mock.calls.length).toBeGreaterThanOrEqual(6)
    for (const chamada of registrarErro.mock.calls) {
      const texto = chamada.map(serializar).join(' ')
      for (const proibido of PROIBIDOS) expect(texto).not.toContain(proibido)
    }
  })

  it('baixa, lista e manda para a lixeira pelo cliente do Drive', async () => {
    await destino.autorizacao.preparar()
    const autorizacao = destino.autorizar({ dicaEmail: null, escolherConta: true })
    google.concederToken()
    await autorizacao

    rede.em('GET', `${API}/files`, json({ files: [] }))
    await expect(destino.listarBackups('pasta1')).resolves.toEqual([])
    rede.em('PATCH', `${API}/files/velho`, json({ id: 'velho' }))
    await destino.moverParaLixeira('velho')
    rede.em('GET', `${API}/files/b1`, json(arquivoApi('b1')))
    rede.em('GET', /alt=media/, new Response('{"a":1}'))
    await expect(destino.baixarBackup('b1')).resolves.toBe('{"a":1}')

    const ouvinte = vi.fn()
    const parar = destino.aoMudarToken(ouvinte)
    await destino.revogar()
    expect(ouvinte).toHaveBeenCalledOnce()
    parar()
  })

  it('preparar só carrega o script uma vez', async () => {
    const carregar = vi.fn(() => Promise.resolve(google.oauth2))
    const outro = new DestinoGoogle({ clientId: 'c', carregarGis: carregar })
    outro.preparar()
    outro.preparar()
    await outro.autorizacao.preparar()
    expect(carregar).toHaveBeenCalledOnce()
  })
})
