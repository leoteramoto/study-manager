import { describe, expect, it } from 'vitest'
import {
  calcularChecksum,
  type ContextoBackup,
  type DadosBackup,
  MENSAGENS_BACKUP,
  migrarDados,
  montarArquivoBackup,
  nomeArquivoBackup,
  resumirBackup,
  TAMANHO_MAXIMO_BACKUP_BYTES,
  tamanhoBackupAceito,
  validarArquivoBackup,
  VERSAO_SCHEMA,
  verificarIntegridade,
} from './backup'

const CONTEXTO: ContextoBackup = {
  idsSons: ['sino', 'digital', 'suave'],
  fusoValido: (fuso) => ['America/Sao_Paulo', 'America/Manaus'].includes(fuso),
}

const ID = {
  pf: '11111111-1111-4111-8111-111111111111',
  cf: '22222222-2222-4222-8222-222222222222',
  matPf: '33333333-3333-4333-8333-333333333333',
  matCf: '44444444-4444-4444-8444-444444444444',
  portArq: '55555555-5555-4555-8555-555555555555',
  reg1: '66666666-6666-4666-8666-666666666666',
  reg2: '77777777-7777-4777-8777-777777777777',
  reg3: '88888888-8888-4888-8888-888888888888',
  outro: '99999999-9999-4999-8999-999999999999',
}

const T = '2026-11-01T12:00:00.000Z'

/** Elemento da lista, falhando o teste se ele não existir. */
function item<V>(lista: V[], indice: number): V {
  const valor = lista[indice]
  if (valor === undefined) throw new Error(`item ${indice} inexistente`)
  return valor
}

/** Base com arquivados, registro excluído, manual e do cronômetro. */
function dadosValidos(): DadosBackup {
  return {
    objetivos: [
      {
        id: ID.pf,
        nome: 'Polícia Federal',
        sigla: 'PF',
        ordem: 1,
        ativo: true,
        criadoEm: T,
        atualizadoEm: T,
      },
      {
        id: ID.cf,
        nome: 'Carreira Fiscal',
        sigla: 'CF',
        ordem: 2,
        ativo: true,
        criadoEm: T,
        atualizadoEm: T,
      },
    ],
    materias: [
      {
        id: ID.matPf,
        objetivoId: ID.pf,
        nome: 'Matemática',
        codigo: 'Matemática-PF',
        descricao: 'Raciocínio lógico incluso',
        cor: '#4f46e5',
        ordem: 1,
        ativo: true,
        criadoEm: T,
        atualizadoEm: T,
      },
      {
        id: ID.matCf,
        objetivoId: ID.cf,
        nome: 'Matemática',
        codigo: 'Matemática-CF',
        descricao: null,
        cor: '#2563eb',
        ordem: 1,
        ativo: true,
        criadoEm: T,
        atualizadoEm: T,
      },
      {
        id: ID.portArq,
        objetivoId: ID.pf,
        nome: 'Português',
        codigo: 'Português-PF',
        descricao: null,
        cor: '#0891b2',
        ordem: 2,
        ativo: false,
        criadoEm: T,
        atualizadoEm: T,
      },
    ],
    planejamento: [
      { materiaId: ID.matPf, peso: 2, adicionadoEm: T },
      { materiaId: ID.matCf, peso: 1.5, adicionadoEm: T },
    ],
    registros: [
      {
        id: ID.reg1,
        materiaId: ID.matPf,
        objetivoId: ID.pf,
        data: '2026-11-01',
        inicio: '2026-11-01T12:00:00.000Z',
        fim: '2026-11-01T12:45:00.000Z',
        duracaoSeg: 2700,
        duracaoPlanejadaMin: 60,
        origem: 'cronometro',
        tipoEncerramento: 'antecipado',
        excluidoEm: null,
        criadoEm: T,
        atualizadoEm: T,
      },
      {
        id: ID.reg2,
        materiaId: ID.portArq,
        objetivoId: ID.pf,
        data: '2026-10-15',
        inicio: null,
        fim: null,
        duracaoSeg: 1800,
        duracaoPlanejadaMin: null,
        origem: 'manual',
        tipoEncerramento: 'manual',
        excluidoEm: null,
        criadoEm: T,
        atualizadoEm: T,
      },
      {
        id: ID.reg3,
        materiaId: ID.matCf,
        objetivoId: ID.cf,
        data: '2026-11-02',
        inicio: null,
        fim: null,
        duracaoSeg: 600,
        duracaoPlanejadaMin: null,
        origem: 'manual',
        tipoEncerramento: 'manual',
        excluidoEm: '2026-11-03T10:00:00.000Z',
        criadoEm: T,
        atualizadoEm: '2026-11-03T10:00:00.000Z',
      },
    ],
    configuracoes: {
      id: 'app',
      metaMensalHoras: 100,
      fusoHorario: 'America/Sao_Paulo',
      somAtivo: true,
      somId: 'sino',
      volume: 0.7,
      notificacoesAtivas: false,
      ultimoBackupEm: null,
      schemaVersion: 1,
    },
  }
}

/** Monta o texto de um arquivo com checksum correto para os dados informados. */
async function arquivoCom(dados: unknown, extras: Record<string, unknown> = {}): Promise<string> {
  const envelope = {
    app: 'study-manager',
    schemaVersion: VERSAO_SCHEMA,
    exportadoEm: T,
    checksum: await calcularChecksum(JSON.stringify(dados)),
    dados,
    ...extras,
  }
  return JSON.stringify(envelope, null, 2)
}

async function erroDe(texto: string): Promise<string> {
  const resultado = await validarArquivoBackup(texto, CONTEXTO)
  if (resultado.ok) throw new Error('era para falhar')
  return resultado.erro
}

/** Aplica uma alteração em uma cópia dos dados válidos e devolve o erro da validação. */
async function erroAoAlterar(alterar: (dados: DadosBackup) => void): Promise<string> {
  const dados = dadosValidos()
  alterar(dados)
  return erroDe(await arquivoCom(dados))
}

describe('calcularChecksum', () => {
  it('é o SHA-256 em hexadecimal', async () => {
    expect(await calcularChecksum('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('nomeArquivoBackup', () => {
  it('usa data e hora no fuso configurado', () => {
    const agora = new Date('2026-11-22T02:30:00.000Z')
    expect(nomeArquivoBackup(agora, 'America/Sao_Paulo')).toBe(
      'study-manager-backup-2026-11-21-2330.json',
    )
    expect(nomeArquivoBackup(agora, 'UTC')).toBe('study-manager-backup-2026-11-22-0230.json')
  })
})

describe('montarArquivoBackup (RN32)', () => {
  const agora = new Date('2026-11-22T15:04:00.000Z')

  it('gera o envelope no formato da especificação, indentado', async () => {
    const arquivo = await montarArquivoBackup(dadosValidos(), agora, 'America/Sao_Paulo')
    expect(arquivo.nome).toBe('study-manager-backup-2026-11-22-1204.json')
    expect(arquivo.exportadoEm).toBe(agora.toISOString())
    expect(arquivo.conteudo).toContain('\n  "app": "study-manager"')
    const envelope = JSON.parse(arquivo.conteudo) as Record<string, unknown>
    expect(Object.keys(envelope)).toEqual([
      'app',
      'schemaVersion',
      'exportadoEm',
      'checksum',
      'dados',
    ])
    expect(envelope.schemaVersion).toBe(VERSAO_SCHEMA)
    expect(envelope.checksum).toBe(await calcularChecksum(JSON.stringify(envelope.dados)))
  })

  it('grava ultimoBackupEm igual ao instante da exportação, sem alterar a entrada', async () => {
    const dados = dadosValidos()
    const arquivo = await montarArquivoBackup(dados, agora, 'UTC')
    const envelope = JSON.parse(arquivo.conteudo) as { dados: DadosBackup }
    expect(envelope.dados.configuracoes.ultimoBackupEm).toBe(agora.toISOString())
    expect(dados.configuracoes.ultimoBackupEm).toBeNull()
  })

  it('ida e volta reproduz os dados exatamente, com arquivados e excluídos', async () => {
    const dados = dadosValidos()
    const arquivo = await montarArquivoBackup(dados, agora, 'UTC')
    const resultado = await validarArquivoBackup(arquivo.conteudo, CONTEXTO)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.valor.dados).toEqual({
      ...dados,
      configuracoes: { ...dados.configuracoes, ultimoBackupEm: agora.toISOString() },
    })
    expect(resultado.valor.exportadoEm).toBe(agora.toISOString())
    expect(resultado.valor.schemaVersionOriginal).toBe(1)
  })
})

describe('tamanhoBackupAceito', () => {
  it('aceita até 50 MB', () => {
    expect(tamanhoBackupAceito(TAMANHO_MAXIMO_BACKUP_BYTES)).toBe(true)
    expect(tamanhoBackupAceito(TAMANHO_MAXIMO_BACKUP_BYTES + 1)).toBe(false)
  })
})

describe('validarArquivoBackup: leitura e envelope', () => {
  it('rejeita JSON inválido com mensagem amigável', async () => {
    expect(await erroDe('{"app": "study-manager",')).toBe(MENSAGENS_BACKUP.json)
  })

  it('rejeita arquivo de outro app', async () => {
    expect(await erroDe('[]')).toBe(MENSAGENS_BACKUP.outroApp)
    expect(await erroDe('null')).toBe(MENSAGENS_BACKUP.outroApp)
    expect(await erroDe('{"app": "outro"}')).toBe(MENSAGENS_BACKUP.outroApp)
  })

  it('rejeita envelope fora do formato', async () => {
    expect(await erroDe(await arquivoCom(dadosValidos(), { extra: 1 }))).toMatch(
      /não é um backup válido/,
    )
    expect(await erroDe(await arquivoCom(dadosValidos(), { checksum: 'abc' }))).toBe(
      'O arquivo não é um backup válido (campo checksum).',
    )
    expect(await erroDe(await arquivoCom([1, 2]))).toBe(
      'O arquivo não é um backup válido (campo dados).',
    )
  })
})

describe('validarArquivoBackup: checksum (RF09)', () => {
  it('rejeita o arquivo com 1 byte alterado dentro de "dados"', async () => {
    const arquivo = await montarArquivoBackup(dadosValidos(), new Date(T), 'UTC')
    const alterado = arquivo.conteudo.replace('"duracaoSeg": 2700', '"duracaoSeg": 2701')
    expect(alterado).not.toBe(arquivo.conteudo)
    expect(alterado.length).toBe(arquivo.conteudo.length)
    expect(await erroDe(alterado)).toBe(MENSAGENS_BACKUP.checksum)
  })

  it('não depende da indentação do arquivo', async () => {
    const arquivo = await montarArquivoBackup(dadosValidos(), new Date(T), 'UTC')
    const compacto = JSON.stringify(JSON.parse(arquivo.conteudo))
    expect((await validarArquivoBackup(compacto, CONTEXTO)).ok).toBe(true)
  })
})

describe('validarArquivoBackup: versão (RN33, passo 4)', () => {
  it('rejeita versão maior que a atual, mesmo com checksum correto', async () => {
    const texto = await arquivoCom(dadosValidos(), { schemaVersion: VERSAO_SCHEMA + 1 })
    expect(await erroDe(texto)).toMatch(/versão mais nova do app/)
  })

  it('migra versões anteriores antes de validar o conteúdo', async () => {
    const { configuracoes, ...resto } = dadosValidos()
    const antigo = { ...resto, config: configuracoes }
    const texto = await arquivoCom(antigo, { schemaVersion: 1 })
    const migracoes = {
      1: (dados: unknown) => {
        const { config, ...demais } = dados as typeof antigo
        return { ...demais, configuracoes: { ...config, schemaVersion: 2 } }
      },
    }
    const resultado = await validarArquivoBackup(texto, CONTEXTO, 2, migracoes)
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.valor.schemaVersionOriginal).toBe(1)
      expect(resultado.valor.dados.configuracoes.schemaVersion).toBe(2)
    }
  })

  it('rejeita quando falta uma migração ou ela devolve algo inválido', async () => {
    const texto = await arquivoCom(dadosValidos())
    const semMigracao = await validarArquivoBackup(texto, CONTEXTO, 2, {})
    expect(semMigracao).toEqual({ ok: false, erro: 'Não há como converter backups do formato 1.' })
    const invalida = await validarArquivoBackup(texto, CONTEXTO, 2, { 1: () => null })
    expect(invalida).toEqual({ ok: false, erro: 'O arquivo não é um backup válido.' })
  })
})

describe('migrarDados', () => {
  it('não faz nada na versão atual', () => {
    expect(migrarDados({ a: 1 }, 1, 1)).toEqual({ ok: true, valor: { a: 1 } })
  })

  it('aplica as migrações em sequência', () => {
    const migracoes = { 1: (d: unknown) => [d, 1], 2: (d: unknown) => [d, 2] }
    expect(migrarDados('x', 1, 3, migracoes)).toEqual({ ok: true, valor: [['x', 1], 2] })
  })
})

describe('validarArquivoBackup: conteúdo (Zod)', () => {
  it('rejeita chaves desconhecidas em qualquer nível', async () => {
    expect(await erroAoAlterar((d) => Object.assign(d, { sessaoAtiva: [] }))).toMatch(
      /não é um backup válido/,
    )
    expect(
      await erroAoAlterar((d) => Object.assign(d.registros[0] ?? {}, { observacao: 'x' })),
    ).toBe('O arquivo não é um backup válido (campo registros[0]).')
  })

  it('rejeita data que não passa em dataValida', async () => {
    expect(
      await erroAoAlterar((d) => {
        if (d.registros[0]) d.registros[0].data = '2026-02-30'
      }),
    ).toBe('O arquivo não é um backup válido (campo registros[0].data: data inválida).')
  })

  it('rejeita duração abaixo de 60 s e ids que não são UUID', async () => {
    expect(
      await erroAoAlterar((d) => {
        if (d.registros[0]) d.registros[0].duracaoSeg = 59
      }),
    ).toBe('O arquivo não é um backup válido (campo registros[0].duracaoSeg).')
    expect(
      await erroAoAlterar((d) => {
        if (d.objetivos[0]) d.objetivos[0].id = 'abc'
      }),
    ).toBe('O arquivo não é um backup válido (campo objetivos[0].id).')
  })

  it('rejeita lançamento manual com início, término ou tempo planejado', async () => {
    expect(
      await erroAoAlterar((d) => {
        if (d.registros[1]) d.registros[1].inicio = T
      }),
    ).toBe(
      'O arquivo não é um backup válido (campo registros[1]: lançamento manual não pode ter início, término nem tempo planejado).',
    )
  })

  it('rejeita registro do cronômetro sem início e origem que não combina com o tipo', async () => {
    expect(
      await erroAoAlterar((d) => {
        if (d.registros[0]) d.registros[0].fim = null
      }),
    ).toMatch(/registro do cronômetro precisa de início/)
    expect(
      await erroAoAlterar((d) => {
        if (d.registros[0]) d.registros[0].tipoEncerramento = 'manual'
      }),
    ).toMatch(/a origem não combina com o tipo de encerramento/)
  })

  it('rejeita fuso inválido e som desconhecido', async () => {
    expect(await erroAoAlterar((d) => (d.configuracoes.fusoHorario = 'Lua/Cratera'))).toMatch(
      /fuso horário desconhecido/,
    )
    expect(await erroAoAlterar((d) => (d.configuracoes.somId = 'buzina'))).toMatch(
      /som desconhecido/,
    )
  })

  it('rejeita peso com mais de uma casa, nome com espaços sobrando, sigla e cor inválidas', async () => {
    expect(
      await erroAoAlterar((d) => {
        if (d.planejamento[0]) d.planejamento[0].peso = 1.25
      }),
    ).toMatch(/o peso tem mais de uma casa decimal/)
    expect(
      await erroAoAlterar((d) => {
        if (d.objetivos[0]) d.objetivos[0].nome = 'Polícia  Federal'
      }),
    ).toMatch(/o nome tem espaços sobrando/)
    expect(
      await erroAoAlterar((d) => {
        if (d.objetivos[0]) d.objetivos[0].sigla = 'pf'
      }),
    ).toMatch(/sigla inválida/)
    expect(
      await erroAoAlterar((d) => {
        if (d.materias[0]) d.materias[0].cor = 'red'
      }),
    ).toBe('O arquivo não é um backup válido (campo materias[0].cor).')
    expect(
      await erroAoAlterar((d) => {
        if (d.materias[0]) d.materias[0].descricao = ' texto '
      }),
    ).toMatch(/a descrição tem espaços sobrando/)
  })
})

describe('verificarIntegridade (RN33, passo 5)', () => {
  it('aceita a base válida', () => {
    expect(verificarIntegridade(dadosValidos())).toEqual([])
  })

  it('rejeita ids duplicados em qualquer tabela', () => {
    const casos: [string, (d: DadosBackup) => void][] = [
      ['objetivos', (d) => d.objetivos.push({ ...item(d.objetivos, 0), sigla: 'XX' })],
      [
        'matérias',
        (d) => d.materias.push({ ...item(d.materias, 0), nome: 'Outra', codigo: 'Outra-PF' }),
      ],
      ['planejamento', (d) => d.planejamento.push({ ...item(d.planejamento, 0) })],
      ['registros', (d) => d.registros.push({ ...item(d.registros, 0) })],
    ]
    for (const [tabela, alterar] of casos) {
      const dados = dadosValidos()
      alterar(dados)
      expect(verificarIntegridade(dados)).toContain(`Há identificadores repetidos em ${tabela}.`)
    }
  })

  it('rejeita sigla repetida sem diferenciar maiúsculas', () => {
    const dados = dadosValidos()
    dados.objetivos.push({ ...item(dados.objetivos, 0), id: ID.outro })
    expect(verificarIntegridade(dados)).toContain('A sigla "PF" aparece mais de uma vez.')
  })

  it('rejeita matéria de objetivo inexistente e código que não bate com nome e sigla', () => {
    const dados = dadosValidos()
    item(dados.materias, 0).objetivoId = ID.outro
    item(dados.materias, 1).codigo = 'Matemática-PF2'
    const problemas = verificarIntegridade(dados)
    expect(problemas).toContain('A matéria "Matemática-PF" aponta para um objetivo que não existe.')
    expect(problemas).toContain(
      'O código "Matemática-PF2" não corresponde ao nome e à sigla da matéria.',
    )
  })

  it('rejeita código repetido', () => {
    const dados = dadosValidos()
    dados.materias.push({
      ...item(dados.materias, 0),
      id: ID.outro,
      nome: 'matemática',
      codigo: 'matemática-PF',
    })
    expect(verificarIntegridade(dados)).toContain(
      'O código "matemática-pf" aparece mais de uma vez.',
    )
  })

  it('rejeita planejamento com matéria inexistente, arquivada ou de objetivo arquivado', () => {
    const inexistente = dadosValidos()
    item(inexistente.planejamento, 0).materiaId = ID.outro
    expect(verificarIntegridade(inexistente)).toEqual([
      'O planejamento tem uma matéria que não existe.',
    ])

    const arquivada = dadosValidos()
    arquivada.planejamento.push({ materiaId: ID.portArq, peso: 1, adicionadoEm: T })
    expect(verificarIntegridade(arquivada)).toEqual([
      'A matéria arquivada "Português-PF" está no planejamento.',
    ])

    const objetivoArquivado = dadosValidos()
    item(objetivoArquivado.objetivos, 1).ativo = false
    expect(verificarIntegridade(objetivoArquivado)).toEqual([
      'A matéria arquivada "Matemática-CF" está no planejamento.',
    ])
  })

  it('rejeita registro de matéria inexistente ou com objetivo errado', () => {
    const dados = dadosValidos()
    item(dados.registros, 0).materiaId = ID.outro
    item(dados.registros, 1).objetivoId = ID.cf
    expect(verificarIntegridade(dados)).toEqual([
      'O registro de 2026-11-01 aponta para uma matéria que não existe.',
      'O registro de 2026-10-15 (Português-PF) aponta para o objetivo errado.',
    ])
  })

  it('a validação do arquivo mostra o primeiro problema', async () => {
    expect(
      await erroAoAlterar((d) => {
        item(d.registros, 0).materiaId = ID.outro
      }),
    ).toBe(
      'O backup tem dados inconsistentes. O registro de 2026-11-01 aponta para uma matéria que não existe.',
    )
  })
})

describe('resumirBackup (RN33, passo 6)', () => {
  it('conta objetivos, matérias e registros, incluindo os excluídos', async () => {
    const arquivo = await montarArquivoBackup(dadosValidos(), new Date(T), 'UTC')
    const resultado = await validarArquivoBackup(arquivo.conteudo, CONTEXTO)
    if (!resultado.ok) throw new Error(resultado.erro)
    expect(resumirBackup(resultado.valor)).toEqual({
      exportadoEm: T,
      objetivos: 2,
      materias: 3,
      registros: 3,
      registrosExcluidos: 1,
    })
  })
})
