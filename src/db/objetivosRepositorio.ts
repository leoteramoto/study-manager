import { db } from './banco'
import { ErroNegocio, validarOuFalhar } from './erros'
import type { Objetivo } from './tipos'
import {
  calcularTroca,
  esquemaObjetivo,
  esquemaRenomearObjetivo,
  proximaOrdem,
  type DadosObjetivo,
  type Direcao,
} from '@/domain/cadastro'
import { siglaEmUso } from '@/domain/codigo'

export async function listarObjetivos(): Promise<Objetivo[]> {
  return db.objetivos.orderBy('ordem').toArray()
}

async function obterObjetivo(id: string): Promise<Objetivo> {
  const objetivo = await db.objetivos.get(id)
  if (!objetivo) throw new ErroNegocio('Objetivo não encontrado.')
  return objetivo
}

/** Cria um objetivo. A sigla é única no sistema, inclusive entre arquivados (RN01). */
export async function criarObjetivo(dados: DadosObjetivo): Promise<Objetivo> {
  const { nome, sigla } = validarOuFalhar(esquemaObjetivo, dados)
  return db.transaction('rw', db.objetivos, async () => {
    const todos = await db.objetivos.toArray()
    if (siglaEmUso(todos, sigla)) {
      throw new ErroNegocio(`Já existe um objetivo com a sigla ${sigla}.`)
    }
    const agora = new Date().toISOString()
    const objetivo: Objetivo = {
      id: crypto.randomUUID(),
      nome,
      sigla,
      ordem: proximaOrdem(todos),
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    await db.objetivos.add(objetivo)
    return objetivo
  })
}

/** Renomeia o objetivo. A sigla nunca muda (RN01). */
export async function renomearObjetivo(id: string, nome: string): Promise<void> {
  const dados = validarOuFalhar(esquemaRenomearObjetivo, { nome })
  await db.transaction('rw', db.objetivos, async () => {
    await obterObjetivo(id)
    await db.objetivos.update(id, { nome: dados.nome, atualizadoEm: new Date().toISOString() })
  })
}

/**
 * Troca o objetivo de posição com o vizinho da lista visível (RN05).
 * Com `incluirArquivados = false`, os arquivados são ignorados.
 */
export async function moverObjetivo(
  id: string,
  direcao: Direcao,
  incluirArquivados: boolean,
): Promise<void> {
  await db.transaction('rw', db.objetivos, async () => {
    const todos = await db.objetivos.toArray()
    const visiveis = incluirArquivados ? todos : todos.filter((o) => o.ativo || o.id === id)
    const troca = calcularTroca(visiveis, id, direcao)
    if (!troca) return
    const agora = new Date().toISOString()
    for (const { id: idItem, ordem } of troca) {
      await db.objetivos.update(idItem, { ordem, atualizadoEm: agora })
    }
  })
}

/**
 * Arquiva o objetivo e todas as suas matérias, que também saem do planejamento (RN04).
 * Bloqueado quando uma das matérias está na sessão ativa do cronômetro.
 */
export async function arquivarObjetivo(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.objetivos, db.materias, db.planejamento, db.sessaoAtiva],
    async () => {
      await obterObjetivo(id)
      const materias = await db.materias.where('objetivoId').equals(id).toArray()
      const sessao = await db.sessaoAtiva.get('atual')
      if (sessao && materias.some((m) => m.id === sessao.materiaId)) {
        throw new ErroNegocio(
          'Não é possível arquivar este objetivo: uma das matérias está na sessão ativa do cronômetro.',
        )
      }
      const agora = new Date().toISOString()
      await db.objetivos.update(id, { ativo: false, atualizadoEm: agora })
      for (const materia of materias) {
        if (materia.ativo)
          await db.materias.update(materia.id, { ativo: false, atualizadoEm: agora })
      }
      await db.planejamento.bulkDelete(materias.map((m) => m.id))
    },
  )
}

/** Desarquiva o objetivo e todas as suas matérias. Elas não voltam ao planejamento. */
export async function desarquivarObjetivo(id: string): Promise<void> {
  await db.transaction('rw', [db.objetivos, db.materias], async () => {
    await obterObjetivo(id)
    const agora = new Date().toISOString()
    await db.objetivos.update(id, { ativo: true, atualizadoEm: agora })
    await db.materias
      .where('objetivoId')
      .equals(id)
      .filter((m) => !m.ativo)
      .modify({ ativo: true, atualizadoEm: agora })
  })
}
