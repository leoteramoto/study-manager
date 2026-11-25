// Orquestrador com o destino falso para testes de componente (RN52).
import { gerarBackupValidado } from '@/db/backupRepositorio'
import { appPropertiesDoBackup, nomeArquivoNuvem } from '@/domain/backupNuvem'
import { DestinoFalso } from '@/features/nuvem/destinoFalso'
import {
  criarOrquestradorNuvem,
  type DependenciasOrquestrador,
  type Temporizador,
} from '@/features/nuvem/orquestrador'

export function criarNuvemFalsa(
  destino = new DestinoFalso(),
  extra: Partial<DependenciasOrquestrador> = {},
) {
  const orquestrador = criarOrquestradorNuvem({
    destino,
    gerarBackup: gerarBackupValidado,
    registrarErro: () => undefined,
    ...extra,
  })
  return { destino, orquestrador }
}

/** Temporizador manual: nada dispara até `avancar` (o resto do tempo é real). */
export function criarTemporizadorManual() {
  let tempo = 0
  const agendadas: { funcao: () => void; quando: number; ativa: boolean }[] = []
  const temporizador: Temporizador = {
    definir(funcao, ms) {
      const tarefa = { funcao, quando: tempo + ms, ativa: true }
      agendadas.push(tarefa)
      return () => {
        tarefa.ativa = false
      }
    },
  }
  return {
    temporizador,
    avancar(ms: number) {
      tempo += ms
      for (const tarefa of agendadas) {
        if (tarefa.ativa && tarefa.quando <= tempo) {
          tarefa.ativa = false
          tarefa.funcao()
        }
      }
    },
    ativas: () => agendadas.filter((tarefa) => tarefa.ativa).length,
  }
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
