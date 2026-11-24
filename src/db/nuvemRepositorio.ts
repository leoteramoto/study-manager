// Estado do backup no Google Drive (Fase 7). As transições ficam em
// `domain/backupNuvem`; aqui só se lê e grava o banco da nuvem.
//
// Toda mudança é ler-transformar-gravar numa transação `rw`: duas abas que
// gravam ao mesmo tempo não perdem a mudança uma da outra.
import { dbNuvem, type BancoNuvem } from './bancoNuvem'
import {
  aoConectar,
  aoDesconectar,
  aoEnviar,
  aoFalhar,
  aoGatilho,
  aoRestaurar,
  aoSuspender,
  type EstadoNuvem,
  estadoInicialNuvem,
  ID_ESTADO_NUVEM,
} from '@/domain/backupNuvem'

/** Estado atual; sem linha gravada, o estado inicial (desconectado). */
export async function obterEstadoNuvem(banco: BancoNuvem = dbNuvem): Promise<EstadoNuvem> {
  return (await banco.estado.get(ID_ESTADO_NUVEM)) ?? estadoInicialNuvem()
}

/**
 * Aplica uma transição ao estado gravado e devolve o novo estado. Quando a
 * transição devolve o mesmo objeto (nada mudou), nada é gravado.
 */
export async function transformarEstadoNuvem(
  transicao: (estado: EstadoNuvem) => EstadoNuvem,
  banco: BancoNuvem = dbNuvem,
): Promise<EstadoNuvem> {
  return banco.transaction('rw', banco.estado, async () => {
    const atual = await obterEstadoNuvem(banco)
    const novo = transicao(atual)
    if (novo !== atual) await banco.estado.put(novo)
    return novo
  })
}

export function registrarConexaoNuvem(
  dados: Parameters<typeof aoConectar>[1],
  banco: BancoNuvem = dbNuvem,
): Promise<EstadoNuvem> {
  return transformarEstadoNuvem((estado) => aoConectar(estado, dados), banco)
}

/** "Desconectar": volta ao estado inicial. Nada é apagado no Drive. */
export function registrarDesconexaoNuvem(banco: BancoNuvem = dbNuvem): Promise<EstadoNuvem> {
  return transformarEstadoNuvem(aoDesconectar, banco)
}

/** Gatilho de envio, gravado na hora (RN43). */
export function registrarGatilhoNuvem(
  agora: Date = new Date(),
  banco: BancoNuvem = dbNuvem,
): Promise<EstadoNuvem> {
  return transformarEstadoNuvem((estado) => aoGatilho(estado, agora), banco)
}

export function registrarEnvioNuvem(
  dados: Parameters<typeof aoEnviar>[1],
  banco: BancoNuvem = dbNuvem,
): Promise<EstadoNuvem> {
  return transformarEstadoNuvem((estado) => aoEnviar(estado, dados), banco)
}

export function registrarSuspensaoNuvem(banco: BancoNuvem = dbNuvem): Promise<EstadoNuvem> {
  return transformarEstadoNuvem(aoSuspender, banco)
}

export function registrarFalhaNuvem(
  mensagem: string,
  banco: BancoNuvem = dbNuvem,
): Promise<EstadoNuvem> {
  return transformarEstadoNuvem((estado) => aoFalhar(estado, mensagem), banco)
}

/** Depois de uma restauração bem-sucedida (RN45): a referência passa a ser a restaurada. */
export function registrarRestauracaoNuvem(
  totalRegistros: number,
  agora: Date = new Date(),
  banco: BancoNuvem = dbNuvem,
): Promise<EstadoNuvem> {
  return transformarEstadoNuvem((estado) => aoRestaurar(estado, totalRegistros, agora), banco)
}
