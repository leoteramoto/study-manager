// Orquestrador com o destino falso para testes de componente (RN52).
import { gerarBackupValidado } from '@/db/backupRepositorio'
import { appPropertiesDoBackup, nomeArquivoNuvem } from '@/domain/backupNuvem'
import { DestinoFalso } from '@/features/nuvem/destinoFalso'
import { criarOrquestradorNuvem } from '@/features/nuvem/orquestrador'

export function criarNuvemFalsa(destino = new DestinoFalso()) {
  const orquestrador = criarOrquestradorNuvem({
    destino,
    gerarBackup: gerarBackupValidado,
    registrarErro: () => undefined,
  })
  return { destino, orquestrador }
}

/** Pasta e um backup antigo no Drive falso, com a contagem de registros informada. */
export async function semearBackupNoDrive(destino: DestinoFalso, registros: number) {
  const tinhaToken = destino.temToken()
  destino.definirToken(true)
  const pasta = await destino.garantirPasta(null)
  destino.semear(
    pasta,
    nomeArquivoNuvem('2026-11-20'),
    appPropertiesDoBackup('2026-11-20', {
      exportadoEm: '2026-11-20T12:00:00.000Z',
      objetivos: 1,
      materias: 1,
      registros,
      registrosExcluidos: 0,
    }),
  )
  destino.definirToken(tinhaToken)
}
