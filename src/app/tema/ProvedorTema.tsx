import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { ContextoTema } from './contextoTema'
import {
  CONSULTA_ESCURO,
  lerPreferenciaTema,
  resolverTemaEscuro,
  salvarPreferenciaTema,
  sistemaPrefereEscuro,
  type PreferenciaTema,
} from './tema'

function assinarTemaSistema(aoMudar: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const consulta = window.matchMedia(CONSULTA_ESCURO)
  consulta.addEventListener('change', aoMudar)
  return () => {
    consulta.removeEventListener('change', aoMudar)
  }
}

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(lerPreferenciaTema)
  const sistemaEscuro = useSyncExternalStore(assinarTemaSistema, sistemaPrefereEscuro)
  const escuro = resolverTemaEscuro(preferencia, sistemaEscuro)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', escuro)
  }, [escuro])

  const definirPreferencia = useCallback((nova: PreferenciaTema) => {
    salvarPreferenciaTema(nova)
    setPreferencia(nova)
  }, [])

  const valor = useMemo(
    () => ({ preferencia, escuro, definirPreferencia }),
    [preferencia, escuro, definirPreferencia],
  )

  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>
}
