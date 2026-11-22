import type { ModoAssuncao } from '@/domain/cronometro'

export const NOME_LOCK = 'study-manager:cronometro'

export type EstadoLideranca =
  { papel: 'pendente' } | { papel: 'seguidora' } | { papel: 'lider'; modo: ModoAssuncao }

/**
 * Quem cuida da sessão entre as abas abertas. Só a líder grava heartbeat,
 * detecta suspensão e toca alertas; as outras só exibem.
 */
export interface Lideranca {
  obter: () => EstadoLideranca
  assinar: (ouvinte: () => void) => () => void
}

function criarEstado(inicial: EstadoLideranca) {
  let estado = inicial
  const ouvintes = new Set<() => void>()
  return {
    obter: (): EstadoLideranca => estado,
    definir: (novo: EstadoLideranca) => {
      estado = novo
      for (const ouvinte of ouvintes) ouvinte()
    },
    assinar: (ouvinte: () => void) => {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
  }
}

/**
 * Liderança pelo `navigator.locks`. O lock fica com a aba até ela fechar.
 * - Conseguiu na hora: nenhuma outra aba estava com a sessão → `abertura`.
 * - Não conseguiu: outra aba é a líder → `seguidora`, na fila do lock.
 * - A fila a promove quando a líder fecha → `sucessao`.
 */
export function criarLiderancaLocks(locks: LockManager, nome = NOME_LOCK): Lideranca {
  const estado = criarEstado({ papel: 'pendente' })
  // O lock só é solto quando a página termina.
  const segurarParaSempre = () => new Promise<void>(() => undefined)

  void locks.request(nome, { ifAvailable: true }, (lock) => {
    if (lock) {
      estado.definir({ papel: 'lider', modo: 'abertura' })
      return segurarParaSempre()
    }
    estado.definir({ papel: 'seguidora' })
    void locks.request(nome, () => {
      estado.definir({ papel: 'lider', modo: 'sucessao' })
      return segurarParaSempre()
    })
    return undefined
  })

  return { obter: estado.obter, assinar: estado.assinar }
}

/** Sem `navigator.locks`: cada aba se considera a líder, como se fosse a única. */
export function criarLiderancaUnica(): Lideranca {
  const estado = criarEstado({ papel: 'lider', modo: 'abertura' })
  return { obter: estado.obter, assinar: estado.assinar }
}

/** Liderança controlada à mão, para testes. */
export function criarLiderancaManual(inicial: EstadoLideranca = { papel: 'pendente' }) {
  const estado = criarEstado(inicial)
  return { obter: estado.obter, assinar: estado.assinar, definir: estado.definir }
}

let padrao: Lideranca | null = null

/** Uma liderança por página: a decisão de abertura × sucessão vale para a página inteira. */
export function liderancaPadrao(): Lideranca {
  padrao ??=
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? criarLiderancaLocks(navigator.locks)
      : criarLiderancaUnica()
  return padrao
}
