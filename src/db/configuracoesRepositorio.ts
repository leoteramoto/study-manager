import { z } from 'zod'
import { db, SCHEMA_VERSION } from './banco'
import { ErroNegocio, validarOuFalhar } from './erros'
import type { Configuracoes } from './tipos'
import { esquemaMetaMensal } from '@/domain/calculos'
import { canonizarFuso, detectarFusoNavegador } from '@/lib/fuso'
import { SOM_PADRAO, SONS } from '@/lib/sons'

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

/** Liga ou desliga as notificações do sistema (RN39). */
export async function definirNotificacoesAtivas(ativas: boolean): Promise<void> {
  await db.configuracoes.update(ID_CONFIGURACOES, { notificacoesAtivas: ativas })
}

/**
 * Troca o fuso horário (RN37). Afeta a exibição e os registros novos; nenhum
 * registro já gravado é alterado (a `data` deles continua a mesma).
 */
export async function definirFuso(fuso: string): Promise<string> {
  const canonico = canonizarFuso(fuso)
  if (!canonico) throw new ErroNegocio('Fuso horário desconhecido. Escolha um da lista.')
  await db.configuracoes.update(ID_CONFIGURACOES, { fusoHorario: canonico })
  return canonico
}

const esquemaSom = z
  .object({
    somAtivo: z.boolean(),
    somId: z.enum(
      SONS.map((som) => som.id),
      { error: 'Som desconhecido.' },
    ),
    volume: z.number().min(0, 'Volume inválido.').max(1, 'Volume inválido.'),
  })
  .partial()

export type PreferenciasSomParciais = z.input<typeof esquemaSom>

/** Liga/desliga o som, escolhe o som e o volume (RN38). */
export async function definirSom(preferencias: PreferenciasSomParciais): Promise<void> {
  const dados = validarOuFalhar(esquemaSom, preferencias)
  await db.configuracoes.update(ID_CONFIGURACOES, dados)
}
