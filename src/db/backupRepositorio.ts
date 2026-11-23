// Backup e restauração no banco (RN32, RN33, RN36). As regras ficam em
// `domain/backup`; aqui só se lê e grava o IndexedDB.
import { db, type BancoStudyManager } from './banco'
import { ID_CONFIGURACOES } from './configuracoesRepositorio'
import { ErroNegocio } from './erros'
import {
  type ArquivoBackup,
  type BackupValidado,
  type ContextoBackup,
  type DadosBackup,
  montarArquivoBackup,
  validarArquivoBackup,
} from '@/domain/backup'
import { criptografiaDisponivel, MENSAGEM_SEM_CRIPTOGRAFIA } from '@/lib/criptografia'
import { fusoValido } from '@/lib/fuso'
import { SONS } from '@/lib/sons'

export const MENSAGEM_SESSAO_ATIVA =
  'Há uma sessão do cronômetro em andamento. Encerre ou descarte a sessão antes de restaurar um backup.'

const CONTEXTO: ContextoBackup = {
  idsSons: SONS.map((som) => som.id),
  fusoValido,
}

function garantirCriptografia(): void {
  if (!criptografiaDisponivel()) throw new ErroNegocio(MENSAGEM_SEM_CRIPTOGRAFIA)
}

/**
 * Lê todas as tabelas do backup numa transação só (leitura consistente):
 * inclui objetivos e matérias arquivados e registros excluídos logicamente.
 * A sessão ativa fica de fora (RN32).
 */
export async function lerDadosAtuais(banco: BancoStudyManager = db): Promise<DadosBackup> {
  return banco.transaction(
    'r',
    [banco.objetivos, banco.materias, banco.planejamento, banco.registros, banco.configuracoes],
    async () => {
      const [objetivos, materias, planejamento, registros, configuracoes] = await Promise.all([
        banco.objetivos.toArray(),
        banco.materias.toArray(),
        banco.planejamento.toArray(),
        banco.registros.toArray(),
        banco.configuracoes.get(ID_CONFIGURACOES),
      ])
      if (!configuracoes) throw new ErroNegocio('As configurações do app não foram encontradas.')
      return { objetivos, materias, planejamento, registros, configuracoes }
    },
  )
}

/** Converte o resultado da validação em `ErroNegocio`, com a mensagem pronta. */
async function validarOuLancar(texto: string): Promise<BackupValidado> {
  const resultado = await validarArquivoBackup(texto, CONTEXTO)
  if (!resultado.ok) throw new ErroNegocio(resultado.erro)
  return resultado.valor
}

/**
 * Gera o arquivo de backup dos dados atuais (RN32) e o valida com as mesmas
 * regras da restauração: o app nunca entrega um backup que depois recusaria.
 * Não grava nada; depois do download, chame `registrarBackupFeito`.
 */
export async function gerarBackup(agora: Date = new Date()): Promise<ArquivoBackup> {
  garantirCriptografia()
  const dados = await lerDadosAtuais()
  const arquivo = await montarArquivoBackup(dados, agora, dados.configuracoes.fusoHorario)
  try {
    await validarOuLancar(arquivo.conteudo)
  } catch (erro) {
    if (erro instanceof ErroNegocio) {
      throw new ErroNegocio(
        `O backup não foi gerado porque os dados atuais não passaram na validação. ${erro.message}`,
      )
    }
    throw erro
  }
  return arquivo
}

/** Atualiza `ultimoBackupEm` depois de baixar o arquivo (RN32, RN34). */
export async function registrarBackupFeito(exportadoEm: string): Promise<void> {
  await db.configuracoes.update(ID_CONFIGURACOES, { ultimoBackupEm: exportadoEm })
}

/** Valida o texto de um arquivo de backup sem tocar no banco (RN33, passos 2 a 5). */
export async function validarBackup(texto: string): Promise<BackupValidado> {
  garantirCriptografia()
  return validarOuLancar(texto)
}

export async function existeSessaoAtiva(banco: BancoStudyManager = db): Promise<boolean> {
  return (await banco.sessaoAtiva.count()) > 0
}

/**
 * Substitui todos os dados numa única transação (RN33, passo 9). A sessão do
 * cronômetro é conferida de novo dentro da transação: se outra aba iniciou uma
 * sessão, nada é alterado. Qualquer falha desfaz tudo.
 */
export async function restaurarBackup(
  dados: DadosBackup,
  banco: BancoStudyManager = db,
): Promise<void> {
  await banco.transaction(
    'rw',
    [
      banco.objetivos,
      banco.materias,
      banco.planejamento,
      banco.registros,
      banco.configuracoes,
      banco.sessaoAtiva,
    ],
    async () => {
      if ((await banco.sessaoAtiva.count()) > 0) throw new ErroNegocio(MENSAGEM_SESSAO_ATIVA)
      await Promise.all([
        banco.objetivos.clear(),
        banco.materias.clear(),
        banco.planejamento.clear(),
        banco.registros.clear(),
        banco.configuracoes.clear(),
      ])
      await banco.objetivos.bulkAdd(dados.objetivos)
      await banco.materias.bulkAdd(dados.materias)
      await banco.planejamento.bulkAdd(dados.planejamento)
      await banco.registros.bulkAdd(dados.registros)
      await banco.configuracoes.add(dados.configuracoes)
    },
  )
}

/**
 * Restauração na tela de falha do banco (RN36): o banco não abre ou está
 * corrompido, então é apagado e recriado antes de receber o backup. Só é
 * chamada depois da confirmação explícita do usuário; não há como fazer
 * backup antes, porque os dados atuais não podem ser lidos.
 */
export async function restaurarEmBancoNovo(
  dados: DadosBackup,
  banco: BancoStudyManager = db,
): Promise<void> {
  banco.close()
  await banco.delete()
  await banco.open()
  await restaurarBackup(dados, banco)
}

export const MENSAGEM_FALHA_COPIA = 'Não foi possível copiar os dados atuais.'

/**
 * Cópia dos dados atuais antes de restaurar (RN33, passo 8). Não passa pela
 * validação: ela guarda o que existe, mesmo que esteja inconsistente. Mesmo
 * formato da exportação (RN32), então também pode ser restaurada.
 */
export async function gerarCopiaSeguranca(agora: Date = new Date()): Promise<ArquivoBackup> {
  garantirCriptografia()
  let dados: DadosBackup
  try {
    dados = await lerDadosAtuais()
  } catch (erro) {
    if (import.meta.env.DEV) console.error('Falha ao ler os dados para a cópia', erro)
    throw new ErroNegocio(MENSAGEM_FALHA_COPIA)
  }
  return montarArquivoBackup(dados, agora, dados.configuracoes.fusoHorario, 'antesDaRestauracao')
}
