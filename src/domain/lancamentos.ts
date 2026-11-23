// Lançamentos manuais, edição e exclusão lógica de registros (RN30, RN31). Funções puras.
//
// A data do formulário é a string `YYYY-MM-DD` do campo e é gravada como veio:
// nunca passa por `new Date()`, que a leria como meia-noite UTC e, num fuso
// a oeste de Greenwich (ex.: Acre, UTC−5), a devolveria como o dia anterior.
import { z } from 'zod'
import { dataValida } from './tempo'

export const MINUTOS_MINIMOS_LANCAMENTO = 1
export const MINUTOS_MAXIMOS_LANCAMENTO = 480

export interface DadosLancamento {
  /** `YYYY-MM-DD`. */
  data: string
  minutos: number
  materiaId: string
}

export interface RegistroManual {
  id: string
  materiaId: string
  objetivoId: string
  data: string
  inicio: null
  fim: null
  duracaoSeg: number
  duracaoPlanejadaMin: null
  origem: 'manual'
  tipoEncerramento: 'manual'
  excluidoEm: null
  criadoEm: string
  atualizadoEm: string
}

/** Forma mínima de um registro para as regras de edição e exclusão. */
export interface RegistroParaAcao {
  origem: 'cronometro' | 'manual'
  excluidoEm: string | null
}

/**
 * Esquema do formulário de lançamento (RN30). `hoje` é a data atual no fuso
 * configurado: a data não pode ser posterior a ela.
 */
export function criarEsquemaLancamento(hoje: string) {
  return z.object({
    data: z
      .string({ error: 'Informe a data.' })
      .refine((data) => data !== '', 'Informe a data.')
      .refine(dataValida, 'Informe uma data válida.')
      .refine((data) => data <= hoje, 'A data não pode estar no futuro.'),
    minutos: z
      .number({ error: 'Informe o tempo em minutos.' })
      .refine(Number.isFinite, 'Informe o tempo em minutos.')
      .pipe(
        z
          .number()
          .int('O tempo deve ser um número inteiro de minutos.')
          .min(MINUTOS_MINIMOS_LANCAMENTO, 'O tempo deve ser de no mínimo 1 minuto.')
          .max(MINUTOS_MAXIMOS_LANCAMENTO, 'O tempo deve ser de no máximo 480 minutos.'),
      ),
    materiaId: z.string({ error: 'Escolha a matéria.' }).min(1, 'Escolha a matéria.'),
  })
}

/** Monta o registro de um lançamento manual (RN30). */
export function montarLancamentoManual(
  dados: DadosLancamento,
  extra: { id: string; objetivoId: string; agora: Date },
): RegistroManual {
  const agoraIso = extra.agora.toISOString()
  return {
    id: extra.id,
    materiaId: dados.materiaId,
    objetivoId: extra.objetivoId,
    data: dados.data,
    inicio: null,
    fim: null,
    duracaoSeg: dados.minutos * 60,
    duracaoPlanejadaMin: null,
    origem: 'manual',
    tipoEncerramento: 'manual',
    excluidoEm: null,
    criadoEm: agoraIso,
    atualizadoEm: agoraIso,
  }
}

/**
 * Aplica a edição a um lançamento manual (RN31): preserva id e `criadoEm`,
 * atualiza `atualizadoEm` e usa o objetivo da matéria escolhida.
 */
export function aplicarEdicaoManual<
  T extends Pick<
    RegistroManual,
    'materiaId' | 'objetivoId' | 'data' | 'duracaoSeg' | 'atualizadoEm'
  >,
>(registro: T, dados: DadosLancamento, extra: { objetivoId: string; agora: Date }): T {
  return {
    ...registro,
    materiaId: dados.materiaId,
    objetivoId: extra.objetivoId,
    data: dados.data,
    duracaoSeg: dados.minutos * 60,
    atualizadoEm: extra.agora.toISOString(),
  }
}

/** Só lançamentos manuais não excluídos podem ser editados (RN31). */
export function podeEditar(registro: RegistroParaAcao): boolean {
  return registro.origem === 'manual' && registro.excluidoEm === null
}

/** Qualquer registro não excluído pode ser excluído (RN31). */
export function podeExcluir(registro: RegistroParaAcao): boolean {
  return registro.excluidoEm === null
}

/** Exclusão lógica: marca `excluidoEm` e `atualizadoEm` (RN31). */
export function excluirLogicamente<T extends { excluidoEm: string | null; atualizadoEm: string }>(
  registro: T,
  agora: Date,
): T {
  const agoraIso = agora.toISOString()
  return { ...registro, excluidoEm: agoraIso, atualizadoEm: agoraIso }
}

/**
 * Indica se a matéria pode ser escolhida no lançamento (RN04, RN30): matéria
 * ativa de objetivo ativo. Na edição, a matéria atual do registro continua
 * aceita mesmo que tenha sido arquivada depois (só não se troca para outra arquivada).
 */
export function materiaAceitaNoLancamento(
  materia: { id: string; ativo: boolean },
  objetivoAtivo: boolean,
  materiaAtualId: string | null = null,
): boolean {
  return (materia.ativo && objetivoAtivo) || materia.id === materiaAtualId
}

/** Minutos de um lançamento manual, para preencher o formulário de edição. */
export function minutosDoLancamento(duracaoSeg: number): number {
  return Math.round(duracaoSeg / 60)
}
