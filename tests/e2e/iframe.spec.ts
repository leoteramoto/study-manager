import { expect, test } from '@playwright/test'

// Proteção contra clickjacking (Fase 8): dentro de um iframe, o app não monta.
// A página de fora fica em outra origem (127.0.0.1 em vez de localhost), servida
// pelo próprio Playwright, e embute o app.
const AVISO = 'O Study Manager não abre dentro de outra página'

test('dentro de um iframe de outra origem, só aparece o aviso', async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  if (!baseURL) throw new Error('baseURL não configurada')
  const app = new URL(baseURL)
  const fora = `http://127.0.0.1:${app.port}/moldura-de-teste.html`
  // O Chromium bloqueia 127.0.0.1 → localhost (Local Network Access) sem essa
  // permissão; o quadro ficaria vazio e o teste passaria a não provar nada.
  if (browserName === 'chromium') {
    await context.grantPermissions(['local-network-access'], { origin: new URL(fora).origin })
  }
  await page.route(fora, (rota) =>
    rota.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Outro site</title><iframe src="${app.href}" width="800" height="600"></iframe>`,
    }),
  )

  await page.goto(fora)
  const quadro = page.frameLocator('iframe')
  await expect(quadro.getByRole('heading', { level: 1, name: AVISO })).toBeVisible()
  await expect(quadro.getByRole('navigation')).toHaveCount(0)
  await expect(quadro.getByRole('heading', { name: 'Principal' })).toHaveCount(0)

  // Nada do app foi iniciado no quadro: nem service worker, nem banco.
  const frame = page.frames().find((f) => f.url().startsWith(app.origin))
  if (!frame) throw new Error('quadro do app não encontrado')
  const estado = await frame.evaluate(async () => ({
    sw: (await navigator.serviceWorker.getRegistration()) !== undefined,
    bancos: (await indexedDB.databases()).map((b) => b.name),
  }))
  expect(estado).toEqual({ sw: false, bancos: [] })

  // A página de cima continua onde estava.
  expect(page.url()).toBe(fora)
})

test('fora de iframe, o app abre normalmente e sem o aviso', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Principal' })).toBeVisible()
  await expect(page.getByText(AVISO)).toHaveCount(0)
})
