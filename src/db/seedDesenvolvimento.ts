// Dados de teste para desenvolvimento. Só é carregado em `npm run dev`
// (importação dinâmica sob `import.meta.env.DEV`); não entra no build de produção.
import { db } from './banco'
import { definirMetaMensal, obterConfiguracoes } from './configuracoesRepositorio'
import { ErroNegocio } from './erros'
import { criarMateria } from './materiasRepositorio'
import { criarObjetivo } from './objetivosRepositorio'
import { alterarPeso, definirPlanejamento } from './planejamentoRepositorio'
import type { Registro } from './tipos'
import { dataNoFuso, intervaloDoMes, mesNoFuso } from '@/domain/tempo'
import { FUSO_PADRAO } from '@/lib/fuso'

const H = 3600

async function bancoVazio(): Promise<boolean> {
  const [objetivos, materias, registros, planejamento] = await Promise.all([
    db.objetivos.count(),
    db.materias.count(),
    db.registros.count(),
    db.planejamento.count(),
  ])
  return objetivos + materias + registros + planejamento === 0
}

/**
 * Cria objetivos, matérias, planejamento (pesos 2, 1 e 1; meta de 100 h) e
 * registros no mês atual, no mês anterior e um excluído. Só roda com o banco
 * vazio e nunca apaga nada.
 */
export async function popularDadosDeTeste(agora = new Date()): Promise<void> {
  if (!(await bancoVazio())) {
    throw new ErroNegocio('Os dados de teste só podem ser criados com o banco vazio.')
  }
  const fuso = (await obterConfiguracoes())?.fusoHorario ?? FUSO_PADRAO

  const pf = await criarObjetivo({ nome: 'Polícia Federal', sigla: 'PF' })
  const cf = await criarObjetivo({ nome: 'Carreira Fiscal', sigla: 'CF' })
  const nova = (objetivoId: string, nome: string, cor: string) =>
    criarMateria(objetivoId, { nome, descricao: '', cor })
  const matematica = await nova(pf.id, 'Matemática', '#4f46e5')
  const constitucional = await nova(pf.id, 'Direito Constitucional', '#16a34a')
  const portugues = await nova(cf.id, 'Português', '#ea580c')
  const contabilidade = await nova(cf.id, 'Contabilidade', '#db2777')

  await definirPlanejamento([matematica.id, constitucional.id, portugues.id])
  await alterarPeso(matematica.id, 2)
  await definirMetaMensal(100)

  const mes = mesNoFuso(agora, fuso)
  const hoje = dataNoFuso(agora, fuso)
  const inicioDoMes = intervaloDoMes(mes).inicio
  const mesAnterior = intervaloDoMes(
    mes.mes === 1 ? { ano: mes.ano - 1, mes: 12 } : { ...mes, mes: mes.mes - 1 },
  ).inicio
  const criadoEm = agora.toISOString()

  const registro = (
    materia: { id: string; objetivoId: string },
    data: string,
    duracaoSeg: number,
    origem: Registro['origem'],
    excluido = false,
  ): Registro => {
    const inicio = origem === 'cronometro' ? new Date(`${data}T15:00:00Z`) : null
    return {
      id: crypto.randomUUID(),
      materiaId: materia.id,
      objetivoId: materia.objetivoId,
      data,
      inicio: inicio?.toISOString() ?? null,
      fim: inicio ? new Date(inicio.getTime() + duracaoSeg * 1000).toISOString() : null,
      duracaoSeg,
      duracaoPlanejadaMin: origem === 'cronometro' ? Math.ceil(duracaoSeg / 60) : null,
      origem,
      tipoEncerramento: origem === 'cronometro' ? 'concluido' : 'manual',
      excluidoEm: excluido ? criadoEm : null,
      criadoEm,
      atualizadoEm: criadoEm,
    }
  }

  await db.registros.bulkAdd([
    registro(matematica, inicioDoMes, 8 * H, 'cronometro'),
    registro(matematica, hoje, 4 * H + 30 * 60, 'cronometro'),
    registro(constitucional, inicioDoMes, 25 * H + 60, 'manual'),
    registro(portugues, hoje, 3 * H, 'manual'),
    registro(contabilidade, hoje, 2 * H, 'manual'),
    registro(matematica, hoje, 5 * H, 'cronometro', true),
    registro(matematica, mesAnterior, 10 * H, 'cronometro'),
  ])
}
