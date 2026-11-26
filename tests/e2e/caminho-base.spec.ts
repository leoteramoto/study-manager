import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// Build servido sob /study-manager/, como no GitHub Pages (Fase 8, Etapa 2).
// Roda só nos projetos *-base do playwright.config.ts. Ticks pelo worker de
// verdade (sem VITE_FONTE_TICKS), para conferir que ele carrega sob o caminho.
const BASE = '/study-manager/'

/** Registra o caminho de toda requisição feita à origem do app. */
function registrarCaminhos(context: BrowserContext, origem: string): string[] {
  const caminhos: string[] = []
  context.on('request', (req) => {
    const url = new URL(req.url())
    if (url.origin === origem) caminhos.push(url.pathname)
  })
  return caminhos
}

function origemDe(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('baseURL não configurada')
  return new URL(baseURL).origin
}

async function irPara(page: Page, titulo: string) {
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: titulo })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
}

test('abre, navega, toca o som e registra o service worker sob o caminho', async ({
  page,
  context,
  baseURL,
}) => {
  const origem = origemDe(baseURL)
  const caminhos = registrarCaminhos(context, origem)

  await page.goto('./')
  expect(new URL(page.url()).pathname).toBe(BASE)
  await expect(page.getByRole('heading', { level: 1, name: 'Principal' })).toBeVisible()
  for (const titulo of ['Cadastro', 'Estatísticas', 'Configurações']) {
    await irPara(page, titulo)
  }

  const som = page.waitForResponse((r) => new URL(r.url()).pathname.startsWith(`${BASE}sounds/`))
  await page.getByRole('button', { name: 'Testar' }).click()
  // 200, 206 (trecho do arquivo) ou 304 (cache): o importante é não falhar.
  expect((await som).ok() || (await som).status() === 304).toBe(true)

  const escopo = await page.evaluate(async () => {
    const registro = await navigator.serviceWorker.ready
    return { escopo: registro.scope, script: registro.active?.scriptURL ?? '' }
  })
  expect(escopo).toEqual({ escopo: `${origem}${BASE}`, script: `${origem}${BASE}sw.js` })

  // Com o service worker no controle, o app continua abrindo sob o caminho.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible()
  await irPara(page, 'Principal')

  expect(caminhos.length).toBeGreaterThan(0)
  expect(caminhos.filter((c) => !c.startsWith(BASE))).toEqual([])
})

test('o worker do cronômetro carrega sob o caminho e o tempo corre', async ({
  page,
  context,
  baseURL,
}) => {
  const origem = origemDe(baseURL)
  const caminhos = registrarCaminhos(context, origem)

  await page.goto('./#/cadastro')
  await page.getByRole('button', { name: 'Novo objetivo' }).click()
  const objetivo = page.getByRole('dialog', { name: 'Novo objetivo' })
  await objetivo.getByLabel('Nome').fill('Polícia Federal')
  await objetivo.getByLabel('Sigla').fill('PF')
  await objetivo.getByRole('button', { name: 'Criar objetivo' }).click()
  await expect(objetivo).toBeHidden()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Polícia Federal' })
    .getByRole('button', { name: 'Nova matéria' })
    .click()
  const materia = page.getByRole('dialog', { name: 'Nova matéria' })
  await materia.getByLabel('Nome').fill('Matemática')
  await materia.getByRole('button', { name: 'Criar matéria' }).click()
  await expect(materia).toBeHidden()

  await irPara(page, 'Principal')
  await page.getByRole('button', { name: 'Editar planejamento' }).click()
  const plano = page.getByRole('dialog', { name: 'Editar planejamento' })
  await plano.getByLabel('Matemática-PF').check()
  await plano.getByRole('button', { name: 'Salvar' }).click()
  await expect(plano).toBeHidden()

  await page.getByLabel('Minutos').fill('5')
  await page.getByRole('button', { name: 'Iniciar' }).click()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible()
  // O worker pode ter sido criado antes do clique (a fonte de ticks sobe com o provedor).
  await expect
    .poll(() => page.workers().map((w) => new URL(w.url()).pathname))
    .toContainEqual(
      expect.stringMatching(new RegExp(`^${BASE}assets/relogio\\.worker-[\\w-]+\\.js$`)),
    )

  const tempo = page.getByTestId('tempo-cronometro')
  const inicial = await tempo.textContent()
  await expect(tempo).not.toHaveText(inicial ?? '', { timeout: 5000 })

  expect(caminhos.filter((c) => !c.startsWith(BASE))).toEqual([])
})
