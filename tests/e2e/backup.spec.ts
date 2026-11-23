import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'America/Sao_Paulo' })

async function criarObjetivo(page: Page, nome: string, sigla: string) {
  await page.getByRole('button', { name: 'Novo objetivo' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Novo objetivo' })
  await dialogo.getByLabel('Nome').fill(nome)
  await dialogo.getByLabel('Sigla').fill(sigla)
  await dialogo.getByRole('button', { name: 'Criar objetivo' }).click()
  await expect(dialogo).toBeHidden()
}

async function criarMateria(page: Page, objetivo: string, nome: string) {
  await page
    .getByRole('listitem')
    .filter({ hasText: objetivo })
    .getByRole('button', { name: 'Nova matéria' })
    .click()
  const dialogo = page.getByRole('dialog', { name: 'Nova matéria' })
  await dialogo.getByLabel('Nome').fill(nome)
  await dialogo.getByRole('button', { name: 'Criar matéria' }).click()
  await expect(dialogo).toBeHidden()
}

async function irParaConfiguracoes(page: Page) {
  await page.getByRole('link', { name: 'Configurações' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible()
}

/** Exporta pela tela de Configurações e devolve o conteúdo do arquivo baixado. */
async function exportar(page: Page): Promise<{ nome: string; conteudo: string }> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar backup' }).click()
  const arquivo = await download
  const caminho = await arquivo.path()
  return { nome: arquivo.suggestedFilename(), conteudo: await readFile(caminho, 'utf8') }
}

/** Objetivo na lista do Cadastro (o nome também aparece na legenda da tabela). */
function objetivo(page: Page, nome: string) {
  return page.getByRole('button', { name: nome, exact: true })
}

function escolherArquivo(page: Page, conteudo: string) {
  return page.getByTestId('arquivo-backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(conteudo),
  })
}

test('RF09: exportar e restaurar reproduz os dados; outra aba recarrega; arquivo alterado é rejeitado', async ({
  page,
  context,
}) => {
  await page.goto('./#/cadastro')
  const lembrete = page.getByRole('region', { name: 'Lembrete de backup' })
  await expect(lembrete).toContainText('Você ainda não fez nenhum backup')

  await criarObjetivo(page, 'Polícia Federal', 'PF')
  await criarMateria(page, 'Polícia Federal', 'Matemática')

  // Exportar (RN32): nome no padrão, lembrete some (RN34).
  await irParaConfiguracoes(page)
  const backup = await exportar(page)
  expect(backup.nome).toMatch(/^study-manager-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  expect(JSON.parse(backup.conteudo)).toMatchObject({ app: 'study-manager', schemaVersion: 1 })
  await expect(lembrete).toBeHidden()
  await expect(page.getByTestId('ultimo-backup')).not.toContainText('nenhum backup')

  // Dados mudam depois do backup.
  await page.getByRole('link', { name: 'Cadastro' }).first().click()
  await criarObjetivo(page, 'Carreira Fiscal', 'CF')
  await expect(objetivo(page, 'Carreira Fiscal')).toBeVisible()

  // Outra aba aberta no Cadastro, com o objetivo novo na tela.
  const outraAba = await context.newPage()
  await outraAba.goto('./#/cadastro')
  await expect(objetivo(outraAba, 'Carreira Fiscal')).toBeVisible()

  // 1 byte alterado dentro de "dados": rejeitado pelo checksum, nada muda.
  await irParaConfiguracoes(page)
  const alterado = backup.conteudo.replace('"nome": "Matemática"', '"nome": "Matemátice"')
  expect(alterado.length).toBe(backup.conteudo.length)
  await escolherArquivo(page, alterado)
  await expect(page.getByRole('alert')).toContainText('o checksum não confere')
  await expect(page.getByRole('alertdialog')).toBeHidden()

  // Restaurar (RN33): resumo, cópia dos dados atuais por clique próprio, substituição.
  await escolherArquivo(page, backup.conteudo)
  const confirmacao = page.getByRole('alertdialog', { name: 'Restaurar este backup?' })
  await expect(confirmacao).toContainText('Isto substituirá todos os dados atuais.')
  await expect(confirmacao).toContainText('Objetivos1')
  await expect(confirmacao).toContainText('Matérias1')
  const substituir = confirmacao.getByRole('button', { name: 'Substituir dados' })
  await expect(substituir).toBeDisabled()

  const download = page.waitForEvent('download')
  await confirmacao.getByRole('button', { name: 'Baixar cópia dos dados atuais' }).click()
  const copia = await download
  expect(copia.suggestedFilename()).toMatch(
    /^study-manager-antes-da-restauracao-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
  )
  // O arquivo termina de ser gravado antes de qualquer substituição ou recarga.
  const atual = JSON.parse(await readFile(await copia.path(), 'utf8')) as {
    dados: { objetivos: unknown[] }
  }
  expect(atual.dados.objetivos).toHaveLength(2)
  await expect(substituir).toBeEnabled()

  const recargaDaOutraAba = outraAba.waitForEvent('load')
  await substituir.click()
  const sucesso = page.getByRole('alertdialog', { name: 'Backup restaurado' })
  await expect(sucesso).toBeVisible()

  // A outra aba recarrega sozinha.
  await recargaDaOutraAba
  await expect(objetivo(outraAba, 'Polícia Federal')).toBeVisible()
  await expect(objetivo(outraAba, 'Carreira Fiscal')).toBeHidden()

  // A própria aba não recarrega sozinha nem fecha o aviso por Esc ou clique fora.
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  await page.waitForTimeout(3000)
  await expect(sucesso).toBeVisible()

  const recargaPropria = page.waitForEvent('load')
  await sucesso.getByRole('button', { name: 'Recarregar' }).click()
  await recargaPropria
  await page.getByRole('link', { name: 'Cadastro' }).first().click()
  await expect(objetivo(page, 'Polícia Federal')).toBeVisible()
  await expect(objetivo(page, 'Carreira Fiscal')).toBeHidden()

  // Exportar de novo reproduz exatamente os mesmos dados.
  await irParaConfiguracoes(page)
  const deNovo = await exportar(page)
  const dados = (texto: string) => {
    const { dados: d } = JSON.parse(texto) as { dados: { configuracoes: Record<string, unknown> } }
    return { ...d, configuracoes: { ...d.configuracoes, ultimoBackupEm: null } }
  }
  expect(dados(deNovo.conteudo)).toEqual(dados(backup.conteudo))
})

test('RN36: banco gravado por versão mais nova mostra só "Recarregar"', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Principal' })).toBeVisible()
  // Simula uma versão futura do app: o IndexedDB passa para a versão 20.
  await page.evaluate(
    () =>
      new Promise<void>((resolver, rejeitar) => {
        const pedido = indexedDB.open('study-manager', 20)
        pedido.onsuccess = () => {
          pedido.result.close()
          resolver()
        }
        pedido.onerror = () => {
          rejeitar(new Error('não abriu'))
        }
      }),
  )
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Os dados foram gravados por uma versão mais nova do app' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recarregar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restaurar de um backup' })).toHaveCount(0)
})

test('RN36: banco que não abre mostra "Tentar novamente" e "Restaurar de um backup"', async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Banco corrompido', 'UnknownError')
    }
  })
  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: 'Não foi possível abrir o banco de dados' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restaurar de um backup' })).toBeVisible()
})
