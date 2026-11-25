import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TAMANHO_MAXIMO_BACKUP_BYTES } from '@/domain/backup'
import { appPropertiesDoBackup, consultaBackups, consultaPasta } from '@/domain/backupNuvem'
import {
  API,
  arquivoApi,
  criarFetchFalso,
  json,
  pastaApi,
  SESSAO,
  TOKEN_FALSO,
  UPLOAD,
} from '@/test/googleFalso'
import { ErroNuvem } from '../destino'
import { ClienteDrive, MAXIMO_PAGINAS } from './clienteDrive'

let rede: ReturnType<typeof criarFetchFalso>
let token: string | null
let aoRecusarToken: ReturnType<typeof vi.fn<() => void>>
let cliente: ClienteDrive

const DADOS = {
  pastaId: 'pasta1',
  nome: 'study-manager-backup-2026-11-23.json',
  conteudo: '{"app":"study-manager","segredo":"CONTEUDO-DO-BACKUP"}',
  appProperties: appPropertiesDoBackup('2026-11-23', {
    exportadoEm: '2026-11-23T15:00:00.000Z',
    objetivos: 1,
    materias: 2,
    registros: 3,
    registrosExcluidos: 0,
  }),
}

function backupApi(id: string, dia: string) {
  return arquivoApi(id, { appProperties: { studyManager: 'backup', dia } })
}

function parametros(url: string): URLSearchParams {
  return new URL(url).searchParams
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroNuvem> {
  const erro: unknown = await promessa.then(
    () => null,
    (motivo: unknown) => motivo,
  )
  if (!(erro instanceof ErroNuvem)) throw new Error('esperava ErroNuvem')
  return erro
}

beforeEach(() => {
  rede = criarFetchFalso()
  token = TOKEN_FALSO
  aoRecusarToken = vi.fn<() => void>()
  cliente = new ClienteDrive({ fetch: rede.fetch, token: () => token, aoRecusarToken })
})

describe('requisições', () => {
  it('mandam o token só no cabeçalho, sem cookies e sem cache', async () => {
    rede.em('GET', `${API}/about`, json({ user: { emailAddress: 'pessoa@example.com' } }))
    await expect(cliente.obterEmail()).resolves.toBe('pessoa@example.com')
    const [chamada] = rede.chamadas
    expect(chamada?.cabecalhos.get('Authorization')).toBe(`Bearer ${TOKEN_FALSO}`)
    expect(chamada?.url).not.toContain(TOKEN_FALSO)
    expect(chamada?.credenciais).toBe('omit')
    expect(parametros(chamada?.url ?? '').get('fields')).toBe('user(emailAddress)')
  })

  it('sem token: semAutorizacao, sem chamar a rede', async () => {
    token = null
    const erro = await erroDe(cliente.obterEmail())
    expect(erro.tipo).toBe('semAutorizacao')
    expect(rede.chamadas).toHaveLength(0)
  })

  it('falha de rede vira offline', async () => {
    rede.em('GET', `${API}/about`, 'rede')
    expect((await erroDe(cliente.obterEmail())).tipo).toBe('offline')
  })

  it('401 vira semAutorizacao e esquece o token', async () => {
    rede.em('GET', `${API}/about`, json({}, 401))
    const erro = await erroDe(cliente.obterEmail())
    expect(erro).toMatchObject({ tipo: 'semAutorizacao', status: 401 })
    expect(aoRecusarToken).toHaveBeenCalledOnce()
  })

  it.each([403, 404, 429, 500, 503])('HTTP %i vira falha', async (status) => {
    rede.em('GET', `${API}/about`, json({ error: { message: 'detalhe' } }, status))
    const erro = await erroDe(cliente.obterEmail())
    expect(erro).toMatchObject({ tipo: 'falha', status, message: `email: HTTP ${status}` })
    expect(aoRecusarToken).not.toHaveBeenCalled()
  })

  it('JSON inválido vira falha', async () => {
    rede.em('GET', `${API}/about`, new Response('<html>', { status: 200 }))
    expect((await erroDe(cliente.obterEmail())).tipo).toBe('falha')
  })

  it('e-mail ausente ou inválido vira null', async () => {
    rede.em('GET', `${API}/about`, json({ user: {} }))
    await expect(cliente.obterEmail()).resolves.toBeNull()
  })
})

describe('garantirPasta', () => {
  it('pasta informada que ainda é a do app: usa direto', async () => {
    rede.em('GET', `${API}/files/pasta1`, json(pastaApi('pasta1')))
    await expect(cliente.garantirPasta('pasta1')).resolves.toBe('pasta1')
    expect(rede.chamadas).toHaveLength(1)
  })

  it.each([
    ['apagada (404)', json({}, 404)],
    ['na lixeira', json(pastaApi('pasta1', { trashed: true }))],
    ['sem a marca', json(pastaApi('pasta1', { appProperties: {} }))],
    ['que não é pasta', json(arquivoApi('pasta1', { appProperties: { studyManager: 'pasta' } }))],
    ['resposta inválida', json({ id: '../x' })],
  ])('pasta informada %s: procura pela marca', async (_caso, resposta) => {
    rede.em('GET', `${API}/files/pasta1`, resposta)
    rede.em('GET', `${API}/files`, json({ files: [pastaApi('pasta2')] }))
    await expect(cliente.garantirPasta('pasta1')).resolves.toBe('pasta2')
    const busca = rede.chamadas[1]
    expect(parametros(busca?.url ?? '').get('q')).toBe(consultaPasta())
  })

  it('erro diferente de 404 ao conferir a pasta é repassado', async () => {
    rede.em('GET', `${API}/files/pasta1`, json({}, 500))
    expect((await erroDe(cliente.garantirPasta('pasta1'))).status).toBe(500)
  })

  it('sem pasta: cria com a marca do app', async () => {
    rede.em('GET', `${API}/files`, json({ files: [] }))
    rede.em('POST', `${API}/files`, json(pastaApi('nova')))
    await expect(cliente.garantirPasta(null)).resolves.toBe('nova')
    const criacao = rede.chamadas[1]
    expect(JSON.parse(criacao?.corpo ?? '')).toEqual({
      name: 'Study Manager',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { studyManager: 'pasta' },
    })
  })

  it('acharPasta nunca cria: sem pasta, devolve null sem POST', async () => {
    rede.em('GET', `${API}/files/sumiu`, json({}, 404))
    rede.em('GET', `${API}/files`, json({ files: [] }))
    await expect(cliente.acharPasta('sumiu')).resolves.toBeNull()
    expect(rede.chamadas.some((chamada) => chamada.metodo === 'POST')).toBe(false)
  })

  it('respostas inválidas na busca ou na criação viram falha', async () => {
    rede.em('GET', `${API}/files`, json({ arquivos: [] }))
    expect((await erroDe(cliente.garantirPasta(null))).tipo).toBe('falha')
    rede.em('GET', `${API}/files`, json({ files: [] }))
    rede.em('POST', `${API}/files`, json({ id: 'sem-campos' }))
    expect((await erroDe(cliente.garantirPasta(null))).tipo).toBe('falha')
  })
})

describe('listarBackups', () => {
  it('percorre as páginas, com fields mínimos, e ordena', async () => {
    rede.em(
      'GET',
      `${API}/files`,
      json({ files: [backupApi('a', '2026-11-20')], nextPageToken: 'pagina2' }),
      json({ files: [backupApi('b', '2026-11-22'), { id: 'invalido' }] }),
    )
    const backups = await cliente.listarBackups('pasta1')
    expect(backups.map((b) => b.id)).toEqual(['b', 'a'])
    const [primeira, segunda] = rede.chamadas.map((c) => parametros(c.url))
    expect(primeira?.get('q')).toBe(consultaBackups('pasta1'))
    expect(primeira?.get('fields')).toBe(
      'nextPageToken,files(id,name,mimeType,modifiedTime,size,trashed,appProperties)',
    )
    expect(primeira?.has('pageToken')).toBe(false)
    expect(segunda?.get('pageToken')).toBe('pagina2')
  })

  it('páginas demais viram falha (sem laço infinito)', async () => {
    const paginas = Array.from({ length: MAXIMO_PAGINAS }, () =>
      json({ files: [], nextPageToken: 'de-novo' }),
    )
    rede.em('GET', `${API}/files`, ...paginas)
    expect((await erroDe(cliente.listarBackups('pasta1'))).tipo).toBe('falha')
    expect(rede.chamadas).toHaveLength(MAXIMO_PAGINAS)
  })

  it('resposta que não é lista vira falha', async () => {
    rede.em('GET', `${API}/files`, json({ files: 'x' }))
    expect((await erroDe(cliente.listarBackups('pasta1'))).tipo).toBe('falha')
  })
})

describe('gravarBackup (upload resumable)', () => {
  it('cria: abre a sessão com os metadados e envia o conteúdo ao Location', async () => {
    rede.em('POST', UPLOAD, json({}, 200, { Location: SESSAO }))
    rede.em('PUT', /upload_id=SESSAO-SECRETA/, json(arquivoApi('novo')))
    await cliente.gravarBackup({ ...DADOS, idExistente: null })

    const [sessao, envio] = rede.chamadas
    expect(parametros(sessao?.url ?? '').get('uploadType')).toBe('resumable')
    expect(sessao?.cabecalhos.get('X-Upload-Content-Type')).toBe('application/json')
    expect(JSON.parse(sessao?.corpo ?? '')).toEqual({
      name: DADOS.nome,
      mimeType: 'application/json',
      parents: ['pasta1'],
      appProperties: DADOS.appProperties,
    })
    expect(sessao?.corpo).not.toContain('CONTEUDO-DO-BACKUP')
    expect(envio?.url).toBe(SESSAO)
    expect(envio?.corpo).toBe(DADOS.conteudo)
    expect(envio?.cabecalhos.get('Authorization')).toBe(`Bearer ${TOKEN_FALSO}`)
  })

  it('sobrescreve: PATCH no arquivo do dia, sem mudar a pasta', async () => {
    rede.em('PATCH', `${UPLOAD}/doDia`, json({}, 200, { Location: SESSAO }))
    rede.em('PUT', /upload_id=/, json(arquivoApi('doDia')))
    await cliente.gravarBackup({ ...DADOS, idExistente: 'doDia' })
    const corpo = JSON.parse(rede.chamadas[0]?.corpo ?? '') as Record<string, unknown>
    expect(corpo).toEqual({ name: DADOS.nome, appProperties: DADOS.appProperties })
  })

  it.each([
    ['ausente', undefined],
    ['de outro domínio', 'https://evil.example/upload/drive/v3/files?upload_id=x'],
    ['em http', 'http://www.googleapis.com/upload/drive/v3/files?upload_id=x'],
    ['fora do endpoint de upload', 'https://www.googleapis.com/drive/v3/files'],
  ])('Location %s é recusado e nada é enviado', async (_caso, local) => {
    rede.em('POST', UPLOAD, json({}, 200, local ? { Location: local } : {}))
    const erro = await erroDe(cliente.gravarBackup({ ...DADOS, idExistente: null }))
    expect(erro.tipo).toBe('falha')
    expect(erro.message).not.toContain('upload_id')
    expect(rede.chamadas).toHaveLength(1)
  })

  it('resposta inválida do envio vira falha', async () => {
    rede.em('POST', UPLOAD, json({}, 200, { Location: SESSAO }))
    rede.em('PUT', /upload_id=/, json({ ok: true }))
    expect((await erroDe(cliente.gravarBackup({ ...DADOS, idExistente: null }))).tipo).toBe('falha')
  })

  it('erro no envio não expõe a URL da sessão', async () => {
    rede.em('POST', UPLOAD, json({}, 200, { Location: SESSAO }))
    rede.em('PUT', /upload_id=/, json({}, 503))
    const erro = await erroDe(cliente.gravarBackup({ ...DADOS, idExistente: null }))
    expect(erro.message).toBe('upload: HTTP 503')
  })
})

describe('moverParaLixeira', () => {
  it('marca trashed: true, sem nunca usar DELETE', async () => {
    rede.em('PATCH', `${API}/files/velho`, json({ id: 'velho' }))
    await cliente.moverParaLixeira('velho')
    expect(rede.chamadas[0]?.metodo).toBe('PATCH')
    expect(JSON.parse(rede.chamadas[0]?.corpo ?? '')).toEqual({ trashed: true })
    expect(rede.chamadas.some((c) => c.metodo === 'DELETE')).toBe(false)
  })
})

describe('baixarBackup', () => {
  it('confere os metadados e baixa o conteúdo', async () => {
    rede.em('GET', `${API}/files/b1`, json(arquivoApi('b1', { size: '12' })))
    rede.em('GET', /files\/b1\?alt=media/, new Response('{"backup":1}'))
    await expect(cliente.baixarBackup('b1')).resolves.toBe('{"backup":1}')
    expect(parametros(rede.chamadas[1]?.url ?? '').get('alt')).toBe('media')
  })

  it('grande demais nos metadados: recusado antes de baixar', async () => {
    rede.em(
      'GET',
      `${API}/files/b1`,
      json(arquivoApi('b1', { size: String(TAMANHO_MAXIMO_BACKUP_BYTES + 1) })),
    )
    expect((await erroDe(cliente.baixarBackup('b1'))).tipo).toBe('falha')
    expect(rede.chamadas).toHaveLength(1)
  })

  it('sem tamanho nos metadados: recusado antes de baixar', async () => {
    rede.em('GET', `${API}/files/b1`, json(arquivoApi('b1', { size: undefined })))
    expect((await erroDe(cliente.baixarBackup('b1'))).tipo).toBe('falha')
    expect(rede.chamadas).toHaveLength(1)
  })

  it('metadados mentindo: o tamanho real é conferido depois de baixar', async () => {
    rede.em('GET', `${API}/files/b1`, json(arquivoApi('b1', { size: '10' })))
    rede.em('GET', /alt=media/, () => new Response(new Uint8Array(TAMANHO_MAXIMO_BACKUP_BYTES + 1)))
    const erro = await erroDe(cliente.baixarBackup('b1'))
    expect(erro).toMatchObject({ tipo: 'falha', message: 'download: arquivo grande demais' })
  })

  it('metadados inválidos viram falha', async () => {
    rede.em('GET', `${API}/files/b1`, json({ id: 'b1' }))
    expect((await erroDe(cliente.baixarBackup('b1'))).tipo).toBe('falha')
  })
})
