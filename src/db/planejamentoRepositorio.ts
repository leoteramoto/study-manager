import { db } from './banco'
import { ErroNegocio, validarOuFalhar } from './erros'
import type { ItemPlanejamento } from './tipos'
import { esquemaPeso, PESO_PADRAO } from '@/domain/calculos'

export async function listarPlanejamento(): Promise<ItemPlanejamento[]> {
  return db.planejamento.toArray()
}

/**
 * Define quais matérias estão no planejamento (dialog "Editar planejamento").
 * Novas entram com peso 1; as que continuam mantêm o peso; as desmarcadas saem.
 * Sair do planejamento não apaga nenhum registro (RN06). Só matérias ativas de
 * objetivos ativos podem entrar (RN04).
 */
export async function definirPlanejamento(materiaIds: readonly string[]): Promise<void> {
  const desejados = new Set(materiaIds)
  await db.transaction('rw', [db.planejamento, db.materias, db.objetivos], async () => {
    const atuais = await db.planejamento.toArray()
    const idsAtuais = new Set(atuais.map((item) => item.materiaId))
    const novos = [...desejados].filter((id) => !idsAtuais.has(id))

    for (const id of novos) {
      const materia = await db.materias.get(id)
      if (!materia) throw new ErroNegocio('Matéria não encontrada.')
      const objetivo = await db.objetivos.get(materia.objetivoId)
      if (!materia.ativo || !objetivo?.ativo) {
        throw new ErroNegocio(
          `A matéria ${materia.codigo} está arquivada e não pode entrar no planejamento.`,
        )
      }
    }

    await db.planejamento.bulkDelete(
      atuais.filter((item) => !desejados.has(item.materiaId)).map((item) => item.materiaId),
    )
    const agora = new Date().toISOString()
    await db.planejamento.bulkAdd(
      novos.map((materiaId) => ({ materiaId, peso: PESO_PADRAO, adicionadoEm: agora })),
    )
  })
}

/** Tira uma matéria do planejamento. O histórico dela continua intacto (RN06). */
export async function removerDoPlanejamento(materiaId: string): Promise<void> {
  await db.planejamento.delete(materiaId)
}

/** Altera o peso (RN07). O valor é arredondado para 0,1 e validado; retorna o peso gravado. */
export async function alterarPeso(materiaId: string, peso: number): Promise<number> {
  const valido = validarOuFalhar(esquemaPeso, peso)
  const alterados = await db.planejamento.update(materiaId, { peso: valido })
  if (alterados === 0 && !(await db.planejamento.get(materiaId))) {
    throw new ErroNegocio('Esta matéria não está mais no planejamento.')
  }
  return valido
}
