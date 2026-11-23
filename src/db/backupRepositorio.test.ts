import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarBanco, db } from './banco'
import {
  existeSessaoAtiva,
  gerarBackup,
  lerDadosAtuais,
  MENSAGEM_SESSAO_ATIVA,
  registrarBackupFeito,
  restaurarBackup,
  restaurarEmBancoNovo,
  validarBackup,
} from './backupRepositorio'
import { garantirConfiguracoesPadrao, obterConfiguracoes } from './configuracoesRepositorio'
import { arquivarMateria, criarMateria } from './materiasRepositorio'
import { arquivarObjetivo, criarObjetivo } from './objetivosRepositorio'
import { popularDadosDeTeste } from './seedDesenvolvimento'
import type { SessaoAtiva } from './tipos'
import { MENSAGEM_SEM_CRIPTOGRAFIA } from '@/lib/criptografia'

const AGORA = new Date('2026-11-22T15:00:00.000Z')

beforeEach(async () => {
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  db.close()
})

/** Seed + objetivo arquivado + matéria arquivada (o seed já tem um registro excluído). */
async function cenarioCompleto() {
  await popularDadosDeTeste(AGORA)
  const concurso = await criarObjetivo({ nome: 'Tribunais', sigla: 'TRT' })
  await criarMateria(concurso.id, {
    nome: 'Processo do Trabalho',
    descricao: 'Rito',
    cor: '#9333ea',
  })
  await arquivarObjetivo(concurso.id)
  const [pf] = await db.objetivos.where('sigla').equals('PF').toArray()
  const avulsa = await criarMateria(pf?.id ?? '', {
    nome: 'Informática',
    descricao: '',
    cor: '#475569',
  })
  await arquivarMateria(avulsa.id)
}

function sessaoEmAndamento(materiaId: string): SessaoAtiva {
  const inicio = AGORA.toISOString()
  return {
    id: 'atual',
    materiaId,
    duracaoPlanejadaMin: 60,
    inicioEm: inicio,
    segmentoInicioEm: inicio,
    acumuladoSeg: 0,
    ultimoHeartbeatEm: inicio,
    estado: 'em_andamento',
    tipoEncerramento: null,
    fimEm: null,
    motivoPausaAutomatica: null,
    pausaDetectadaEm: null,
  }
}

describe('gerarBackup (RN32)', () => {
  it('dados do seed de desenvolvimento passam na validação do próprio app', async () => {
    await popularDadosDeTeste(AGORA)
    const arquivo = await gerarBackup(AGORA)
    expect(arquivo.nome).toBe('study-manager-backup-2026-11-22-1200.json')
    const backup = await validarBackup(arquivo.conteudo)
    expect(backup.dados.registros).toHaveLength(8)
  })

  it('inclui arquivados e registros excluídos, e não inclui a sessão ativa', async () => {
    await cenarioCompleto()
    await db.sessaoAtiva.put(sessaoEmAndamento((await db.materias.toArray())[0]?.id ?? ''))
    const { dados } = await validarBackup((await gerarBackup(AGORA)).conteudo)
    expect(dados.objetivos.some((o) => !o.ativo)).toBe(true)
    expect(dados.materias.filter((m) => !m.ativo)).toHaveLength(2)
    expect(dados.registros.filter((r) => r.excluidoEm !== null)).toHaveLength(1)
    expect(dados).not.toHaveProperty('sessaoAtiva')
  })

  it('não gera o arquivo quando os dados atuais seriam recusados na restauração', async () => {
    await popularDadosDeTeste(AGORA)
    const [registro] = await db.registros.filter((r) => r.origem === 'cronometro').toArray()
    if (!registro) throw new Error('sem registro')
    await db.registros.put({ ...registro, duracaoPlanejadaMin: 600 })
    await expect(gerarBackup(AGORA)).rejects.toThrow(
      'O backup não foi gerado porque os dados atuais não passaram na validação.',
    )
  })

  it('não altera ultimoBackupEm sozinho; registrarBackupFeito altera', async () => {
    const arquivo = await gerarBackup(AGORA)
    expect((await obterConfiguracoes())?.ultimoBackupEm).toBeNull()
    await registrarBackupFeito(arquivo.exportadoEm)
    expect((await obterConfiguracoes())?.ultimoBackupEm).toBe(AGORA.toISOString())
  })
})

describe('sem crypto.subtle (página fora de contexto seguro)', () => {
  it('exportar e importar mostram mensagem clara', async () => {
    const arquivo = await gerarBackup(AGORA)
    vi.stubGlobal('crypto', {})
    await expect(gerarBackup(AGORA)).rejects.toThrow(MENSAGEM_SEM_CRIPTOGRAFIA)
    await expect(validarBackup(arquivo.conteudo)).rejects.toThrow(MENSAGEM_SEM_CRIPTOGRAFIA)
  })
})

describe('restaurarBackup (RN33)', () => {
  it('ida e volta: exportar, restaurar num banco limpo e obter tabelas idênticas', async () => {
    await cenarioCompleto()
    const antes = await lerDadosAtuais()
    const arquivo = await gerarBackup(AGORA)

    await db.delete()
    await db.open()
    expect(await db.objetivos.count()).toBe(0)

    const backup = await validarBackup(arquivo.conteudo)
    await restaurarBackup(backup.dados)

    expect(await lerDadosAtuais()).toEqual({
      ...antes,
      configuracoes: { ...antes.configuracoes, ultimoBackupEm: arquivo.exportadoEm },
    })
  })

  it('substitui tudo: não sobra nada dos dados anteriores', async () => {
    const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
    await criarMateria(pf.id, { nome: 'Física', descricao: '', cor: '#4f46e5' })
    const arquivo = await gerarBackup(AGORA)

    await db.objetivos.clear()
    await db.materias.clear()
    await criarObjetivo({ nome: 'Outro', sigla: 'OUT' })

    await restaurarBackup((await validarBackup(arquivo.conteudo)).dados)
    expect((await db.objetivos.toArray()).map((o) => o.sigla)).toEqual(['PF'])
    expect((await db.materias.toArray()).map((m) => m.codigo)).toEqual(['Física-PF'])
  })

  it('aborta sem mudar nada se outra aba (outra conexão) tem sessão ativa', async () => {
    await popularDadosDeTeste(AGORA)
    const backup = await validarBackup((await gerarBackup(AGORA)).conteudo)
    await criarObjetivo({ nome: 'Depois do backup', sigla: 'DEP' })
    const antes = await lerDadosAtuais()

    const outraAba = criarBanco()
    await outraAba.open()
    await outraAba.sessaoAtiva.put(sessaoEmAndamento(backup.dados.materias[0]?.id ?? ''))
    outraAba.close()

    expect(await existeSessaoAtiva()).toBe(true)
    await expect(restaurarBackup(backup.dados)).rejects.toThrow(MENSAGEM_SESSAO_ATIVA)
    expect(await lerDadosAtuais()).toEqual(antes)
  })

  it('falha no meio da gravação desfaz tudo (nada pela metade)', async () => {
    await popularDadosDeTeste(AGORA)
    const antes = await lerDadosAtuais()
    const { dados } = await validarBackup((await gerarBackup(AGORA)).conteudo)
    const [primeira] = dados.materias
    if (!primeira) throw new Error('sem matéria')
    // Burla a validação: código repetido viola o índice único &codigo no bulkAdd.
    const corrompidos = {
      ...dados,
      objetivos: [],
      materias: [...dados.materias, { ...primeira, id: crypto.randomUUID() }],
    }
    await expect(restaurarBackup(corrompidos)).rejects.toThrow()
    expect(await lerDadosAtuais()).toEqual(antes)
  })
})

describe('restaurarEmBancoNovo (RN36)', () => {
  it('apaga o banco, recria e grava o backup', async () => {
    await popularDadosDeTeste(AGORA)
    const arquivo = await gerarBackup(AGORA)
    await criarObjetivo({ nome: 'Será apagado', sigla: 'APG' })

    await restaurarEmBancoNovo((await validarBackup(arquivo.conteudo)).dados)
    expect(db.isOpen()).toBe(true)
    expect((await db.objetivos.toArray()).map((o) => o.sigla).sort()).toEqual(['CF', 'PF'])
  })
})
