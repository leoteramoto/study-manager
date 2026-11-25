// Apoio dos E2E do backup no Google Drive (Fase 7). O build da nuvem usa o
// destino falso (VITE_DESTINO_NUVEM=falso), que guarda o "Drive" no
// localStorage nesta chave; o teste lê e controla o "Drive" por ela.
import AxeBuilder from '@axe-core/playwright'
import { type Browser, type BrowserContextOptions, expect, type Page } from '@playwright/test'

/** Mesma chave de `src/features/nuvem/e2e/destinoE2E.ts`. */
export const CHAVE_DRIVE = 'study-manager:e2e-destino-falso'
const DOMINIOS_GOOGLE = /accounts\.google\.com|googleapis\.com/

export interface ArquivoDriveE2E {
  meta: { id: string; name: string; mimeType: string }
  lixeira: boolean
  conteudo: string
}

export interface DriveE2E {
  arquivos: ArquivoDriveE2E[]
  gravacoes: number
  revogacoes: number
  pedidosAutorizacao: number
}

export interface ControleDriveE2E {
  modoAutorizacao?: 'concede' | 'nega' | 'pendente'
  falhas?: ('semAutorizacao' | 'offline' | 'falha')[]
}

/**
 * Bloqueia e anota toda requisição para o Google. Devolve a lista, que tem de
 * terminar vazia: o build do E2E nunca fala com o Google.
 */
export async function vigiarGoogle(page: Page): Promise<string[]> {
  const proibidas: string[] = []
  page.on('request', (pedido) => {
    if (DOMINIOS_GOOGLE.test(pedido.url())) proibidas.push(pedido.url())
  })
  await page.route(DOMINIOS_GOOGLE, (rota) => rota.abort())
  return proibidas
}

/** Estado do "Drive" falso (ou o inicial, se nada foi gravado ainda). */
export async function lerDrive(page: Page): Promise<DriveE2E> {
  const texto = await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_DRIVE)
  const vazio: DriveE2E = { arquivos: [], gravacoes: 0, revogacoes: 0, pedidosAutorizacao: 0 }
  return texto ? { ...vazio, ...(JSON.parse(texto) as Partial<DriveE2E>) } : vazio
}

/** Muda o popup do Google falso ou agenda falhas no "Drive". */
export async function controlarDrive(page: Page, controle: ControleDriveE2E): Promise<void> {
  await page.evaluate(
    ([chave, mudanca]) => {
      const atual = JSON.parse(localStorage.getItem(chave) ?? '{}') as Record<string, unknown>
      localStorage.setItem(chave, JSON.stringify({ ...atual, ...mudanca }))
    },
    [CHAVE_DRIVE, controle] as const,
  )
}

/** Objetivo, matéria no planejamento e um estudo manual (1 registro). */
export async function prepararDados(page: Page, comLancamento = true) {
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

  await page.getByRole('link', { name: 'Principal' }).first().click()
  await page.getByRole('button', { name: 'Editar planejamento' }).click()
  const plano = page.getByRole('dialog', { name: 'Editar planejamento' })
  await plano.getByLabel('Matemática-PF').check()
  await plano.getByRole('button', { name: 'Salvar' }).click()
  await expect(plano).toBeHidden()

  if (!comLancamento) return
  await page.getByRole('link', { name: 'Estatísticas' }).first().click()
  const lancar = page.getByRole('button', { name: 'Lançar estudo manual' })
  await expect(lancar).toBeEnabled()
  await lancar.click()
  const lancamento = page.getByRole('dialog', { name: 'Lançar estudo manual' })
  await lancamento.getByLabel('Tempo (minutos)').fill('45')
  await lancamento.getByLabel('Matéria').selectOption({ label: 'Matemática-PF' })
  await lancamento.getByRole('button', { name: 'Lançar' }).click()
  await expect(lancamento).toBeHidden()
}

/** A seção Google Drive de Configurações (o `id` é o destino do link do indicador). */
export function secaoDrive(page: Page) {
  return page.locator('#google-drive')
}

/** Abre Configurações e conecta; espera o primeiro envio terminar. */
export async function conectar(page: Page) {
  await page.goto('./#/configuracoes')
  const secao = secaoDrive(page)
  await secao.getByRole('button', { name: 'Conectar ao Google Drive' }).click()
  await expect(secao.getByRole('button', { name: 'Fazer backup agora' })).toBeVisible()
}

/**
 * "Navegador novo": outro contexto, sem os dados locais, mas com o mesmo
 * "Drive" (copiado da página de origem). A cópia só entra se a chave ainda não
 * existir, para sobreviver aos recarregamentos do próprio navegador novo.
 */
export async function navegadorVazioComDrive(
  browser: Browser,
  origem: Page,
  opcoes: BrowserContextOptions = {},
) {
  const drive = await origem.evaluate((chave) => localStorage.getItem(chave), CHAVE_DRIVE)
  const contexto = await browser.newContext({ ...opcoes, baseURL: opcoes.baseURL })
  await contexto.addInitScript(
    ([chave, valor]) => {
      if (valor !== null && localStorage.getItem(chave) === null) localStorage.setItem(chave, valor)
    },
    [CHAVE_DRIVE, drive] as const,
  )
  const pagina = await contexto.newPage()
  const proibidas = await vigiarGoogle(pagina)
  return { contexto, pagina, proibidas }
}

/** Mesma checagem do `acessibilidade.spec.ts`: WCAG 2.1 A/AA, sem animação em curso. */
export async function semViolacoes(page: Page, contexto: string) {
  await page.mouse.move(0, 0)
  await page.waitForFunction(() =>
    document.getAnimations().every((animacao) => animacao.playState !== 'running'),
  )
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const resumo = resultado.violations.map((v) => {
    const nos = v.nodes.map(
      (n) => `${n.target.join(' ')} ${n.html.slice(0, 400)} ${n.failureSummary ?? ''}`,
    )
    return `${v.id} (${v.impact ?? '?'}): ${nos.join(' | ')}`
  })
  expect(resumo, `Violações em ${contexto}`).toEqual([])
}
