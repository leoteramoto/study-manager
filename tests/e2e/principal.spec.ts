import { expect, test, type Page } from '@playwright/test'

async function criarObjetivo(page: Page, nome: string, sigla: string) {
  await page.getByRole('button', { name: 'Novo objetivo' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Novo objetivo' })
  await dialogo.getByLabel('Nome').fill(nome)
  await dialogo.getByLabel('Sigla').fill(sigla)
  await dialogo.getByRole('button', { name: 'Criar objetivo' }).click()
  await expect(dialogo).toBeHidden()
}

async function criarMateria(page: Page, objetivo: string, nome: string) {
  const item = page.getByRole('listitem').filter({ hasText: objetivo })
  await item.getByRole('button', { name: 'Nova matéria' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Nova matéria' })
  await dialogo.getByLabel('Nome').fill(nome)
  await dialogo.getByRole('button', { name: 'Criar matéria' }).click()
  await expect(dialogo).toBeHidden()
}

function metaDaMateria(page: Page, codigo: string) {
  // Colunas: % | Peso | Código | Matéria | Tempo (min) | Meta | Restante | Ações
  return page.getByRole('row').filter({ hasText: codigo }).getByRole('cell').nth(5)
}

test('RF03: planejamento com pesos e meta mensal recalculando sem recarregar', async ({ page }) => {
  await page.goto('./#/cadastro')
  await criarObjetivo(page, 'Polícia Federal', 'PF')
  await criarObjetivo(page, 'Carreira Fiscal', 'CF')
  await criarMateria(page, 'Polícia Federal', 'Matemática')
  await criarMateria(page, 'Polícia Federal', 'Direito')
  await criarMateria(page, 'Carreira Fiscal', 'Português')

  await page.getByRole('link', { name: 'Principal' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Principal' })).toBeVisible()
  await expect(page.getByText('Defina a meta mensal')).toBeVisible()
  // O seed de desenvolvimento não existe no build de produção.
  await expect(page.getByRole('button', { name: 'Popular dados de teste' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Editar planejamento' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Editar planejamento' })
  for (const codigo of ['Matemática-PF', 'Direito-PF', 'Português-CF']) {
    await dialogo.getByLabel(codigo).check()
  }
  await dialogo.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialogo).toBeHidden()

  const peso = page.getByLabel('Peso de Matemática-PF')
  await peso.fill('2')
  await peso.press('Enter')

  const meta = page.getByLabel('Meta mensal (horas)')
  await meta.fill('100')
  await meta.press('Enter')

  await expect(metaDaMateria(page, 'Matemática-PF')).toHaveText('50h00')
  await expect(metaDaMateria(page, 'Direito-PF')).toHaveText('25h00')
  await expect(metaDaMateria(page, 'Português-CF')).toHaveText('25h00')

  await meta.fill('80')
  await meta.press('Enter')
  await expect(metaDaMateria(page, 'Matemática-PF')).toHaveText('40h00')
  await expect(metaDaMateria(page, 'Direito-PF')).toHaveText('20h00')

  // Peso com vírgula e mais de uma casa é arredondado para 0,1.
  await peso.fill('1,25')
  await peso.press('Enter')
  await expect(peso).toHaveValue('1,3')

  // Recarregar mantém tudo (dados no IndexedDB).
  await page.reload()
  await expect(page.getByLabel('Meta mensal (horas)')).toHaveValue('80')
  await expect(page.getByLabel('Peso de Matemática-PF')).toHaveValue('1,3')
})
