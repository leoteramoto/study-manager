// Fluxo único da restauração (RN33, RN47): a mesma validação, a mesma
// confirmação, a mesma cópia dos dados atuais e a mesma substituição, venha o
// arquivo do computador ou do Google Drive. Só a leitura do texto muda.
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import {
  existeSessaoAtiva,
  gerarCopiaSeguranca,
  MENSAGEM_SESSAO_ATIVA,
  restaurarBackup,
  restaurarEmBancoNovo,
  validarBackup,
} from '@/db/backupRepositorio'
import { ErroNegocio } from '@/db/erros'
import { registrarRestauracaoNuvem } from '@/db/nuvemRepositorio'
import type { BackupValidado } from '@/domain/backup'
import { useNuvem } from '@/features/nuvem/useNuvem'
import { avisarRestauracao } from '@/lib/canalRestauracao'
import { baixarArquivo } from '@/lib/download'
import { useExecutar } from '@/lib/useExecutar'

/** De onde veio o backup escolhido. */
export type OrigemRestauracao = 'arquivo' | 'drive'

/**
 * `normal`: Configurações; exige não haver sessão e que o usuário baixe a
 * cópia dos dados atuais antes de substituir (RN33).
 * `bancoComFalha`: tela de falha do banco (RN36); apaga e recria o banco,
 * sem cópia prévia, porque os dados atuais não podem ser lidos.
 */
export type ModoRestauracao = 'normal' | 'bancoComFalha'

export type EtapaRestauracao =
  | { tipo: 'ocioso' }
  | { tipo: 'confirmar'; backup: BackupValidado; origem: OrigemRestauracao }
  | { tipo: 'restaurando'; backup: BackupValidado; origem: OrigemRestauracao }
  | { tipo: 'concluido' }

/** Cópia dos dados atuais antes de substituir (RN33, passo 8). */
export type CopiaRestauracao =
  | { situacao: 'pendente' }
  | { situacao: 'copiando' }
  | { situacao: 'baixada'; nome: string }
  | { situacao: 'falhou' }
  /** O usuário confirmou, uma segunda vez, seguir sem cópia. */
  | { situacao: 'dispensada' }

function registrarErroDev(contexto: string, erro: unknown): void {
  if (import.meta.env.DEV) console.error(`Restauração (${contexto})`, erro)
}

export function useRestauracao(modo: ModoRestauracao) {
  const [etapa, setEtapa] = useState<EtapaRestauracao>({ tipo: 'ocioso' })
  const [copia, setCopia] = useState<CopiaRestauracao>({ situacao: 'pendente' })
  const { erro, executar, limparErro } = useExecutar()
  const { disponivel } = useNuvem()
  const normal = modo === 'normal'
  // Na tela de falha o banco não abre: a consulta não é feita.
  const sessaoAtiva = useLiveQuery(() => (normal ? existeSessaoAtiva() : false), [normal])

  /**
   * Passos 1 a 5: bloqueia com sessão ativa, lê o texto e o valida, sem tocar
   * no banco. `lerTexto` pode já estar em andamento (download iniciado no clique).
   */
  const iniciar = useCallback(
    (origem: OrigemRestauracao, lerTexto: () => Promise<string>) =>
      executar(async () => {
        if (normal && (await existeSessaoAtiva())) throw new ErroNegocio(MENSAGEM_SESSAO_ATIVA)
        const backup = await validarBackup(await lerTexto())
        setCopia({ situacao: 'pendente' })
        setEtapa({ tipo: 'confirmar', backup, origem })
      }),
    [executar, normal],
  )

  // Passo 8: a cópia é baixada por um clique próprio, antes de substituir.
  const baixarCopia = useCallback(async () => {
    setCopia({ situacao: 'copiando' })
    try {
      const arquivo = await gerarCopiaSeguranca()
      baixarArquivo(arquivo.nome, arquivo.conteudo)
      setCopia({ situacao: 'baixada', nome: arquivo.nome })
    } catch {
      setCopia({ situacao: 'falhou' })
    }
  }, [])

  const confirmar = useCallback(
    async (backup: BackupValidado, origem: OrigemRestauracao) => {
      setEtapa({ tipo: 'restaurando', backup, origem })
      const ok = await executar(async () => {
        if (normal) {
          if (await existeSessaoAtiva()) throw new ErroNegocio(MENSAGEM_SESSAO_ATIVA)
          // Passo 9: tudo numa transação só.
          await restaurarBackup(backup.dados)
        } else {
          await restaurarEmBancoNovo(backup.dados)
        }
      })
      if (!ok) {
        setEtapa({ tipo: 'ocioso' })
        return
      }
      // RN45: a referência passa a ser a dos dados restaurados. Só com o
      // recurso do Drive: sem ele, o banco da nuvem nem é criado.
      if (disponivel) {
        try {
          await registrarRestauracaoNuvem(backup.dados.registros.length)
        } catch (falha) {
          registrarErroDev('estado da nuvem', falha)
        }
      }
      // As outras abas recarregam sozinhas; esta espera o clique em "Recarregar".
      avisarRestauracao()
      setEtapa({ tipo: 'concluido' })
    },
    [executar, normal, disponivel],
  )

  return {
    modo,
    normal,
    etapa,
    copia,
    erro,
    limparErro,
    /** Restauração bloqueada por uma sessão do cronômetro (passo 1). */
    bloqueado: normal && sessaoAtiva === true,
    iniciar,
    baixarCopia,
    dispensarCopia: () => {
      setCopia({ situacao: 'dispensada' })
    },
    confirmar,
    cancelar: () => {
      setEtapa({ tipo: 'ocioso' })
    },
  }
}

export type FluxoRestauracao = ReturnType<typeof useRestauracao>
