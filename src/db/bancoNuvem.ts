import Dexie, { type EntityTable } from 'dexie'
import type { EstadoNuvem } from '@/domain/backupNuvem'

// Banco separado do backup no Google Drive (Fase 7). O banco principal
// (`study-manager`) não muda de versão: uma versão anterior do app continua
// abrindo-o (RN36). Este banco fica fora do arquivo de backup, sobrevive à
// restauração e só é limpo por "Desconectar". O token de acesso nunca é gravado.
//
// O Dexie só abre o banco na primeira consulta: sem `VITE_GOOGLE_CLIENT_ID`,
// nada consulta este banco e ele nem chega a ser criado.

export const NOME_BANCO_NUVEM = 'study-manager-nuvem'

export type BancoNuvem = Dexie & {
  estado: EntityTable<EstadoNuvem, 'id'>
}

export function criarBancoNuvem(nome = NOME_BANCO_NUVEM): BancoNuvem {
  const banco = new Dexie(nome) as BancoNuvem
  // Versão 1. Novas versões devem ser adicionadas abaixo, sem alterar esta.
  banco.version(1).stores({ estado: 'id' })
  return banco
}

export const dbNuvem = criarBancoNuvem()
