import { expect, test } from '@playwright/test'
import {
  conectar,
  controlarDrive,
  navegadorVazioComDrive,
  prepararDados,
  secaoDrive,
  semViolacoes,
  vigiarGoogle,
} from './apoio/nuvem'

// Acessibilidade (WCAG 2.1 A/AA) das telas do backup no Google Drive, como em
// acessibilidade.spec.ts: seção desconectada, conectada e suspensa, lista de
// backups, diálogos de confirmação e os dois indicadores do cabeçalho.
test.use({ timezoneId: 'America/Sao_Paulo' })

const TELAS = [
  { nome: 'tela larga', viewport: { width: 1280, height: 800 } },
  { nome: 'celular', viewport: { width: 360, height: 740 } },
] as const

for (const tela of TELAS) {
  for (const tema of ['light', 'dark'] as const) {
    const rotulo = `${tela.nome}, tema ${tema === 'light' ? 'claro' : 'escuro'}`

    test(`Google Drive sem violações WCAG AA (${rotulo})`, async ({ page, browser, baseURL }) => {
      const proibidas = await vigiarGoogle(page)
      await page.emulateMedia({ colorScheme: tema })
      // Os dados são preparados em tela larga (a navegação do celular fica no menu).
      await prepararDados(page)
      await page.setViewportSize(tela.viewport)

      await page.goto('./#/configuracoes')
      const secao = secaoDrive(page)
      await expect(secao.getByRole('button', { name: 'Conectar ao Google Drive' })).toBeVisible()
      await semViolacoes(page, `seção desconectada (${rotulo})`)

      await conectar(page)
      await expect(secao.getByTestId('situacao-nuvem')).toHaveText('Em dia.')
      await semViolacoes(page, `seção conectada (${rotulo})`)

      await secao.getByRole('button', { name: 'Restaurar do Google Drive' }).click()
      const lista = page.getByRole('dialog', { name: 'Backups no Google Drive' })
      await expect(lista.getByRole('listitem')).toHaveCount(1)
      await semViolacoes(page, `lista de backups (${rotulo})`)
      await page.keyboard.press('Escape')
      await expect(lista).toBeHidden()

      await secao.getByRole('button', { name: 'Desconectar' }).click()
      const desconectar = page.getByRole('alertdialog', { name: 'Desconectar do Google Drive?' })
      await expect(desconectar).toBeVisible()
      await semViolacoes(page, `diálogo Desconectar (${rotulo})`)
      await desconectar.getByRole('button', { name: 'Cancelar' }).click()
      await expect(desconectar).toBeHidden()

      // Indicador "Reconectar": sem token (recarregou) e com o popup negado.
      await page.reload()
      await controlarDrive(page, { modoAutorizacao: 'nega' })
      await secao.getByRole('button', { name: 'Fazer backup agora' }).click()
      await expect(page.getByRole('button', { name: 'Reconectar Google Drive' })).toBeVisible()
      await semViolacoes(page, `indicador Reconectar (${rotulo})`)

      // Navegador vazio com o Drive cheio: seção suspensa e indicador "suspenso".
      // O "Drive" é copiado com os controles: o popup volta a conceder.
      await controlarDrive(page, { modoAutorizacao: 'concede' })
      const novo = await navegadorVazioComDrive(browser, page, {
        baseURL,
        viewport: tela.viewport,
        colorScheme: tema,
      })
      const pagina = novo.pagina
      try {
        await conectar(pagina)
        await expect(
          pagina.getByRole('link', { name: 'Backup no Drive suspenso: ver em Configurações' }),
        ).toBeVisible()
        await semViolacoes(pagina, `seção suspensa e indicador (${rotulo})`)

        await secaoDrive(pagina).getByRole('button', { name: 'Fazer backup agora' }).click()
        const menos = pagina.getByRole('alertdialog', { name: 'Enviar mesmo com menos registros?' })
        await expect(menos).toBeVisible()
        await semViolacoes(pagina, `diálogo de menos registros (${rotulo})`)
        await menos.getByRole('button', { name: 'Cancelar' }).click()
        await expect(menos).toBeHidden()

        await secaoDrive(pagina).getByRole('button', { name: 'Restaurar do Google Drive' }).click()
        await pagina
          .getByRole('dialog', { name: 'Backups no Google Drive' })
          .getByRole('button', { name: /^Restaurar o backup enviado em/ })
          .click()
        const restaurar = pagina.getByRole('alertdialog', { name: 'Restaurar este backup?' })
        await expect(restaurar).toBeVisible()
        await semViolacoes(pagina, `confirmação da restauração pelo Drive (${rotulo})`)
        await restaurar.getByRole('button', { name: 'Cancelar' }).click()
        expect(novo.proibidas).toEqual([])
      } finally {
        await novo.contexto.close()
      }
      expect(proibidas).toEqual([])
    })
  }
}
