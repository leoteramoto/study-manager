/** Baixa um texto como arquivo, sem rede (Blob local). */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Dá tempo ao navegador de iniciar o download antes de liberar a URL.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 10_000)
}
