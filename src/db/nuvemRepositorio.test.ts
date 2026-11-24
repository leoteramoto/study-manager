import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, NOME_BANCO } from './banco'
import { criarBancoNuvem, dbNuvem, NOME_BANCO_NUVEM } from './bancoNuvem'
import { lerDadosAtuais, restaurarBackup, restaurarEmBancoNovo } from './backupRepositorio'
import { garantirConfiguracoesPadrao } from './configuracoesRepositorio'
import {
  obterEstadoNuvem,
  registrarConexaoNuvem,
  registrarDesconexaoNuvem,
  registrarEnvioNuvem,
  registrarFalhaNuvem,
  registrarGatilhoNuvem,
  registrarRestauracaoNuvem,
  registrarSuspensaoNuvem,
  transformarEstadoNuvem,
} from './nuvemRepositorio'
import { estadoInicialNuvem, MENSAGEM_SUSPENSAO } from '@/domain/backupNuvem'

const AGORA = new Date('2026-11-23T15:00:00.000Z')

async function conectar() {
  return registrarConexaoNuvem({ email: 'pessoa@example.com', pastaId: 'p1', referenciaDrive: 40 })
}

beforeEach(async () => {
  await dbNuvem.delete()
  await dbNuvem.open()
})

afterEach(() => {
  dbNuvem.close()
})

describe('banco da nuvem', () => {
  it('é um banco separado, versão 1, só com a tabela de estado', () => {
    expect(dbNuvem.name).toBe(NOME_BANCO_NUVEM)
    expect(NOME_BANCO_NUVEM).not.toBe(NOME_BANCO)
    expect(dbNuvem.verno).toBe(1)
    expect(dbNuvem.tables.map((t) => t.name)).toEqual(['estado'])
  })

  it('não altera a versão nem as tabelas do banco principal', async () => {
    await db.delete()
    await db.open()
    expect(db.verno).toBe(1)
    expect(db.tables.map((t) => t.name)).not.toContain('estado')
    db.close()
  })
})

describe('estado', () => {
  it('sem linha gravada, devolve o estado inicial sem gravar nada', async () => {
    expect(await obterEstadoNuvem()).toEqual(estadoInicialNuvem())
    expect(await dbNuvem.estado.count()).toBe(0)
  })

  it('conectar grava e-mail, pasta e a referência lida do Drive', async () => {
    await conectar()
    expect(await obterEstadoNuvem()).toMatchObject({
      conectado: true,
      email: 'pessoa@example.com',
      pastaId: 'p1',
      registrosUltimoEnvio: 40,
    })
  })

  it('o gatilho fica gravado na hora (sobrevive ao fechar a aba)', async () => {
    await conectar()
    await registrarGatilhoNuvem(AGORA)
    dbNuvem.close()
    // Outra conexão, como uma aba reaberta.
    const reaberto = criarBancoNuvem()
    expect(await obterEstadoNuvem(reaberto)).toMatchObject({
      situacao: 'pendente',
      ultimoGatilhoEm: AGORA.toISOString(),
    })
    reaberto.close()
    await dbNuvem.open()
  })

  it('gatilho desconectado não muda o estado', async () => {
    await registrarGatilhoNuvem(AGORA)
    expect(await obterEstadoNuvem()).toEqual(estadoInicialNuvem())
  })

  it('envio com sucesso, suspensão e falha', async () => {
    await conectar()
    await registrarGatilhoNuvem(new Date('2026-11-23T14:59:00.000Z'))
    await registrarEnvioNuvem({
      iniciadoEm: AGORA,
      concluidoEm: new Date('2026-11-23T15:00:02.000Z'),
      totalRegistros: 41,
      pastaId: 'p1',
    })
    expect(await obterEstadoNuvem()).toMatchObject({
      situacao: 'ok',
      ultimoEnvioEm: '2026-11-23T15:00:02.000Z',
      registrosUltimoEnvio: 41,
    })

    await registrarSuspensaoNuvem()
    expect(await obterEstadoNuvem()).toMatchObject({
      situacao: 'erro',
      motivoErro: 'suspenso',
      mensagemErro: MENSAGEM_SUSPENSAO,
    })

    await registrarFalhaNuvem('Não foi possível enviar.')
    expect(await obterEstadoNuvem()).toMatchObject({
      situacao: 'erro',
      motivoErro: 'falha',
      mensagemErro: 'Não foi possível enviar.',
    })
  })

  it('restauração troca a referência e deixa pendente', async () => {
    await conectar()
    await registrarSuspensaoNuvem()
    await registrarRestauracaoNuvem(25, AGORA)
    expect(await obterEstadoNuvem()).toMatchObject({
      registrosUltimoEnvio: 25,
      situacao: 'pendente',
      motivoErro: null,
    })
  })

  it('desconectar volta ao estado inicial', async () => {
    await conectar()
    await registrarGatilhoNuvem(AGORA)
    await registrarDesconexaoNuvem()
    expect(await obterEstadoNuvem()).toEqual(estadoInicialNuvem())
  })

  it('duas abas gravando ao mesmo tempo não perdem mudanças', async () => {
    await conectar()
    const outraAba = criarBancoNuvem()
    await Promise.all([
      transformarEstadoNuvem((e) => ({ ...e, email: 'outra@example.com' }), outraAba),
      transformarEstadoNuvem((e) => ({ ...e, pastaId: 'p2' })),
    ])
    expect(await obterEstadoNuvem()).toMatchObject({ email: 'outra@example.com', pastaId: 'p2' })
    outraAba.close()
  })
})

describe('independência do banco principal', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await garantirConfiguracoesPadrao()
    await conectar()
  })

  afterEach(() => {
    db.close()
  })

  it('a restauração do banco principal não toca no estado da nuvem', async () => {
    await restaurarBackup(await lerDadosAtuais())
    expect((await obterEstadoNuvem()).conectado).toBe(true)
  })

  it('apagar e recriar o banco principal (RN36) não apaga o estado da nuvem', async () => {
    await restaurarEmBancoNovo(await lerDadosAtuais())
    expect((await obterEstadoNuvem()).pastaId).toBe('p1')
  })
})
