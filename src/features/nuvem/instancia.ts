// Orquestrador único do app (Fase 7). Só existe com `VITE_GOOGLE_CLIENT_ID`:
// sem a variável, `iniciarNuvem` devolve `null` e nada do Google é carregado.
import { gerarBackupValidado } from '@/db/backupRepositorio'
import { carregarDestinoGoogle, NUVEM_DISPONIVEL } from './carregarDestino'
import { criarOrquestradorNuvem, type OrquestradorNuvem } from './orquestrador'

let instancia: OrquestradorNuvem | null = null
let carregamento: Promise<OrquestradorNuvem | null> | null = null

function registrarErro(contexto: string, erro: unknown): void {
  // Os erros daqui não contêm token nem conteúdo (ver `clienteDrive`).
  if (import.meta.env.DEV) console.error(`Backup na nuvem (${contexto})`, erro)
}

/** Orquestrador já criado, ou `null` (ainda carregando ou recurso desligado). */
export function orquestradorAtual(): OrquestradorNuvem | null {
  return instancia
}

/** Cria o orquestrador uma vez (carrega o código do destino real sob demanda). */
export function iniciarNuvem(): Promise<OrquestradorNuvem | null> {
  if (!NUVEM_DISPONIVEL) return Promise.resolve(null)
  carregamento ??= carregarDestinoGoogle(registrarErro)
    .then((destino) => {
      if (!destino) return null
      instancia = criarOrquestradorNuvem({
        destino,
        gerarBackup: gerarBackupValidado,
        registrarErro,
      })
      return instancia
    })
    .catch((erro: unknown) => {
      // Falha ao baixar o código (offline na primeira visita): tenta de novo depois.
      registrarErro('carregamento', erro)
      carregamento = null
      return null
    })
  return carregamento
}
