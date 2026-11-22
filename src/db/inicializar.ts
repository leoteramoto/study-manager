import { db } from './banco'
import { solicitarPersistencia } from './armazenamento'
import { garantirConfiguracoesPadrao } from './configuracoesRepositorio'

/**
 * Abre o banco e prepara os dados mínimos. Na primeira execução
 * (linha de configurações recém-criada) pede armazenamento persistente (RN35).
 *
 * O pedido não é aguardado: no Firefox ele abre um aviso de permissão e a
 * promessa só termina quando o usuário responde, o que travaria a abertura do app.
 */
export async function inicializarBanco(): Promise<void> {
  await db.open()
  const primeiraExecucao = await garantirConfiguracoesPadrao()
  if (primeiraExecucao) {
    void solicitarPersistencia()
  }
}
