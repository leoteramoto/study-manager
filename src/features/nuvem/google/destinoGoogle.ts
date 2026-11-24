// Implementação real de `DestinoBackupNuvem` (RN52): GIS para o token e a
// API REST do Drive com `fetch`. Este módulo só é importado de forma dinâmica
// e só quando existe `VITE_GOOGLE_CLIENT_ID`: sem a variável, nada do Google
// entra no build.
import type { BackupNuvem } from '@/domain/backupNuvem'
import type { DadosGravacao, DestinoBackupNuvem, OpcoesAutorizacao } from '../destino'
import { AutorizacaoGoogle } from './autorizacaoGoogle'
import { ClienteDrive } from './clienteDrive'
import { carregarGis, type Oauth2Gis } from './gis'

export interface OpcoesDestinoGoogle {
  clientId: string
  fetch?: typeof fetch
  carregarGis?: () => Promise<Oauth2Gis | null>
  agora?: () => Date
  registrarErro?: (contexto: string, erro: unknown) => void
}

export class DestinoGoogle implements DestinoBackupNuvem {
  readonly autorizacao: AutorizacaoGoogle
  private readonly drive: ClienteDrive

  constructor(opcoes: OpcoesDestinoGoogle) {
    this.autorizacao = new AutorizacaoGoogle({
      clientId: opcoes.clientId,
      carregarGis: opcoes.carregarGis ?? (() => carregarGis()),
      agora: opcoes.agora,
      registrarErro: opcoes.registrarErro,
    })
    this.drive = new ClienteDrive({
      fetch: opcoes.fetch ?? ((...argumentos) => globalThis.fetch(...argumentos)),
      token: () => this.autorizacao.tokenAtual(),
      aoRecusarToken: () => {
        this.autorizacao.esquecerToken()
      },
    })
  }

  preparar(): void {
    void this.autorizacao.preparar()
  }

  temToken(): boolean {
    return this.autorizacao.temToken()
  }

  aoMudarToken(ouvinte: () => void): () => void {
    return this.autorizacao.aoMudarToken(ouvinte)
  }

  autorizar(opcoes: OpcoesAutorizacao): Promise<boolean> {
    return this.autorizacao.autorizar(opcoes)
  }

  revogar(): Promise<void> {
    return this.autorizacao.revogar()
  }

  obterEmail(): Promise<string | null> {
    return this.drive.obterEmail()
  }

  garantirPasta(pastaId: string | null): Promise<string> {
    return this.drive.garantirPasta(pastaId)
  }

  listarBackups(pastaId: string): Promise<BackupNuvem[]> {
    return this.drive.listarBackups(pastaId)
  }

  gravarBackup(dados: DadosGravacao): Promise<void> {
    return this.drive.gravarBackup(dados)
  }

  moverParaLixeira(id: string): Promise<void> {
    return this.drive.moverParaLixeira(id)
  }

  baixarBackup(id: string): Promise<string> {
    return this.drive.baixarBackup(id)
  }
}
