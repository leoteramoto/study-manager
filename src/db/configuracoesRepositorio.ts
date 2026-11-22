import { db, SCHEMA_VERSION } from './banco'
import { validarOuFalhar } from './erros'
import type { Configuracoes } from './tipos'
import { esquemaMetaMensal } from '@/domain/calculos'
import { detectarFusoNavegador } from '@/lib/fuso'
import { SOM_PADRAO } from '@/lib/sons'

export const ID_CONFIGURACOES = 'app'

export function criarConfiguracoesPadrao(fusoHorario = detectarFusoNavegador()): Configuracoes {
  return {
    id: ID_CONFIGURACOES,
    metaMensalHoras: null,
    fusoHorario,
    somAtivo: true,
    somId: SOM_PADRAO,
    volume: 0.7,
    notificacoesAtivas: false,
    ultimoBackupEm: null,
    schemaVersion: SCHEMA_VERSION,
  }
}

/**
 * Cria a linha padrão de configurações se ela ainda não existir.
 * Nunca sobrescreve uma linha existente. Retorna `true` quando criou
 * (ou seja, na primeira execução do app).
 */
export async function garantirConfiguracoesPadrao(): Promise<boolean> {
  return db.transaction('rw', db.configuracoes, async () => {
    const existente = await db.configuracoes.get(ID_CONFIGURACOES)
    if (existente) return false
    await db.configuracoes.add(criarConfiguracoesPadrao())
    return true
  })
}

export async function obterConfiguracoes(): Promise<Configuracoes | undefined> {
  return db.configuracoes.get(ID_CONFIGURACOES)
}

/**
 * Grava a meta mensal em horas (RN08). Não aceita apagar a meta: só valores
 * de 0,5 a 744. Não altera nenhum tempo já estudado.
 */
export async function definirMetaMensal(horas: number): Promise<void> {
  const meta = validarOuFalhar(esquemaMetaMensal, horas)
  await db.configuracoes.update(ID_CONFIGURACOES, { metaMensalHoras: meta })
}
