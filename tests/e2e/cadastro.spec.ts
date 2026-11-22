import { expect, test, type Page } from '@playwright/test'

async function abrirCadastro(page: Page) {
  await page.goto('./#/cadastro')
  await expect(page.getByRole('heading', { level: 1, name: 'Cadastro' })).toBeVisible()
}

async function criarObjetivo(page: Page, nome: string, sigla: string) {
  await page.getByRole('button', { name: 'Novo objetivo' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Novo objetivo' })
  await dialogo.getByLabel('Nome').fill(nome)
  await dialogo.getByLabel('Sigla').fill(sigla)
  await dialogo.getByRole('button', { name: 'Criar objetivo' }).click()
  return dialogo
}

async function criarMateria(page: Page, objetivo: string, nome: string) {
  const item = page.getByRole('listitem').filter({ hasText: objetivo })
  await item.getByRole('button', { name: 'Nova matéria' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Nova matéria' })
  await dialogo.getByLabel('Nome').fill(nome)
  await dialogo.getByRole('button', { name: 'Criar matéria' }).click()
  await expect(dialogo).toBeHidden()
}

test('RF01: cria, bloqueia sigla repetida, renomeia, reordena e arquiva objetivos', async ({
  page,
}) => {
  await abrirCadastro(page)

  await expect(await criarObjetivo(page, 'Polícia Federal', 'pf')).toBeHidden()
  await expect(await criarObjetivo(page, 'Carreira Fiscal', 'CF')).toBeHidden()

  const repetido = await criarObjetivo(page, 'Outro', 'PF')
  await expect(repetido.getByRole('alert')).toHaveText('Já existe um objetivo com a sigla PF.')
  await repetido.getByRole('button', { name: 'Cancelar' }).click()

  await page.getByRole('button', { name: 'Editar Polícia Federal' }).click()
  const edicao = page.getByRole('dialog', { name: 'Editar objetivo' })
  await expect(edicao.getByLabel('Sigla')).toBeDisabled()
  await edicao.getByLabel('Nome').fill('Polícia Federal 2026')
  await edicao.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Polícia Federal 2026')).toBeVisible()

  await page.getByRole('button', { name: 'Mover Carreira Fiscal para cima' }).click()
  const objetivos = page.getByRole('list', { name: 'Objetivos' }).locator(':scope > li')
  await expect(objetivos.first()).toContainText('Carreira Fiscal')

  await page.getByRole('button', { name: 'Arquivar Carreira Fiscal' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Arquivar' }).click()
  await expect(page.getByText('Carreira Fiscal')).toBeHidden()

  await page.getByLabel('Mostrar arquivados').click()
  await page.getByRole('button', { name: 'Desarquivar Carreira Fiscal' }).click()
  await page.getByLabel('Mostrar arquivados').click()
  await expect(page.getByText('Carreira Fiscal')).toBeVisible()
})

test('RF02: gera o código, recalcula ao renomear e bloqueia código repetido', async ({ page }) => {
  await abrirCadastro(page)
  await expect(await criarObjetivo(page, 'Polícia Federal', 'PF')).toBeHidden()

  await criarMateria(page, 'Polícia Federal', 'Matemática')
  await criarMateria(page, 'Polícia Federal', 'Português')
  await expect(page.getByRole('cell', { name: 'Matemática-PF' })).toBeVisible()

  await page.getByRole('button', { name: 'Editar Matemática' }).click()
  const edicao = page.getByRole('dialog', { name: 'Editar matéria' })
  await edicao.getByLabel('Nome').fill('Matemática Básica')
  await expect(edicao.getByText('Matemática Básica-PF')).toBeVisible()
  await edicao.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('cell', { name: 'Matemática Básica-PF' })).toBeVisible()

  await page.getByRole('button', { name: 'Editar Português' }).click()
  const conflito = page.getByRole('dialog', { name: 'Editar matéria' })
  await conflito.getByLabel('Nome').fill('matemática básica')
  await conflito.getByRole('button', { name: 'Salvar' }).click()
  await expect(conflito.getByRole('alert')).toContainText('Já existe uma matéria com o código')
  await conflito.getByRole('button', { name: 'Cancelar' }).click()

  await page.getByRole('button', { name: 'Arquivar Português' }).click()
  await expect(page.getByRole('cell', { name: 'Português-PF' })).toBeHidden()
})
