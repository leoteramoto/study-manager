import { expect, test, type Page } from '@playwright/test'

// O build do E2E usa VITE_FONTE_TICKS=principal (ver playwright.config.ts): os
// ticks vêm do setInterval da página, que o page.clock controla. O worker só
// avisa "verifique agora" e nunca informa tempo, então nada depende dele.
const INICIO = new Date('2026-11-22T10:00:00-03:00')

async function prepararPlano(page: Page) {
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
}

async function iniciar(page: Page, minutos: number) {
  await page.getByLabel('Minutos').fill(String(minutos))
  await page.getByRole('button', { name: 'Iniciar' }).click()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible()
}

/** Avança o relógio em passos de 5 s, dando tempo às gravações do heartbeat. */
async function avancar(page: Page, ms: number) {
  for (let feito = 0; feito < ms; feito += 5000) {
    await page.clock.runFor(Math.min(5000, ms - feito))
  }
}

function tempo(page: Page) {
  return page.getByTestId('tempo-cronometro')
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: INICIO })
})

test('fluxo completo: iniciar, fim do tempo, confirmar e ver na Principal', async ({ page }) => {
  await prepararPlano(page)
  await iniciar(page, 2)
  await expect(page.getByRole('link', { name: /^Sessão ativa: Matemática-PF/ })).toBeVisible()

  await avancar(page, 30_000)
  await page.getByRole('button', { name: 'Pausar' }).click()
  await expect(tempo(page)).toHaveText(/^00:3\d$/)
  const pausado = await tempo(page).textContent()
  await avancar(page, 60_000)
  await expect(tempo(page)).toHaveText(pausado ?? '')

  await page.getByRole('button', { name: 'Continuar' }).click()
  await avancar(page, 100_000)

  const dialogo = page.getByRole('alertdialog', { name: 'Tempo concluído!' })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByText('2 min', { exact: true })).toHaveCount(2)
  await expect(dialogo.getByText('Concluído', { exact: true })).toBeVisible()
  await dialogo.getByRole('button', { name: 'Confirmar' }).click()
  await expect(dialogo).toBeHidden()

  // Colunas: % | Peso | Código | Matéria | Tempo (min) | Meta | Restante | Ações
  const linha = page.getByRole('table').getByRole('row').filter({ hasText: 'Matemática-PF' })
  await expect(linha.getByRole('cell').nth(4)).toHaveText('2')
  await expect(page.getByRole('button', { name: 'Iniciar' })).toBeVisible()
})

test('fechar e reabrir a aba mostra a sessão interrompida', async ({ page }) => {
  await prepararPlano(page)
  await iniciar(page, 30)
  await avancar(page, 70_000)

  // RN23: a saída pede confirmação; aqui aceitamos para recarregar.
  page.on('dialog', (dialogo) => void dialogo.accept())
  await page.reload()

  const modal = page.getByRole('alertdialog', { name: 'Sessão interrompida encontrada' })
  await expect(modal).toBeVisible()
  await expect(modal).toContainText(/Matemática-PF: 01:\d\d contados de 30 min/)
  await modal.getByRole('button', { name: 'Encerrar e revisar' }).click()

  const confirmacao = page.getByRole('alertdialog', { name: 'Revisar sessão' })
  await expect(confirmacao.getByText('Recuperado')).toBeVisible()
  await confirmacao.getByRole('button', { name: 'Confirmar' }).click()
  await expect(confirmacao).toBeHidden()
  const linha = page.getByRole('table').getByRole('row').filter({ hasText: 'Matemática-PF' })
  await expect(linha.getByRole('cell').nth(4)).toHaveText('1')
})

test('salto de 5 min pausa no último heartbeat e permite contar o intervalo', async ({ page }) => {
  await prepararPlano(page)
  await iniciar(page, 60)
  await avancar(page, 20_000)

  // Equivale a fechar a tampa do notebook por 5 minutos.
  await page.clock.fastForward('05:00')
  await expect(page.getByText('Estudo pausado porque o computador ficou inativo')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()
  await expect(tempo(page)).toHaveText(/^00:[12]\d$/)
  await expect(page.getByText(/5 min não foram contados/)).toBeVisible()

  await page.getByRole('button', { name: 'Contar esse tempo' }).click()
  await expect(tempo(page)).toHaveText(/^05:[12]\d$/)
  await expect(page.getByText('Estudo pausado porque o computador ficou inativo')).toBeHidden()
})

test('duas abas: a nova não mostra o modal e assume quando a primeira fecha', async ({
  page,
  context,
}) => {
  await prepararPlano(page)
  await iniciar(page, 60)
  await avancar(page, 10_000)

  const outra = await context.newPage()
  await outra.goto('./')
  await expect(outra.getByRole('button', { name: 'Pausar' })).toBeVisible()
  await expect(
    outra.getByRole('alertdialog', { name: 'Sessão interrompida encontrada' }),
  ).toHaveCount(0)

  await page.close()
  await avancar(outra, 40_000)
  await expect(outra.getByRole('button', { name: 'Pausar' })).toBeVisible()
  await expect(outra.getByRole('alertdialog')).toHaveCount(0)
  await expect(outra.getByText(/pausado/i)).toHaveCount(0)
  await expect(tempo(outra)).toHaveText(/^00:[45]\d$/)
})
