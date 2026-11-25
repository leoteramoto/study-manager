import { expect, test, type Page } from '@playwright/test'
import {
  conectar,
  controlarDrive,
  lerDrive,
  navegadorVazioComDrive,
  prepararDados,
  secaoDrive,
  vigiarGoogle,
} from './apoio/nuvem'

// Roda só no build com o destino falso da nuvem (projetos *-nuvem do
// playwright.config.ts). Nenhuma requisição pode sair para o Google.
test.use({ timezoneId: 'America/Sao_Paulo' })

const INICIO = new Date('2026-11-22T10:00:00-03:00')
const MENSAGEM_SUSPENSAO =
  'Os dados deste navegador têm menos registros que o último backup no Drive. O envio automático foi suspenso para não sobrescrever o backup.'

let proibidas: string[] = []

test.beforeEach(async ({ page }) => {
  proibidas = await vigiarGoogle(page)
})

test.afterEach(() => {
  expect(proibidas, 'requisições para o Google').toEqual([])
})

async function gravacoes(page: Page): Promise<number> {
  return (await lerDrive(page)).gravacoes
}

/** Sessão de 1 min do cronômetro que termina e espera a confirmação. */
async function sessaoDeUmMinuto(page: Page) {
  await page.getByRole('link', { name: 'Principal' }).first().click()
  await page.getByLabel('Minutos').fill('1')
  await page.getByRole('button', { name: 'Iniciar' }).click()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible()
  for (let feito = 0; feito < 60_000; feito += 5000) await page.clock.runFor(5000)
  const dialogo = page.getByRole('alertdialog', { name: 'Tempo concluído!' })
  await expect(dialogo).toBeVisible()
  return dialogo
}

test('conectar envia na hora e mostra conta, último envio e "Em dia"', async ({ page }) => {
  await prepararDados(page)
  await conectar(page)
  const secao = secaoDrive(page)
  await expect(secao).toContainText('pessoa@example.com')
  await expect(secao.getByTestId('situacao-nuvem')).toHaveText('Em dia.')
  await expect(secao).not.toContainText('nenhum envio ainda')
  expect(await gravacoes(page)).toBe(1)
  const nomes = (await lerDrive(page)).arquivos.map((arquivo) => arquivo.meta.name)
  expect(nomes).toContain('Study Manager')
  expect(
    nomes.filter((nome) => /^study-manager-backup-\d{4}-\d{2}-\d{2}\.json$/.test(nome)),
  ).toHaveLength(1)
})

test('confirmar uma sessão com token: um envio 5 s depois', async ({ page }) => {
  await page.clock.install({ time: INICIO })
  await prepararDados(page, false)
  await conectar(page)
  expect(await gravacoes(page)).toBe(1)

  const dialogo = await sessaoDeUmMinuto(page)
  await dialogo.getByRole('button', { name: 'Confirmar' }).click()
  await expect(dialogo).toBeHidden()
  expect(await gravacoes(page)).toBe(1) // ainda dentro dos 5 s de agrupamento

  await page.clock.runFor(5000)
  await expect.poll(() => gravacoes(page)).toBe(2)
  // Nenhum popup: havia token.
  expect((await lerDrive(page)).pedidosAutorizacao).toBe(1)
})

test('popup negado no Confirmar: a sessão é gravada, fica pendente e "Reconectar" envia', async ({
  page,
}) => {
  await page.clock.install({ time: INICIO })
  await prepararDados(page, false)
  await conectar(page)
  // Recarregar a página apaga o token (só em memória).
  await page.reload()
  await controlarDrive(page, { modoAutorizacao: 'nega' })

  const dialogo = await sessaoDeUmMinuto(page)
  await dialogo.getByRole('button', { name: 'Confirmar' }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByRole('alert')).toHaveCount(0)
  // A sessão foi gravada normalmente: 1 min na tabela da Principal.
  const linha = page.getByRole('table').getByRole('row').filter({ hasText: 'Matemática-PF' })
  await expect(linha.getByRole('cell').nth(4)).toHaveText('1')

  await page.clock.runFor(5000)
  const reconectar = page.getByRole('button', { name: 'Reconectar Google Drive' })
  await expect(reconectar).toBeVisible()
  expect(await gravacoes(page)).toBe(1)

  await controlarDrive(page, { modoAutorizacao: 'concede' })
  await reconectar.click()
  await expect.poll(() => gravacoes(page)).toBe(2)
  await expect(reconectar).toBeHidden()
})

test.describe('navegador vazio e Drive com mais registros', () => {
  test('"Fazer backup agora" pede confirmação e não envia sem ela', async ({
    page,
    browser,
    baseURL,
  }) => {
    await prepararDados(page)
    await conectar(page)
    const novo = await navegadorVazioComDrive(browser, page, { baseURL })
    const pagina = novo.pagina
    try {
      await conectar(pagina)
      await expect(secaoDrive(pagina)).toContainText(MENSAGEM_SUSPENSAO)
      await secaoDrive(pagina).getByRole('button', { name: 'Fazer backup agora' }).click()
      const confirmacao = pagina.getByRole('alertdialog', {
        name: 'Enviar mesmo com menos registros?',
      })
      await expect(confirmacao).toBeVisible()
      await confirmacao.getByRole('button', { name: 'Cancelar' }).click()
      await expect(confirmacao).toBeHidden()
      expect(await gravacoes(pagina)).toBe(1)
      expect(novo.proibidas).toEqual([])
    } finally {
      await novo.contexto.close()
    }
  })

  test('suspenso no cabeçalho, link com foco no título e restauração completa', async ({
    page,
    browser,
    baseURL,
  }) => {
    await prepararDados(page)
    await conectar(page)
    const novo = await navegadorVazioComDrive(browser, page, { baseURL })
    const pagina = novo.pagina
    try {
      await conectar(pagina)
      const indicador = pagina.getByRole('link', {
        name: 'Backup no Drive suspenso: ver em Configurações',
      })
      await expect(indicador).toBeVisible()
      expect(await gravacoes(pagina)).toBe(1) // nada enviado

      // O link leva à seção, com foco no título.
      await pagina.getByRole('link', { name: 'Principal' }).first().click()
      await indicador.click()
      await expect(pagina.getByRole('heading', { name: 'Google Drive' })).toBeFocused()

      await secaoDrive(pagina).getByRole('button', { name: 'Restaurar do Google Drive' }).click()
      const lista = pagina.getByRole('dialog', { name: 'Backups no Google Drive' })
      await expect(lista).toContainText('ainda não conferido')
      await lista.getByRole('button', { name: /^Restaurar o backup enviado em/ }).click()

      const confirmacao = pagina.getByRole('alertdialog', { name: 'Restaurar este backup?' })
      await expect(confirmacao).toContainText('Registros1')
      await expect(confirmacao).toContainText('o próximo envio vai substituir o backup de hoje')
      const substituir = confirmacao.getByRole('button', { name: 'Substituir dados' })
      await expect(substituir).toBeDisabled()
      const download = pagina.waitForEvent('download')
      await confirmacao.getByRole('button', { name: 'Baixar cópia dos dados atuais' }).click()
      expect((await download).suggestedFilename()).toMatch(/^study-manager-antes-da-restauracao-/)
      await substituir.click()

      const sucesso = pagina.getByRole('alertdialog', { name: 'Backup restaurado' })
      await expect(sucesso).toBeVisible()
      await sucesso.getByRole('button', { name: 'Recarregar' }).click()

      // Depois de recarregar: os dados estão lá e a suspensão sumiu.
      await pagina.goto('./#/cadastro')
      await expect(
        pagina.getByRole('button', { name: 'Polícia Federal', exact: true }),
      ).toBeVisible()
      await expect(indicador).toBeHidden()
      await pagina.goto('./#/configuracoes')
      await expect(secaoDrive(pagina)).not.toContainText(MENSAGEM_SUSPENSAO)
      await expect(secaoDrive(pagina).getByTestId('situacao-nuvem')).toContainText('Envio pendente')
      expect(novo.proibidas).toEqual([])
    } finally {
      await novo.contexto.close()
    }
  })
})

test('desconectar limpa o estado e não apaga nada no Drive', async ({ page }) => {
  await prepararDados(page)
  await conectar(page)
  const antes = await lerDrive(page)

  await secaoDrive(page).getByRole('button', { name: 'Desconectar' }).click()
  const dialogo = page.getByRole('alertdialog', { name: 'Desconectar do Google Drive?' })
  await expect(dialogo).toContainText('Desconectar não apaga nada no Google Drive')
  await dialogo.getByRole('button', { name: 'Desconectar' }).click()
  await expect(
    secaoDrive(page).getByRole('button', { name: 'Conectar ao Google Drive' }),
  ).toBeVisible()

  const depois = await lerDrive(page)
  expect(depois.arquivos.map((a) => a.meta.id)).toEqual(antes.arquivos.map((a) => a.meta.id))
  expect(depois.arquivos.every((a) => !a.lixeira)).toBe(true)
  expect(depois.revogacoes).toBe(1)

  // O estado local foi limpo: continua desconectado depois de recarregar.
  await page.reload()
  await expect(
    secaoDrive(page).getByRole('button', { name: 'Conectar ao Google Drive' }),
  ).toBeVisible()
})
