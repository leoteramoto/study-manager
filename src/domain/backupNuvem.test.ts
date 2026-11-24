import { describe, expect, it } from 'vitest'
import type { ResumoBackup } from './backup'
import {
  aoConectar,
  aoDesconectar,
  aoEnviar,
  aoFalhar,
  aoGatilho,
  aoRestaurar,
  aoSuspender,
  APP_PROPERTIES_PASTA,
  appPropertiesDoBackup,
  type ArquivoDrive,
  backupDoDia,
  type BackupNuvem,
  backupsParaLixeira,
  consultaBackups,
  consultaPasta,
  diaDoBackupNuvem,
  envioSuspenso,
  ESCOPO_DRIVE,
  escaparConsulta,
  type EstadoNuvem,
  estadoInicialNuvem,
  indicadorCabecalho,
  interpretarArquivoDrive,
  interpretarBackupsDaPasta,
  interpretarEmail,
  interpretarListaArquivos,
  interpretarRespostaToken,
  MARGEM_EXPIRACAO_TOKEN_MS,
  MENSAGEM_SUSPENSAO,
  MIME_BACKUP,
  MIME_PASTA,
  nomeArquivoNuvem,
  referenciaDoDrive,
  tamanhoNuvemAceito,
  tokenValido,
  ultimoBackupConsiderado,
  urlSessaoUploadValida,
} from './backupNuvem'

const AGORA = new Date('2026-11-23T15:00:00.000Z')

const RESUMO: ResumoBackup = {
  exportadoEm: '2026-11-23T15:00:00.000Z',
  objetivos: 2,
  materias: 5,
  registros: 40,
  registrosExcluidos: 3,
}

/** Arquivo do Drive já validado, com a marca de backup do dia. */
function arquivoBackup(
  id: string,
  dia: string,
  extra: Partial<ArquivoDrive> = {},
  resumo: ResumoBackup = RESUMO,
): ArquivoDrive {
  return {
    id,
    name: nomeArquivoNuvem(dia),
    mimeType: MIME_BACKUP,
    modifiedTime: `${dia}T12:00:00.000Z`,
    size: 1000,
    appProperties: appPropertiesDoBackup(dia, resumo),
    ...extra,
  }
}

function backup(id: string, dia: string, extra: Partial<BackupNuvem> = {}): BackupNuvem {
  return {
    id,
    nome: nomeArquivoNuvem(dia),
    dia,
    modificadoEm: `${dia}T12:00:00.000Z`,
    tamanhoBytes: 1000,
    resumo: null,
    ...extra,
  }
}

function conectado(extra: Partial<EstadoNuvem> = {}): EstadoNuvem {
  return {
    ...estadoInicialNuvem(),
    conectado: true,
    email: 'pessoa@example.com',
    pastaId: 'pasta1',
    ...extra,
  }
}

describe('nomes e marcas', () => {
  it('usa o dia no fuso configurado', () => {
    // 01:30 UTC de 24/11 ainda é 23/11 em Brasília e em Manaus.
    const madrugada = new Date('2026-11-24T01:30:00.000Z')
    expect(diaDoBackupNuvem(madrugada, 'America/Sao_Paulo')).toBe('2026-11-23')
    expect(diaDoBackupNuvem(madrugada, 'UTC')).toBe('2026-11-24')
  })

  it('gera um nome por dia', () => {
    expect(nomeArquivoNuvem('2026-11-23')).toBe('study-manager-backup-2026-11-23.json')
  })

  it('grava a marca e o resumo como texto', () => {
    expect(appPropertiesDoBackup('2026-11-23', RESUMO)).toEqual({
      studyManager: 'backup',
      dia: '2026-11-23',
      exportadoEm: '2026-11-23T15:00:00.000Z',
      objetivos: '2',
      materias: '5',
      registros: '40',
      registrosExcluidos: '3',
    })
    expect(APP_PROPERTIES_PASTA).toEqual({ studyManager: 'pasta' })
  })

  it('cada propriedade cabe no limite de 124 bytes do Drive', () => {
    for (const [chave, valor] of Object.entries(appPropertiesDoBackup('2026-11-23', RESUMO))) {
      expect(new TextEncoder().encode(chave + valor).length).toBeLessThanOrEqual(124)
    }
  })
})

describe('consultas', () => {
  it('escapa aspas e barras invertidas', () => {
    expect(escaparConsulta("a'b\\c")).toBe("a\\'b\\\\c")
  })

  it('procura a pasta pela marca, fora da lixeira', () => {
    expect(consultaPasta()).toBe(
      `mimeType = '${MIME_PASTA}' and appProperties has { key='studyManager' and value='pasta' } and trashed = false`,
    )
  })

  it('procura os backups dentro da pasta', () => {
    expect(consultaBackups("abc'1")).toBe(
      "'abc\\'1' in parents and appProperties has { key='studyManager' and value='backup' } and trashed = false",
    )
  })
})

describe('arquivos da API', () => {
  const bruto = {
    id: 'abc_DEF-123',
    name: 'study-manager-backup-2026-11-23.json',
    mimeType: MIME_BACKUP,
    modifiedTime: '2026-11-23T12:00:00.000Z',
    size: '2048',
    appProperties: { studyManager: 'backup' },
    campoNovo: 'ignorado',
  }

  it('aceita um arquivo válido e converte o tamanho', () => {
    expect(interpretarArquivoDrive(bruto)).toEqual({
      id: 'abc_DEF-123',
      name: 'study-manager-backup-2026-11-23.json',
      mimeType: MIME_BACKUP,
      modifiedTime: '2026-11-23T12:00:00.000Z',
      size: 2048,
      appProperties: { studyManager: 'backup' },
    })
  })

  it('aceita pasta sem tamanho e sem appProperties', () => {
    const pasta = interpretarArquivoDrive({
      id: 'pasta1',
      name: 'Study Manager',
      mimeType: MIME_PASTA,
      modifiedTime: '2026-11-23T12:00:00.000Z',
    })
    expect(pasta).not.toBeNull()
    expect(pasta?.size).toBeUndefined()
    expect(pasta?.appProperties).toBeUndefined()
  })

  it.each([
    ['id com caracteres estranhos', { ...bruto, id: '../etc' }],
    ['id vazio', { ...bruto, id: '' }],
    ['data inválida', { ...bruto, modifiedTime: 'ontem' }],
    ['tamanho negativo', { ...bruto, size: '-1' }],
    ['tamanho numérico em vez de texto', { ...bruto, size: 10 }],
    ['appProperties com valor não textual', { ...bruto, appProperties: { a: 1 } }],
    ['sem nome', { ...bruto, name: undefined }],
    ['nulo', null],
    ['texto', 'arquivo'],
  ])('recusa %s', (_caso, resposta) => {
    expect(interpretarArquivoDrive(resposta)).toBeNull()
  })

  it('descarta itens inválidos da lista, um a um', () => {
    const pagina = interpretarListaArquivos({
      files: [bruto, { id: 'x' }, 42],
      nextPageToken: 'proxima',
    })
    expect(pagina?.arquivos.map((a) => a.id)).toEqual(['abc_DEF-123'])
    expect(pagina?.proximaPagina).toBe('proxima')
  })

  it('lista sem próxima página', () => {
    expect(interpretarListaArquivos({ files: [] })).toEqual({ arquivos: [], proximaPagina: null })
  })

  it.each([[null], [{}], [{ files: 'x' }], [{ files: [], nextPageToken: '' }]])(
    'recusa resposta que não é lista: %j',
    (resposta) => {
      expect(interpretarListaArquivos(resposta)).toBeNull()
    },
  )

  it('lê o e-mail da conta', () => {
    expect(
      interpretarEmail({ user: { emailAddress: 'pessoa@example.com', displayName: 'P' } }),
    ).toBe('pessoa@example.com')
    expect(interpretarEmail({ user: { emailAddress: 'sem arroba' } })).toBeNull()
    expect(interpretarEmail({ user: {} })).toBeNull()
    expect(interpretarEmail(undefined)).toBeNull()
  })

  it('confere o tamanho antes de baixar', () => {
    const arquivo = arquivoBackup('a', '2026-11-23')
    expect(tamanhoNuvemAceito(arquivo)).toBe(true)
    expect(tamanhoNuvemAceito({ ...arquivo, size: 50 * 1024 * 1024 + 1 })).toBe(false)
    expect(tamanhoNuvemAceito({ ...arquivo, size: undefined })).toBe(false)
  })

  it('só aceita sessão de upload no endpoint do Drive', () => {
    expect(
      urlSessaoUploadValida(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x',
      ),
    ).toBe(true)
    expect(
      urlSessaoUploadValida('https://www.googleapis.com/upload/drive/v3/files/abc?upload_id=x'),
    ).toBe(true)
    expect(urlSessaoUploadValida('http://www.googleapis.com/upload/drive/v3/files')).toBe(false)
    expect(urlSessaoUploadValida('https://evil.example/upload/drive/v3/files')).toBe(false)
    expect(urlSessaoUploadValida('https://www.googleapis.com/drive/v3/files')).toBe(false)
    expect(urlSessaoUploadValida('não é url')).toBe(false)
    expect(urlSessaoUploadValida(null)).toBe(false)
  })
})

describe('token', () => {
  const resposta = { access_token: 'ya29.abc', expires_in: 3599, scope: ESCOPO_DRIVE }

  it('aceita token com o escopo drive.file', () => {
    expect(interpretarRespostaToken(resposta, AGORA)).toEqual({
      token: 'ya29.abc',
      expiraEm: AGORA.getTime() + 3_599_000,
    })
  })

  it('aceita expires_in em texto e escopos extras', () => {
    expect(
      interpretarRespostaToken(
        { ...resposta, expires_in: '3600', scope: `openid ${ESCOPO_DRIVE}` },
        AGORA,
      )?.expiraEm,
    ).toBe(AGORA.getTime() + 3_600_000)
  })

  it.each([
    ['escopo negado', { ...resposta, scope: 'openid' }],
    ['erro do Google', { error: 'access_denied' }],
    ['token vazio', { ...resposta, access_token: '' }],
    ['token com espaço', { ...resposta, access_token: 'a b' }],
    ['validade zero', { ...resposta, expires_in: 0 }],
    ['validade em texto inválido', { ...resposta, expires_in: '1h' }],
    ['nulo', null],
  ])('recusa %s', (_caso, valor) => {
    expect(interpretarRespostaToken(valor, AGORA)).toBeNull()
  })

  it('trata o token como vencido antes do prazo, pela margem', () => {
    const token = { token: 't', expiraEm: AGORA.getTime() + MARGEM_EXPIRACAO_TOKEN_MS + 1 }
    expect(tokenValido(token, AGORA)).toBe(true)
    expect(
      tokenValido({ ...token, expiraEm: AGORA.getTime() + MARGEM_EXPIRACAO_TOKEN_MS }, AGORA),
    ).toBe(false)
    expect(tokenValido(null, AGORA)).toBe(false)
  })
})

describe('backups da pasta', () => {
  it('lista só os backups do app, do mais recente para o mais antigo', () => {
    const backups = interpretarBackupsDaPasta([
      arquivoBackup('antigo', '2026-11-20'),
      arquivoBackup('novo', '2026-11-23'),
      arquivoBackup('meio', '2026-11-22'),
      { ...arquivoBackup('sem-marca', '2026-11-23'), appProperties: undefined },
      { ...arquivoBackup('outra-marca', '2026-11-23'), appProperties: { studyManager: 'pasta' } },
      {
        ...arquivoBackup('dia-invalido', '2026-11-23'),
        appProperties: { studyManager: 'backup', dia: '2026-02-30' },
      },
      { ...arquivoBackup('pasta', '2026-11-23'), mimeType: MIME_PASTA },
    ])
    expect(backups.map((b) => b.id)).toEqual(['novo', 'meio', 'antigo'])
  })

  it('no mesmo dia, ordena pela modificação e depois pelo id', () => {
    const backups = interpretarBackupsDaPasta([
      arquivoBackup('b', '2026-11-23', { modifiedTime: '2026-11-23T10:00:00.000Z' }),
      arquivoBackup('c', '2026-11-23', { modifiedTime: '2026-11-23T11:00:00.000Z' }),
      arquivoBackup('a', '2026-11-23', { modifiedTime: '2026-11-23T10:00:00.000Z' }),
    ])
    expect(backups.map((b) => b.id)).toEqual(['c', 'a', 'b'])
  })

  it('lê o resumo do appProperties', () => {
    const [primeiro] = interpretarBackupsDaPasta([arquivoBackup('a', '2026-11-23')])
    expect(primeiro).toEqual({
      id: 'a',
      nome: 'study-manager-backup-2026-11-23.json',
      dia: '2026-11-23',
      modificadoEm: '2026-11-23T12:00:00.000Z',
      tamanhoBytes: 1000,
      resumo: {
        exportadoEm: '2026-11-23T15:00:00.000Z',
        objetivos: 2,
        materias: 5,
        registros: 40,
        registrosExcluidos: 3,
      },
    })
  })

  it.each([
    ['contagem negativa', { registros: '-1' }],
    ['contagem com zero à esquerda', { registros: '040' }],
    ['contagem decimal', { registros: '4.5' }],
    ['contagem gigante', { registros: '1234567890' }],
    ['mais excluídos que registros', { registrosExcluidos: '41' }],
    ['data de exportação inválida', { exportadoEm: 'ontem' }],
    ['campo faltando', { materias: undefined }],
  ])('resumo inválido (%s) vira null, mas o backup continua na lista', (_caso, mudanca) => {
    const props: Record<string, string | undefined> = {
      ...appPropertiesDoBackup('2026-11-23', RESUMO),
      ...mudanca,
    }
    const limpas = Object.fromEntries(
      Object.entries(props).filter((par): par is [string, string] => par[1] !== undefined),
    )
    const [primeiro] = interpretarBackupsDaPasta([
      { ...arquivoBackup('a', '2026-11-23'), appProperties: limpas },
    ])
    expect(primeiro?.resumo).toBeNull()
    expect(primeiro?.dia).toBe('2026-11-23')
  })

  it('sem tamanho nos metadados, o tamanho fica null', () => {
    const [primeiro] = interpretarBackupsDaPasta([
      arquivoBackup('a', '2026-11-23', { size: undefined }),
    ])
    expect(primeiro?.tamanhoBytes).toBeNull()
  })

  it('acha o arquivo do dia para sobrescrever', () => {
    const lista = [
      backup('ontem', '2026-11-22'),
      backup('hoje-velho', '2026-11-23', { modificadoEm: '2026-11-23T08:00:00.000Z' }),
      backup('hoje', '2026-11-23', { modificadoEm: '2026-11-23T09:00:00.000Z' }),
    ]
    expect(backupDoDia(lista, '2026-11-23')?.id).toBe('hoje')
    expect(backupDoDia(lista, '2026-11-24')).toBeNull()
  })
})

describe('retenção (RN46)', () => {
  function dias(quantidade: number): BackupNuvem[] {
    return Array.from({ length: quantidade }, (_, i) => {
      const dia = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)
      return backup(`d${i + 1}`, dia)
    })
  }

  it('com 30 dias, nada vai para a lixeira', () => {
    expect(backupsParaLixeira(dias(30))).toEqual([])
  })

  it('no 31º dia, o mais antigo vai para a lixeira', () => {
    expect(backupsParaLixeira(dias(31)).map((b) => b.id)).toEqual(['d1'])
  })

  it('conta dias distintos: duplicados do mesmo dia ficam juntos', () => {
    const lista = [...dias(30), backup('d30-copia', '2026-10-30')]
    expect(backupsParaLixeira(lista)).toEqual([])
    const comAntigo = [backup('velho-a', '2026-09-01'), backup('velho-b', '2026-09-01'), ...lista]
    expect(backupsParaLixeira(comAntigo).map((b) => b.id)).toEqual(['velho-a', 'velho-b'])
  })

  it('conta o dia recém-enviado, mesmo fora da lista', () => {
    // 30 dias na lista + o dia enviado = 31: o mais antigo sai.
    expect(backupsParaLixeira(dias(30), 30, '2026-11-15').map((b) => b.id)).toEqual(['d1'])
    // O dia enviado já na lista não conta duas vezes.
    expect(backupsParaLixeira(dias(30), 30, '2026-10-30')).toEqual([])
  })

  it('aceita outro limite e lista vazia', () => {
    expect(backupsParaLixeira(dias(3), 1).map((b) => b.id)).toEqual(['d1', 'd2'])
    expect(backupsParaLixeira([])).toEqual([])
  })
})

describe('referência do Drive (RN45)', () => {
  const resumo = (registros: number) => ({ ...RESUMO, registros, registrosExcluidos: 0 })

  it('usa a contagem do backup mais recente', () => {
    const lista = [
      backup('velho', '2026-11-20', { resumo: resumo(100) }),
      backup('novo', '2026-11-23', { resumo: resumo(40) }),
    ]
    expect(referenciaDoDrive(lista)).toBe(40)
  })

  it('sem resumo válido no mais recente, fica sem referência (não usa os antigos)', () => {
    const lista = [
      backup('velho', '2026-11-20', { resumo: resumo(100) }),
      backup('novo', '2026-11-23', { resumo: null }),
    ]
    expect(referenciaDoDrive(lista)).toBeNull()
  })

  it('sem backups, sem referência', () => {
    expect(referenciaDoDrive([])).toBeNull()
  })

  it('de ponta a ponta: appProperties inválido não vira referência', () => {
    const backups = interpretarBackupsDaPasta([
      {
        ...arquivoBackup('a', '2026-11-23'),
        appProperties: { ...appPropertiesDoBackup('2026-11-23', RESUMO), registros: 'muitos' },
      },
    ])
    expect(referenciaDoDrive(backups)).toBeNull()
    expect(referenciaDoDrive(interpretarBackupsDaPasta([arquivoBackup('a', '2026-11-23')]))).toBe(
      40,
    )
  })
})

describe('proteção do envio (RN45)', () => {
  it('suspende quando há menos registros que a referência', () => {
    expect(envioSuspenso(39, 40)).toBe(true)
  })

  it('libera com a mesma contagem, com mais registros ou sem referência', () => {
    expect(envioSuspenso(40, 40)).toBe(false)
    expect(envioSuspenso(41, 40)).toBe(false)
    expect(envioSuspenso(0, null)).toBe(false)
  })
})

describe('estado da nuvem', () => {
  it('começa desconectado e ok', () => {
    expect(estadoInicialNuvem()).toEqual({
      id: 'drive',
      conectado: false,
      email: null,
      pastaId: null,
      ultimoEnvioEm: null,
      ultimoGatilhoEm: null,
      situacao: 'ok',
      mensagemErro: null,
      motivoErro: null,
      registrosUltimoEnvio: null,
    })
  })

  describe('conectar', () => {
    it('usa a referência do Drive quando não há referência local', () => {
      const estado = aoConectar(estadoInicialNuvem(), {
        email: 'pessoa@example.com',
        pastaId: 'p1',
        referenciaDrive: 40,
      })
      expect(estado).toMatchObject({
        conectado: true,
        email: 'pessoa@example.com',
        pastaId: 'p1',
        registrosUltimoEnvio: 40,
      })
    })

    it('mantém a referência local quando ela existe', () => {
      const estado = aoConectar(
        { ...estadoInicialNuvem(), registrosUltimoEnvio: 10 },
        { email: null, pastaId: 'p1', referenciaDrive: 40 },
      )
      expect(estado.registrosUltimoEnvio).toBe(10)
    })

    it('sem referência no Drive, fica sem referência', () => {
      const estado = aoConectar(estadoInicialNuvem(), {
        email: null,
        pastaId: 'p1',
        referenciaDrive: null,
      })
      expect(estado.registrosUltimoEnvio).toBeNull()
    })
  })

  it('desconectar limpa tudo', () => {
    expect(aoDesconectar()).toEqual(estadoInicialNuvem())
  })

  describe('gatilho', () => {
    it('desconectado, não muda nada', () => {
      const estado = estadoInicialNuvem()
      expect(aoGatilho(estado, AGORA)).toBe(estado)
    })

    it('fica pendente na hora e limpa erro comum', () => {
      const estado = aoGatilho(aoFalhar(conectado(), 'falhou'), AGORA)
      expect(estado).toMatchObject({
        situacao: 'pendente',
        mensagemErro: null,
        motivoErro: null,
        ultimoGatilhoEm: AGORA.toISOString(),
      })
    })

    it('com envio suspenso, a suspensão continua visível', () => {
      const estado = aoGatilho(aoSuspender(conectado()), AGORA)
      expect(estado).toMatchObject({
        situacao: 'erro',
        motivoErro: 'suspenso',
        mensagemErro: MENSAGEM_SUSPENSAO,
        ultimoGatilhoEm: AGORA.toISOString(),
      })
    })
  })

  describe('envio com sucesso', () => {
    const inicio = new Date('2026-11-23T15:00:00.000Z')
    const fim = new Date('2026-11-23T15:00:03.000Z')
    const dados = { iniciadoEm: inicio, concluidoEm: fim, totalRegistros: 41, pastaId: 'p2' }

    it('fica ok e atualiza último envio, referência e pasta', () => {
      const anterior = conectado({
        situacao: 'pendente',
        ultimoGatilhoEm: '2026-11-23T14:59:58.000Z',
      })
      expect(aoEnviar(anterior, dados)).toMatchObject({
        situacao: 'ok',
        ultimoEnvioEm: fim.toISOString(),
        registrosUltimoEnvio: 41,
        pastaId: 'p2',
        mensagemErro: null,
        motivoErro: null,
      })
    })

    it('com gatilho depois do início, continua pendente', () => {
      const anterior = conectado({
        situacao: 'pendente',
        ultimoGatilhoEm: '2026-11-23T15:00:01.000Z',
      })
      expect(aoEnviar(anterior, dados).situacao).toBe('pendente')
      // Gatilho no mesmo milissegundo do início também conta como posterior.
      expect(aoEnviar({ ...anterior, ultimoGatilhoEm: inicio.toISOString() }, dados).situacao).toBe(
        'pendente',
      )
    })

    it('sem gatilho registrado (envio manual), fica ok', () => {
      expect(aoEnviar(conectado(), dados).situacao).toBe('ok')
    })

    it('envio confirmado depois da suspensão limpa a suspensão', () => {
      expect(aoEnviar(aoSuspender(conectado()), dados)).toMatchObject({
        situacao: 'ok',
        motivoErro: null,
      })
    })
  })

  it('desconectado, envio, suspensão e falha não mudam o estado', () => {
    const estado = estadoInicialNuvem()
    const dados = { iniciadoEm: AGORA, concluidoEm: AGORA, totalRegistros: 1, pastaId: 'p' }
    expect(aoEnviar(estado, dados)).toBe(estado)
    expect(aoSuspender(estado)).toBe(estado)
    expect(aoFalhar(estado, 'x')).toBe(estado)
  })

  it('suspensão e falha guardam motivo e mensagem', () => {
    expect(aoSuspender(conectado())).toMatchObject({
      situacao: 'erro',
      motivoErro: 'suspenso',
      mensagemErro: MENSAGEM_SUSPENSAO,
    })
    expect(aoFalhar(conectado(), 'Sem permissão.')).toMatchObject({
      situacao: 'erro',
      motivoErro: 'falha',
      mensagemErro: 'Sem permissão.',
    })
  })

  describe('restauração', () => {
    it('conectado: referência dos dados restaurados, pendente e sem suspensão', () => {
      const estado = aoRestaurar(aoSuspender(conectado({ registrosUltimoEnvio: 40 })), 25, AGORA)
      expect(estado).toMatchObject({
        registrosUltimoEnvio: 25,
        situacao: 'pendente',
        motivoErro: null,
        mensagemErro: null,
        ultimoGatilhoEm: AGORA.toISOString(),
      })
      // Com a nova referência, o envio dos dados restaurados não é suspenso.
      expect(envioSuspenso(25, estado.registrosUltimoEnvio)).toBe(false)
    })

    it('desconectado: só atualiza a referência', () => {
      expect(aoRestaurar(estadoInicialNuvem(), 25, AGORA)).toEqual({
        ...estadoInicialNuvem(),
        registrosUltimoEnvio: 25,
      })
    })
  })

  describe('indicador do cabeçalho', () => {
    it('desconectado, nenhum', () => {
      const suspensoSemConexao: EstadoNuvem = {
        ...estadoInicialNuvem(),
        situacao: 'erro',
        motivoErro: 'suspenso',
      }
      expect(indicadorCabecalho(suspensoSemConexao, false)).toBeNull()
    })

    it('suspensão tem prioridade, com ou sem token', () => {
      const suspenso = aoSuspender(conectado())
      expect(indicadorCabecalho(suspenso, false)).toBe('suspenso')
      expect(indicadorCabecalho(suspenso, true)).toBe('suspenso')
    })

    it('reconectar só com envio pendente e sem token', () => {
      const pendente = conectado({ situacao: 'pendente' })
      expect(indicadorCabecalho(pendente, false)).toBe('reconectar')
      expect(indicadorCabecalho(pendente, true)).toBeNull()
      expect(indicadorCabecalho(conectado(), false)).toBeNull()
      expect(indicadorCabecalho(aoFalhar(conectado(), 'x'), false)).toBeNull()
    })
  })
})

describe('lembrete (RN50)', () => {
  const manual = '2026-11-10T10:00:00.000Z'
  const nuvem = '2026-11-20T10:00:00.000Z'

  it('usa o mais recente dos dois', () => {
    expect(ultimoBackupConsiderado(manual, nuvem)).toBe(nuvem)
    expect(ultimoBackupConsiderado(nuvem, manual)).toBe(nuvem)
  })

  it('com um só, usa ele; sem nenhum, null', () => {
    expect(ultimoBackupConsiderado(manual, null)).toBe(manual)
    expect(ultimoBackupConsiderado(null, nuvem)).toBe(nuvem)
    expect(ultimoBackupConsiderado(null, null)).toBeNull()
  })
})
