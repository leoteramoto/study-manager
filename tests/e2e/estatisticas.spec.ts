import { expect, test, type Page } from '@playwright/test'

// Fuso e data fixos: 22/11/2026, 12:00 em Brasília.
test.use({ timezoneId: 'America/Sao_Paulo' })
const AGORA = new Date('2026-11-22T15:00:00.000Z')

async function cadastrar(page: Page) {
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
}

async function irPara(page: Page, tela: 'Principal' | 'Estatísticas') {
  await page.getByRole('link', { name: tela }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: tela })).toBeVisible()
}

function estudadoNaTabela(page: Page) {
  // Colunas: % | Peso | Código | Matéria | Tempo (min) | Meta | Restante | Ações
  return page.getByRole('row').filter({ hasText: 'Matemática-PF' }).getByRole('cell').nth(4)
}

function totalDoMes(page: Page) {
  return page.getByText('Total de novembro de 2026').locator('xpath=following-sibling::p[1]')
}

test('RF08: lançamento manual conta na Principal e nas Estatísticas, e a exclusão tira dos dois', async ({
  page,
}) => {
  await page.clock.setFixedTime(AGORA)
  await cadastrar(page)

  await irPara(page, 'Principal')
  await page.getByRole('button', { name: 'Editar planejamento' }).click()
  const plano = page.getByRole('dialog', { name: 'Editar planejamento' })
  await plano.getByLabel('Matemática-PF').check()
  await plano.getByRole('button', { name: 'Salvar' }).click()
  await expect(plano).toBeHidden()
  await expect(estudadoNaTabela(page)).toHaveText('0')

  await irPara(page, 'Estatísticas')
  await expect(page.getByRole('tab', { name: 'novembro de 2026' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('button', { name: 'Lançar estudo manual' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Lançar estudo manual' })

  // Data futura é rejeitada.
  await dialogo.getByLabel('Data').fill('2026-11-23')
  await dialogo.getByLabel('Tempo (minutos)').fill('45')
  await dialogo.getByLabel('Matéria').selectOption({ label: 'Matemática-PF' })
  await dialogo.getByRole('button', { name: 'Lançar' }).click()
  await expect(dialogo.getByText('A data não pode estar no futuro.')).toBeVisible()

  await dialogo.getByLabel('Data').fill('2026-11-20')
  await dialogo.getByRole('button', { name: 'Lançar' }).click()
  await expect(dialogo).toBeHidden()

  const historico = page.getByRole('table', { name: 'Histórico de estudos do mês' })
  await expect(historico.getByRole('row').nth(1)).toContainText('20/11/2026')
  await expect(historico.getByRole('row').nth(1)).toContainText('Manual')
  await expect(totalDoMes(page)).toHaveText('0h45')

  await irPara(page, 'Principal')
  await expect(estudadoNaTabela(page)).toHaveText('45')
  await expect(
    page.getByRole('region', { name: 'Indicadores do mês' }).getByText('0h45'),
  ).toBeVisible()

  await irPara(page, 'Estatísticas')
  await page
    .getByRole('button', { name: 'Excluir registro de Matemática-PF em 20/11/2026' })
    .click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText('Nenhum estudo registrado neste mês.')).toBeVisible()
  await expect(totalDoMes(page)).toHaveText('0h00')

  await irPara(page, 'Principal')
  await expect(estudadoNaTabela(page)).toHaveText('0')
})
