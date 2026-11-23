import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Revisão automática de acessibilidade (WCAG 2.1 A e AA, inclusive contraste)
// nas 4 telas e nos diálogos principais, nos temas claro e escuro.
test.use({ timezoneId: 'America/Sao_Paulo' })

async function semViolacoes(page: Page, contexto: string) {
  // Mede o estado final: sem mouse sobre botões e sem animação ou transição em curso
  // (no meio de um fade, a opacidade parcial gera falso alarme de contraste).
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

/** Dados mínimos para as tabelas não ficarem vazias. */
async function prepararDados(page: Page) {
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

  await page.getByRole('link', { name: 'Estatísticas' }).first().click()
  await page.getByRole('button', { name: 'Lançar estudo manual' }).click()
  const lancamento = page.getByRole('dialog', { name: 'Lançar estudo manual' })
  await lancamento.getByLabel('Tempo (minutos)').fill('45')
  await lancamento.getByLabel('Matéria').selectOption({ label: 'Matemática-PF' })
  await lancamento.getByRole('button', { name: 'Lançar' }).click()
  await expect(lancamento).toBeHidden()
}

for (const tema of ['light', 'dark'] as const) {
  test(`telas e diálogos sem violações WCAG AA (tema ${tema === 'light' ? 'claro' : 'escuro'})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: tema })
    await prepararDados(page)

    for (const [rota, titulo] of [
      ['./#/', 'Principal'],
      ['./#/cadastro', 'Cadastro'],
      ['./#/estatisticas', 'Estatísticas'],
      ['./#/configuracoes', 'Configurações'],
    ] as const) {
      await page.goto(rota)
      await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
      // Espera as consultas do banco preencherem a tela.
      await page.waitForLoadState('networkidle')
      await semViolacoes(page, titulo)
    }

    await page.goto('./#/')
    await page.getByRole('button', { name: 'Editar planejamento' }).click()
    await expect(page.getByRole('dialog', { name: 'Editar planejamento' })).toBeVisible()
    await semViolacoes(page, 'diálogo Editar planejamento')
    await page.keyboard.press('Escape')

    await page.goto('./#/estatisticas')
    await page.getByRole('button', { name: /^Excluir registro de Matemática-PF/ }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await semViolacoes(page, 'confirmação de exclusão')
  })
}

test('em 360 px, nenhuma tela tem rolagem horizontal da página (as tabelas rolam dentro delas)', async ({
  page,
}) => {
  await prepararDados(page)
  await page.setViewportSize({ width: 360, height: 740 })
  for (const [rota, titulo] of [
    ['./#/', 'Principal'],
    ['./#/cadastro', 'Cadastro'],
    ['./#/estatisticas', 'Estatísticas'],
    ['./#/configuracoes', 'Configurações'],
  ] as const) {
    await page.goto(rota)
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const larguras = await page.evaluate(() => ({
      pagina: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }))
    expect(larguras.pagina, `rolagem horizontal em ${titulo}`).toBeLessThanOrEqual(larguras.janela)
  }
})
