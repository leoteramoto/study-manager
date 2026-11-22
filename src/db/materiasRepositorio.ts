import Dexie from 'dexie'
import { db } from './banco'
import { ErroNegocio, validarOuFalhar } from './erros'
import type { Materia, Objetivo } from './tipos'
import {
  calcularTroca,
  esquemaMateria,
  ordenarPorOrdem,
  proximaOrdem,
  type DadosMateria,
  type Direcao,
} from '@/domain/cadastro'
import { codigoEmUso, gerarCodigo } from '@/domain/codigo'

export async function listarMaterias(): Promise<Materia[]> {
  return db.materias.toArray()
}

/**
 * Matérias que podem ser usadas em novos estudos e no planejamento:
 * ativas e de objetivos ativos, na ordem do objetivo e depois da matéria (RN04, RN05).
 */
export async function listarMateriasDisponiveis(): Promise<Materia[]> {
  const objetivos = ordenarPorOrdem(await db.objetivos.toArray()).filter((o) => o.ativo)
  const materias = await db.materias.toArray()
  return objetivos.flatMap((o) =>
    ordenarPorOrdem(materias.filter((m) => m.objetivoId === o.id && m.ativo)),
  )
}

async function obterMateria(id: string): Promise<Materia> {
  const materia = await db.materias.get(id)
  if (!materia) throw new ErroNegocio('Matéria não encontrada.')
  return materia
}

async function obterObjetivo(id: string): Promise<Objetivo> {
  const objetivo = await db.objetivos.get(id)
  if (!objetivo) throw new ErroNegocio('Objetivo não encontrado.')
  return objetivo
}

function erroCodigoDuplicado(codigo: string): ErroNegocio {
  return new ErroNegocio(`Já existe uma matéria com o código ${codigo}.`)
}

/** Converte a violação do índice único `&codigo` na mensagem de duplicidade. */
async function comIndiceUnico<T>(codigo: string, operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao()
  } catch (erro) {
    if (erro instanceof Dexie.ConstraintError) throw erroCodigoDuplicado(codigo)
    throw erro
  }
}

/** Cria uma matéria dentro de um objetivo ativo. O código é único no sistema (RN03). */
export async function criarMateria(objetivoId: string, dados: DadosMateria): Promise<Materia> {
  const { nome, descricao, cor } = validarOuFalhar(esquemaMateria, dados)
  return db.transaction('rw', [db.objetivos, db.materias], async () => {
    const objetivo = await obterObjetivo(objetivoId)
    if (!objetivo.ativo) {
      throw new ErroNegocio('Não é possível criar matérias em um objetivo arquivado.')
    }
    const todas = await db.materias.toArray()
    const codigo = gerarCodigo(nome, objetivo.sigla)
    if (codigoEmUso(todas, codigo)) throw erroCodigoDuplicado(codigo)
    const agora = new Date().toISOString()
    const materia: Materia = {
      id: crypto.randomUUID(),
      objetivoId,
      nome,
      codigo,
      descricao,
      cor,
      ordem: proximaOrdem(todas.filter((m) => m.objetivoId === objetivoId)),
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    await comIndiceUnico(codigo, () => db.materias.add(materia))
    return materia
  })
}

/**
 * Edita nome, descrição e cor. O código é recalculado a partir do novo nome;
 * o objetivo nunca muda (RN02, RN03).
 */
export async function editarMateria(id: string, dados: DadosMateria): Promise<void> {
  const { nome, descricao, cor } = validarOuFalhar(esquemaMateria, dados)
  await db.transaction('rw', [db.objetivos, db.materias], async () => {
    const materia = await obterMateria(id)
    const objetivo = await obterObjetivo(materia.objetivoId)
    const codigo = gerarCodigo(nome, objetivo.sigla)
    if (codigoEmUso(await db.materias.toArray(), codigo, id)) throw erroCodigoDuplicado(codigo)
    await comIndiceUnico(codigo, () =>
      db.materias.update(id, {
        nome,
        codigo,
        descricao,
        cor,
        atualizadoEm: new Date().toISOString(),
      }),
    )
  })
}

/** Troca a matéria de posição com a vizinha visível dentro do mesmo objetivo (RN05). */
export async function moverMateria(
  id: string,
  direcao: Direcao,
  incluirArquivadas: boolean,
): Promise<void> {
  await db.transaction('rw', db.materias, async () => {
    const materia = await obterMateria(id)
    const irmas = await db.materias.where('objetivoId').equals(materia.objetivoId).toArray()
    const visiveis = incluirArquivadas ? irmas : irmas.filter((m) => m.ativo || m.id === id)
    const troca = calcularTroca(visiveis, id, direcao)
    if (!troca) return
    const agora = new Date().toISOString()
    for (const { id: idItem, ordem } of troca) {
      await db.materias.update(idItem, { ordem, atualizadoEm: agora })
    }
  })
}

/**
 * Arquiva a matéria e a remove do planejamento (RN04).
 * Bloqueado quando a matéria está na sessão ativa do cronômetro.
 */
export async function arquivarMateria(id: string): Promise<void> {
  await db.transaction('rw', [db.materias, db.planejamento, db.sessaoAtiva], async () => {
    await obterMateria(id)
    const sessao = await db.sessaoAtiva.get('atual')
    if (sessao?.materiaId === id) {
      throw new ErroNegocio(
        'Não é possível arquivar esta matéria: ela está na sessão ativa do cronômetro.',
      )
    }
    await db.materias.update(id, { ativo: false, atualizadoEm: new Date().toISOString() })
    await db.planejamento.delete(id)
  })
}

/** Desarquiva a matéria. Bloqueado se o objetivo estiver arquivado. Não volta ao planejamento. */
export async function desarquivarMateria(id: string): Promise<void> {
  await db.transaction('rw', [db.objetivos, db.materias], async () => {
    const materia = await obterMateria(id)
    const objetivo = await obterObjetivo(materia.objetivoId)
    if (!objetivo.ativo) {
      throw new ErroNegocio(
        `O objetivo ${objetivo.nome} está arquivado. Desarquive o objetivo primeiro.`,
      )
    }
    await db.materias.update(id, { ativo: true, atualizadoEm: new Date().toISOString() })
  })
}
