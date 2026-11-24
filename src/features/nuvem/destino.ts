// Destino do backup na nuvem (RN52). O orquestrador só conhece esta interface:
// a implementação real fala com o Google (GIS + API do Drive) e a falsa guarda
// tudo em memória, para os testes. Nenhum teste acessa o Google.
import type { BackupNuvem } from '@/domain/backupNuvem'

/**
 * - `semAutorizacao`: sem token, token vencido ou recusado (401/403 de autorização).
 * - `offline`: sem conexão com a internet.
 * - `falha`: qualquer outro problema (API, resposta inválida, cota).
 */
export type TipoErroNuvem = 'semAutorizacao' | 'offline' | 'falha'

/**
 * Erro do destino. A mensagem é só para o console de desenvolvimento e nunca
 * contém o token nem o conteúdo do backup; a tela mostra mensagens próprias.
 */
export class ErroNuvem extends Error {
  readonly tipo: TipoErroNuvem

  constructor(tipo: TipoErroNuvem, mensagem: string = tipo) {
    super(mensagem)
    this.name = 'ErroNuvem'
    this.tipo = tipo
  }
}

export interface OpcoesAutorizacao {
  /** E-mail da conta conectada (`login_hint`), para pular a escolha de conta. */
  dicaEmail: string | null
  /** `true` em "Conectar": deixa o usuário escolher a conta. */
  escolherConta: boolean
}

export interface DadosGravacao {
  pastaId: string
  nome: string
  conteudo: string
  appProperties: Record<string, string>
  /** Arquivo do dia a sobrescrever; `null` cria um arquivo novo. */
  idExistente: string | null
}

export interface DestinoBackupNuvem {
  /** Há token válido nesta aba. */
  temToken(): boolean
  /** Avisa quando o token aparece ou some. Devolve a função que para de ouvir. */
  aoMudarToken(ouvinte: () => void): () => void
  /**
   * Pede um token ao Google. **Tem de ser chamada de forma síncrona dentro do
   * clique**, antes de qualquer `await`, senão o navegador bloqueia o popup.
   * Resolve `true` com token, `false` com popup bloqueado, fechado, recusado
   * ou sem resposta no tempo limite. Nunca rejeita.
   */
  autorizar(opcoes: OpcoesAutorizacao): Promise<boolean>
  /** Revoga o token desta aba, se houver, e o esquece. */
  revogar(): Promise<void>
  obterEmail(): Promise<string | null>
  /** Devolve o id da pasta do app: a informada, se ainda existir; senão acha ou cria. */
  garantirPasta(pastaId: string | null): Promise<string>
  /** Backups do app na pasta, do mais recente para o mais antigo. */
  listarBackups(pastaId: string): Promise<BackupNuvem[]>
  gravarBackup(dados: DadosGravacao): Promise<void>
  moverParaLixeira(id: string): Promise<void>
  /** Texto do arquivo, com o tamanho conferido antes e depois de baixar. */
  baixarBackup(id: string): Promise<string>
}
