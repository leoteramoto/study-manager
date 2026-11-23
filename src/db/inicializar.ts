import { db } from './banco'
import { solicitarPersistencia } from './armazenamento'
import { garantirConfiguracoesPadrao } from './configuracoesRepositorio'

/** O banco foi gravado por uma versão mais nova do app (RN36). */
export class ErroVersaoBanco extends Error {
  constructor() {
    super('Os dados foram gravados por uma versão mais nova do app.')
    this.name = 'ErroVersaoBanco'
  }
}

export type TipoFalhaBanco = 'versao' | 'outra'

/** Separa a versão mais nova (nada pode ser apagado) das demais falhas de abertura. */
export function classificarFalhaBanco(erro: unknown): TipoFalhaBanco {
  if (erro instanceof ErroVersaoBanco) return 'versao'
  const { name, inner } = (erro ?? {}) as { name?: unknown; inner?: { name?: unknown } }
  return name === 'VersionError' || inner?.name === 'VersionError' ? 'versao' : 'outra'
}

/**
 * Abre o banco e prepara os dados mínimos. Na primeira execução
 * (linha de configurações recém-criada) pede armazenamento persistente (RN35).
 *
 * O pedido não é aguardado: no Firefox ele abre um aviso de permissão e a
 * promessa só termina quando o usuário responde, o que travaria a abertura do app.
 */
export async function inicializarBanco(): Promise<void> {
  await db.open()
  // O Dexie 4 abre sem erro um banco de versão maior que a declarada. O
  // IndexedDB guarda a versão multiplicada por 10 (convenção do Dexie).
  if (db.backendDB().version > db.verno * 10) {
    db.close()
    throw new ErroVersaoBanco()
  }
  const primeiraExecucao = await garantirConfiguracoesPadrao()
  if (primeiraExecucao) {
    void solicitarPersistencia()
  }
}
