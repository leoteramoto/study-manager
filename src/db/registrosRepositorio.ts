// Registros de estudo: consultas, lançamentos manuais, edição e exclusão lógica
// (RN30, RN31). Os registros do cronômetro são gravados só pela confirmação da
// sessão (sessaoRepositorio). Nenhuma operação daqui apaga um registro do banco.
import { db } from './banco'
import { ID_CONFIGURACOES } from './configuracoesRepositorio'
import { ErroNegocio, validarOuFalhar } from './erros'
import type { Registro } from './tipos'
import {
  aplicarEdicaoManual,
  criarEsquemaLancamento,
  excluirLogicamente,
  materiaAceitaNoLancamento,
  montarLancamentoManual,
  podeEditar,
  podeExcluir,
  type DadosLancamento,
} from '@/domain/lancamentos'
import { anoDaData, dataNoFuso, intervaloDoAno } from '@/domain/tempo'
import { FUSO_PADRAO } from '@/lib/fuso'

/**
 * Registros cuja `data` está no intervalo (inclusivo), pelo índice `data`.
 * Inclui os excluídos logicamente: quem calcula decide ignorá-los (RN31).
 */
export async function listarRegistrosDoIntervalo(inicio: string, fim: string): Promise<Registro[]> {
  return db.registros.where('data').between(inicio, fim, true, true).toArray()
}

/**
 * Anos que têm pelo menos um registro não excluído (RN27). Lê só as chaves
 * distintas do índice `data` e, para cada ano candidato, procura um registro
 * não excluído, sem carregar o histórico inteiro.
 */
export async function listarAnosComRegistros(): Promise<number[]> {
  const datas = (await db.registros.orderBy('data').uniqueKeys()) as string[]
  const candidatos = [...new Set(datas.map(anoDaData))]
  const comRegistro = await Promise.all(
    candidatos.map(async (ano) => {
      const { inicio, fim } = intervaloDoAno(ano)
      const algum = await db.registros
        .where('data')
        .between(inicio, fim, true, true)
        .filter((r) => r.excluidoEm === null)
        .first()
      return algum ? ano : null
    }),
  )
  return comRegistro.filter((ano): ano is number => ano !== null)
}

/** Data de hoje no fuso configurado, lida dentro da transação. */
async function hojeNoFuso(agora: Date): Promise<string> {
  const configuracoes = await db.configuracoes.get(ID_CONFIGURACOES)
  return dataNoFuso(agora, configuracoes?.fusoHorario ?? FUSO_PADRAO)
}

/**
 * Valida o formulário (data não futura no fuso configurado, 1 a 480 minutos)
 * e a matéria (ativa, de objetivo ativo; na edição, a matéria atual continua
 * aceita mesmo arquivada). Devolve os dados validados e o objetivo da matéria.
 */
async function validarLancamento(
  dados: DadosLancamento,
  agora: Date,
  materiaAtualId: string | null,
): Promise<{ validos: DadosLancamento; objetivoId: string }> {
  const validos = validarOuFalhar(criarEsquemaLancamento(await hojeNoFuso(agora)), dados)
  const materia = await db.materias.get(validos.materiaId)
  if (!materia) throw new ErroNegocio('Matéria não encontrada.')
  const objetivo = await db.objetivos.get(materia.objetivoId)
  if (!materiaAceitaNoLancamento(materia, objetivo?.ativo ?? false, materiaAtualId)) {
    throw new ErroNegocio(`A matéria ${materia.codigo} está arquivada.`)
  }
  return { validos, objetivoId: materia.objetivoId }
}

const TABELAS_LANCAMENTO = [db.registros, db.materias, db.objetivos, db.configuracoes]

/** Lança um estudo manual (RN30). */
export async function lancarManual(
  dados: DadosLancamento,
  agora: Date = new Date(),
): Promise<Registro> {
  return db.transaction('rw', TABELAS_LANCAMENTO, async () => {
    const { validos, objetivoId } = await validarLancamento(dados, agora, null)
    const registro = montarLancamentoManual(validos, {
      id: crypto.randomUUID(),
      objetivoId,
      agora,
    })
    await db.registros.add(registro)
    return registro
  })
}

async function obterRegistro(id: string): Promise<Registro> {
  const registro = await db.registros.get(id)
  if (!registro || registro.excluidoEm !== null) {
    throw new ErroNegocio('Este registro foi excluído ou não existe mais.')
  }
  return registro
}

/**
 * Edita um lançamento manual (RN31): data, tempo e matéria, com as mesmas
 * validações do lançamento. Registros do cronômetro não podem ser editados.
 */
export async function editarManual(
  id: string,
  dados: DadosLancamento,
  agora: Date = new Date(),
): Promise<Registro> {
  return db.transaction('rw', TABELAS_LANCAMENTO, async () => {
    const registro = await obterRegistro(id)
    if (!podeEditar(registro)) {
      throw new ErroNegocio('Registros do cronômetro não podem ser editados, só excluídos.')
    }
    const { validos, objetivoId } = await validarLancamento(dados, agora, registro.materiaId)
    const editado = aplicarEdicaoManual(registro, validos, { objetivoId, agora })
    await db.registros.put(editado)
    return editado
  })
}

/**
 * Exclusão lógica de qualquer registro (RN31): marca `excluidoEm`. O registro
 * sai de todas as telas e somas, mas continua no banco e nos backups.
 */
export async function excluirRegistro(id: string, agora: Date = new Date()): Promise<void> {
  await db.transaction('rw', db.registros, async () => {
    const registro = await obterRegistro(id)
    if (!podeExcluir(registro)) throw new ErroNegocio('Este registro já foi excluído.')
    await db.registros.put(excluirLogicamente(registro, agora))
  })
}
