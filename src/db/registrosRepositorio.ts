import { db } from './banco'
import type { Registro } from './tipos'

/**
 * Registros cuja `data` está no intervalo (inclusivo), pelo índice `data`.
 * Inclui os excluídos logicamente: quem calcula decide ignorá-los (RN31).
 */
export async function listarRegistrosDoIntervalo(inicio: string, fim: string): Promise<Registro[]> {
  return db.registros.where('data').between(inicio, fim, true, true).toArray()
}
