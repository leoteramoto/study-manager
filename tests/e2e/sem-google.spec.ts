import { expect, test } from '@playwright/test'
import { prepararDados, vigiarGoogle } from './apoio/nuvem'

// Build normal do E2E, sem VITE_GOOGLE_CLIENT_ID: o recurso do Drive não existe.
test('sem Client ID: nenhuma seção, indicador ou requisição do Google', async ({ page }) => {
  const proibidas = await vigiarGoogle(page)
  await prepararDados(page)

  for (const rota of ['./#/', './#/cadastro', './#/estatisticas', './#/configuracoes']) {
    await page.goto(rota)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Reconectar Google Drive' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Backup no Drive suspenso/ })).toHaveCount(0)
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Google Drive' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Conectar ao Google Drive' })).toHaveCount(0)

  const bancos = await page.evaluate(async () =>
    (await indexedDB.databases()).map((banco) => banco.name),
  )
  expect(bancos).toContain('study-manager')
  expect(bancos).not.toContain('study-manager-nuvem')
  expect(proibidas).toEqual([])
})
