import { db, type BancoStudyManager } from './banco'
import { ID_CONFIGURACOES } from './configuracoesRepositorio'
import { ErroNegocio, validarOuFalhar } from './erros'
import type { SessaoAtiva } from './tipos'
import {
  esquemaDuracaoMin,
  montarRegistro,
  podeGravar,
  transicionar,
  type EventoCronometro,
  type ResultadoTransicao,
} from '@/domain/cronometro'
import { FUSO_PADRAO } from '@/lib/fuso'

export const ID_SESSAO = 'atual'

/** Eventos aplicados a uma sessão existente (iniciar tem validações próprias). */
export type EventoSessao = Exclude<EventoCronometro, { tipo: 'iniciar' }>

export async function obterSessao(banco: BancoStudyManager = db): Promise<SessaoAtiva | null> {
  return (await banco.sessaoAtiva.get(ID_SESSAO)) ?? null
}

/**
 * Aplica um evento à sessão numa transação: lê, calcula com o domínio e grava
 * na hora (RN18). Eventos que não se aplicam ao estado atual não gravam nada.
 */
export async function aplicarEvento(
  evento: EventoSessao,
  agora: Date = new Date(),
  banco: BancoStudyManager = db,
): Promise<ResultadoTransicao> {
  return banco.transaction('rw', banco.sessaoAtiva, async () => {
    const resultado = transicionar(await obterSessao(banco), evento, agora)
    if (resultado.alterada) {
      if (resultado.sessao) await banco.sessaoAtiva.put(resultado.sessao)
      else await banco.sessaoAtiva.delete(ID_SESSAO)
    }
    return resultado
  })
}

/**
 * Inicia uma sessão (RN15, RN16). Exige matéria ativa, de objetivo ativo e
 * presente no planejamento (RN04, RN13), e duração inteira de 1 a 480 minutos.
 */
export async function iniciarSessao(
  materiaId: string,
  duracaoMin: number,
  agora: Date = new Date(),
): Promise<SessaoAtiva> {
  const duracao = validarOuFalhar(esquemaDuracaoMin, duracaoMin)
  return db.transaction(
    'rw',
    [db.sessaoAtiva, db.materias, db.objetivos, db.planejamento],
    async () => {
      if (await obterSessao()) {
        throw new ErroNegocio(
          'Já existe uma sessão do cronômetro. Encerre-a antes de iniciar outra.',
        )
      }
      const materia = await db.materias.get(materiaId)
      if (!materia) throw new ErroNegocio('Matéria não encontrada.')
      const objetivo = await db.objetivos.get(materia.objetivoId)
      if (!materia.ativo || !objetivo?.ativo) {
        throw new ErroNegocio(`A matéria ${materia.codigo} está arquivada.`)
      }
      if (!(await db.planejamento.get(materiaId))) {
        throw new ErroNegocio(`A matéria ${materia.codigo} não está no planejamento.`)
      }
      const { sessao } = transicionar(
        null,
        { tipo: 'iniciar', materiaId, duracaoMin: duracao },
        agora,
      )
      if (!sessao) throw new ErroNegocio('Não foi possível iniciar a sessão.')
      await db.sessaoAtiva.put(sessao)
      return sessao
    },
  )
}

export type ResultadoConfirmacao = 'confirmada' | 'ja_confirmada'

/**
 * Grava o registro da sessão e a encerra (RN21). Único caminho do cronômetro
 * que grava em `registros`.
 *
 * Idempotente: a transação relê a sessão, e o IndexedDB executa em ordem as
 * transações de escrita sobre as mesmas tabelas, inclusive entre abas. Uma
 * segunda confirmação (clique duplo, outra aba) encontra a sessão já apagada
 * e não grava nada.
 */
export async function confirmarSessao(
  agora: Date = new Date(),
  banco: BancoStudyManager = db,
): Promise<ResultadoConfirmacao> {
  return banco.transaction(
    'rw',
    [banco.sessaoAtiva, banco.registros, banco.materias, banco.configuracoes],
    async () => {
      const sessao = await obterSessao(banco)
      if (sessao?.estado !== 'aguardando_confirmacao') return 'ja_confirmada'
      if (!podeGravar(sessao)) {
        throw new ErroNegocio('Sessões com menos de 1 minuto não podem ser gravadas.')
      }
      const materia = await banco.materias.get(sessao.materiaId)
      if (!materia) throw new ErroNegocio('Matéria não encontrada.')
      const configuracoes = await banco.configuracoes.get(ID_CONFIGURACOES)
      const registro = montarRegistro(sessao, {
        id: crypto.randomUUID(),
        objetivoId: materia.objetivoId,
        fuso: configuracoes?.fusoHorario ?? FUSO_PADRAO,
        agora,
      })
      if (!registro) throw new ErroNegocio('Não foi possível gravar a sessão.')
      await banco.registros.add(registro)
      await banco.sessaoAtiva.delete(ID_SESSAO)
      return 'confirmada'
    },
  )
}
