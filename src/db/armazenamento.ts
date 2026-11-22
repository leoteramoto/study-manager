/** `navigator.storage` pode não existir (navegadores antigos, contexto inseguro). */
function obterStorage(): Partial<StorageManager> | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Partial<Navigator>).storage
}

/**
 * Pede ao navegador armazenamento persistente (RN35), para que o IndexedDB
 * não seja apagado automaticamente sob pressão de espaço.
 * Retorna `null` quando a API não está disponível.
 */
export async function solicitarPersistencia(): Promise<boolean | null> {
  const storage = obterStorage()
  if (!storage?.persist) return null
  try {
    return await storage.persist()
  } catch {
    return null
  }
}

/** Informa se o armazenamento já é persistente; `null` quando não há suporte. */
export async function consultarPersistencia(): Promise<boolean | null> {
  const storage = obterStorage()
  if (!storage?.persisted) return null
  try {
    return await storage.persisted()
  } catch {
    return null
  }
}
