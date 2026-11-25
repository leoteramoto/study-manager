// Restauração a partir do Google Drive (RN47), com o destino falso.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { dbNuvem } from '@/db/bancoNuvem'
import { gerarBackupValidado } from '@/db/backupRepositorio'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import {
  obterEstadoNuvem,
  registrarConexaoNuvem,
  registrarSuspensaoNuvem,
} from '@/db/nuvemRepositorio'
import { criarObjetivo } from '@/db/objetivosRepositorio'
import { popularDadosDeTeste } from '@/db/seedDesenvolvimento'
import { MENSAGENS_BACKUP, TAMANHO_MAXIMO_BACKUP_BYTES } from '@/domain/backup'
import { appPropertiesDoBackup, MENSAGEM_SUSPENSAO, nomeArquivoNuvem } from '@/domain/backupNuvem'
import { TEXTO_AVISO_DRIVE } from '@/features/backup/textosRestauracao'
import { avisarRestauracao } from '@/lib/canalRestauracao'
import { baixarArquivo } from '@/lib/download'
import { recarregarPagina } from '@/lib/recarregar'
import { ComNuvem } from '@/test/ComNuvem'
import { criarNuvemFalsa } from '@/test/nuvemFalsa'
import type { DestinoFalso } from './destinoFalso'
import { MENSAGENS_NUVEM, type OrquestradorNuvem } from './orquestrador'
import { SecaoGoogleDrive } from './SecaoGoogleDrive'

vi.mock('@/lib/download', () => ({ baixarArquivo: vi.fn() }))
vi.mock('@/lib/recarregar', () => ({ recarregarPagina: vi.fn() }))
vi.mock('@/lib/canalRestauracao', () => ({ avisarRestauracao: vi.fn() }))

const AGORA = new Date('2026-11-22T15:00:00.000Z')

let orquestradores: OrquestradorNuvem[] = []
/** Backup válido dos dados de teste (2 objetivos, 8 registros, 1 excluído). */
let conteudoValido = ''
let pasta = ''

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
  await db.configuracoes.update('app', { fusoHorario: 'America/Sao_Paulo' })
  await popularDadosDeTeste(AGORA)
  conteudoValido = (await gerarBackupValidado(AGORA)).arquivo.conteudo
  // Os dados deste navegador mudam depois do backup: 3 objetivos.
  await criarObjetivo({ nome: 'Depois do backup', sigla: 'DEP' })
  await dbNuvem.delete()
  await dbNuvem.open()
})

afterEach(async () => {
  for (const orquestrador of orquestradores) {
    orquestrador.encerrar()
    await orquestrador.concluirPendentes()
  }
  orquestradores = []
  db.close()
  dbNuvem.close()
})

/** Conectado ao Drive falso, com token, com o envio automático suspenso. */
async function montar() {
  const nuvem = criarNuvemFalsa()
  orquestradores.push(nuvem.orquestrador)
  nuvem.destino.definirToken(true)
  pasta = await nuvem.destino.garantirPasta(null)
  await registrarConexaoNuvem({ email: 'pessoa@example.com', pastaId: pasta, referenciaDrive: 50 })
  await registrarSuspensaoNuvem()
  render(
    <ComNuvem orquestrador={nuvem.orquestrador}>
      <SecaoGoogleDrive />
    </ComNuvem>,
  )
  await screen.findByText(MENSAGEM_SUSPENSAO)
  return nuvem
}

function semear(destino: DestinoFalso, dia: string, conteudo: string, comResumo = true): string {
  const marca = appPropertiesDoBackup(dia, {
    exportadoEm: `${dia}T12:00:00.000Z`,
    objetivos: 2,
    materias: 5,
    registros: 8,
    registrosExcluidos: 1,
  })
  const propriedades = comResumo ? marca : { studyManager: 'backup', dia }
  return destino.semear(pasta, nomeArquivoNuvem(dia), propriedades, conteudo)
}

async function abrirLista() {
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar do Google Drive' }))
  return screen.findByRole('dialog', { name: 'Backups no Google Drive' })
}

async function escolherPrimeiro() {
  const lista = await abrirLista()
  const [primeiro] = within(lista).getAllByRole('button', { name: /^Restaurar o backup/ })
  if (!primeiro) throw new Error('lista vazia')
  await userEvent.click(primeiro)
}

async function siglasLocais(): Promise<string[]> {
  return (await db.objetivos.toArray()).map((o) => o.sigla).sort()
}

describe('lista dos backups do Drive', () => {
  it('mostra data/hora e o resumo do Drive como não conferido, do mais recente ao mais antigo', async () => {
    const { destino } = await montar()
    semear(destino, '2026-11-20', conteudoValido, false)
    semear(destino, '2026-11-21', conteudoValido)

    const lista = await abrirLista()
    expect(lista).toHaveTextContent('ainda não conferida')
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent(
      'Informado pelo Drive, ainda não conferido: 2 objetivos, 5 matérias, 8 registros.',
    )
    expect(itens[1]).toHaveTextContent('Resumo não informado pelo Drive.')
    expect(itens[0]).toHaveTextContent(/Enviado em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/)
  })

  it('lista vazia tem mensagem própria', async () => {
    await montar()
    const lista = await abrirLista()
    expect(lista).toHaveTextContent(
      'Nenhum backup do Study Manager foi encontrado na pasta do Google Drive.',
    )
  })

  it('sem token e com o popup recusado: mensagem amigável e nada muda', async () => {
    const { destino } = await montar()
    destino.definirToken(false)
    destino.modoAutorizacao = 'nega'
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar do Google Drive' }))
    expect(await screen.findByText(MENSAGENS_NUVEM.restauracaoSemAutorizacao)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(destino.pedidosAutorizacao.at(-1)).toEqual({
      dicaEmail: 'pessoa@example.com',
      escolherConta: false,
    })
  })

  it('sem internet: mensagem amigável', async () => {
    const { destino } = await montar()
    destino.falhas.push('offline')
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar do Google Drive' }))
    expect(await screen.findByText(MENSAGENS_NUVEM.restauracaoOffline)).toBeInTheDocument()
  })
})

describe('restaurar o backup escolhido', () => {
  it('checksum alterado no Drive: rejeitado, nada substituído, nenhuma cópia feita', async () => {
    const { destino } = await montar()
    const alterado = conteudoValido.replace('"Polícia Federal"', '"Policia Federal"')
    expect(alterado).not.toBe(conteudoValido)
    semear(destino, '2026-11-21', alterado)

    await escolherPrimeiro()
    expect(await screen.findByText(MENSAGENS_BACKUP.checksum)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(baixarArquivo).not.toHaveBeenCalled()
    expect(await siglasLocais()).toEqual(['CF', 'DEP', 'PF'])
    expect((await obterEstadoNuvem()).motivoErro).toBe('suspenso')
  })

  it('grande demais: rejeitado antes de baixar', async () => {
    const { destino } = await montar()
    const id = semear(destino, '2026-11-21', conteudoValido)
    const arquivo = destino.arquivos.get(id)
    if (!arquivo) throw new Error('arquivo não semeado')
    arquivo.meta = { ...arquivo.meta, size: TAMANHO_MAXIMO_BACKUP_BYTES + 1 }

    await escolherPrimeiro()
    expect(await screen.findByText(MENSAGENS_BACKUP.grande)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await siglasLocais()).toEqual(['CF', 'DEP', 'PF'])
  })

  it('cancelar na confirmação: nada muda', async () => {
    const { destino } = await montar()
    semear(destino, '2026-11-21', conteudoValido)
    await escolherPrimeiro()

    const dialogo = await screen.findByRole('alertdialog', { name: 'Restaurar este backup?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(await siglasLocais()).toEqual(['CF', 'DEP', 'PF'])
    expect(baixarArquivo).not.toHaveBeenCalled()
    expect(await obterEstadoNuvem()).toMatchObject({
      motivoErro: 'suspenso',
      registrosUltimoEnvio: 50,
    })
  })

  it('sucesso: resumo do arquivo validado, cópia antes, substituição, "Recarregar" e nova referência', async () => {
    const { destino } = await montar()
    // O resumo do Drive mente (99 registros): a confirmação usa o arquivo validado.
    destino.semear(
      pasta,
      nomeArquivoNuvem('2026-11-21'),
      {
        ...appPropertiesDoBackup('2026-11-21', {
          exportadoEm: '2026-11-21T12:00:00.000Z',
          objetivos: 9,
          materias: 9,
          registros: 99,
          registrosExcluidos: 0,
        }),
      },
      conteudoValido,
    )
    await escolherPrimeiro()

    const dialogo = await screen.findByRole('alertdialog', { name: 'Restaurar este backup?' })
    expect(dialogo).toHaveTextContent('Objetivos2')
    expect(dialogo).toHaveTextContent('Registros8 (1 excluídos)')
    expect(dialogo).toHaveTextContent(TEXTO_AVISO_DRIVE)
    const substituir = within(dialogo).getByRole('button', { name: 'Substituir dados' })
    expect(substituir).toBeDisabled()

    // A cópia dos dados atuais sai antes da substituição (3 objetivos).
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Baixar cópia dos dados atuais' }),
    )
    await waitFor(() => {
      expect(baixarArquivo).toHaveBeenCalledTimes(1)
    })
    const [nome, copia] = vi.mocked(baixarArquivo).mock.calls[0] ?? []
    expect(nome).toMatch(/^study-manager-antes-da-restauracao-/)
    expect(
      (JSON.parse(copia ?? '') as { dados: { objetivos: unknown[] } }).dados.objetivos,
    ).toHaveLength(3)
    expect(await siglasLocais()).toEqual(['CF', 'DEP', 'PF'])

    await waitFor(() => {
      expect(substituir).toBeEnabled()
    })
    await userEvent.click(substituir)
    const sucesso = await screen.findByRole('alertdialog', { name: 'Backup restaurado' })
    expect(await siglasLocais()).toEqual(['CF', 'PF'])
    expect(await db.registros.count()).toBe(8)
    expect(avisarRestauracao).toHaveBeenCalledTimes(1)
    await waitFor(async () => {
      expect(await obterEstadoNuvem()).toMatchObject({
        situacao: 'pendente',
        motivoErro: null,
        mensagemErro: null,
        registrosUltimoEnvio: 8,
      })
    })

    await userEvent.click(within(sucesso).getByRole('button', { name: 'Recarregar' }))
    expect(recarregarPagina).toHaveBeenCalledTimes(1)
  })

  it('falha de rede no download: mensagem amigável e nada muda', async () => {
    const { destino } = await montar()
    semear(destino, '2026-11-21', conteudoValido)
    const lista = await abrirLista()
    destino.falhas.push('offline')
    const [primeiro] = within(lista).getAllByRole('button', { name: /^Restaurar o backup/ })
    if (!primeiro) throw new Error('lista vazia')
    await userEvent.click(primeiro)
    expect(await screen.findByText(MENSAGENS_NUVEM.restauracaoOffline)).toBeInTheDocument()
    expect(await siglasLocais()).toEqual(['CF', 'DEP', 'PF'])
  })
})
