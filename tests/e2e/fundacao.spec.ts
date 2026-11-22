import { expect, test } from '@playwright/test'

test('navega entre as 4 telas pela barra lateral', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Principal' })).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Navegação principal' })
  for (const titulo of ['Cadastro', 'Estatísticas', 'Configurações', 'Principal']) {
    await nav.getByRole('link', { name: titulo }).click()
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
  }
})

test('cria a linha padrão de configurações no IndexedDB', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Principal' })).toBeVisible()
  const config = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open('study-manager')
        req.onerror = () => {
          reject(new Error('falha ao abrir o banco'))
        }
        req.onsuccess = () => {
          const get = req.result
            .transaction('configuracoes')
            .objectStore('configuracoes')
            .get('app')
          get.onsuccess = () => {
            resolve(get.result)
          }
        }
      }),
  )
  expect(config).toMatchObject({ id: 'app', somAtivo: true, volume: 0.7, schemaVersion: 1 })
})

test('continua funcionando offline após a primeira visita', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // Recarrega para a página ficar sob controle do service worker.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Principal' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Cadastro' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Cadastro' })).toBeVisible()
})

test('no celular, a navegação fica num menu recolhível', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeHidden()
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Estatísticas' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Estatísticas' })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
})
