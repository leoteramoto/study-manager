import { useCallback, useState } from 'react'
import { gerarBackup, registrarBackupFeito } from '@/db/backupRepositorio'
import { baixarArquivo } from '@/lib/download'
import { useExecutar } from '@/lib/useExecutar'

/**
 * Exporta e baixa o backup (RN32). O arquivo é validado antes do download;
 * se a validação falhar, nada é baixado e o erro fica em `erro`.
 */
export function useExportarBackup() {
  const { erro, executar, limparErro } = useExecutar()
  const [exportando, setExportando] = useState(false)

  const exportar = useCallback(async () => {
    setExportando(true)
    try {
      return await executar(async () => {
        const arquivo = await gerarBackup()
        baixarArquivo(arquivo.nome, arquivo.conteudo)
        await registrarBackupFeito(arquivo.exportadoEm)
      })
    } finally {
      setExportando(false)
    }
  }, [executar])

  return { exportar, exportando, erro, limparErro }
}
