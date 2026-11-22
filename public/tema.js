// Aplica o tema salvo antes do React carregar, para evitar o "piscar" de tema claro.
// Arquivo separado (e não inline) por causa da Content-Security-Policy.
;(function () {
  try {
    var preferencia = localStorage.getItem('study-manager:tema')
    var escuro =
      preferencia === 'escuro' ||
      (preferencia !== 'claro' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', escuro)
  } catch (e) {
    // Sem acesso ao localStorage: segue o padrão claro até o React assumir.
  }
})()
