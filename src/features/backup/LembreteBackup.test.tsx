import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/banco'
import { garantirConfiguracoesPadrao } from '@/db/configuracoesRepositorio'
import { dbNuvem } from '@/db/bancoNuvem'
import { formatarDataHoraNoFuso } from '@/domain/tempo'
import { transformarEstadoNuvem } from '@/db/nuvemRepositorio'
import { baixarArquivo } from '@/lib/download'
import { ComNuvem } from '@/test/ComNuvem'
import { criarNuvemFalsa } from '@/test/nuvemFalsa'
import { LembreteBackup } from './LembreteBackup'

vi.mock('@/lib/download', () => ({ baixarArquivo: vi.fn() }))

const DIA = 24 * 60 * 60 * 1000

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  await garantirConfiguracoesPadrao()
})

afterEach(() => {
  db.close()
})

describe('LembreteBackup (RN34)', () => {
  it('aparece sem nenhum backup e some depois de "Fazer backup agora"', async () => {
    render(<LembreteBackup />)
    expect(
      await screen.findByText('Você ainda não fez nenhum backup dos seus dados.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fazer backup agora' }))
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Lembrete de backup' })).not.toBeInTheDocument()
    })
    expect(baixarArquivo).toHaveBeenCalledTimes(1)
  })

  it('aparece com backup de mais de 7 dias', async () => {
    await db.configuracoes.update('app', {
      ultimoBackupEm: new Date(Date.now() - 8 * DIA).toISOString(),
    })
    render(<LembreteBackup />)
    expect(await screen.findByText(/há mais de 7 dias/)).toBeInTheDocument()
  })

  it('não aparece com backup recente', async () => {
    await db.configuracoes.update('app', {
      ultimoBackupEm: new Date(Date.now() - 2 * DIA).toISOString(),
    })
    render(<LembreteBackup />)
    // Espera a consulta carregar antes de afirmar a ausência.
    await new Promise((resolver) => setTimeout(resolver, 100))
    expect(screen.queryByRole('region', { name: 'Lembrete de backup' })).not.toBeInTheDocument()
  })

  describe('com o Google Drive (RN50)', () => {
    beforeEach(async () => {
      await dbNuvem.delete()
      await dbNuvem.open()
    })

    afterEach(() => {
      dbNuvem.close()
    })

    async function envioNoDrive(diasAtras: number): Promise<string> {
      const ultimoEnvioEm = new Date(Date.now() - diasAtras * DIA).toISOString()
      await transformarEstadoNuvem((estado) => ({ ...estado, conectado: true, ultimoEnvioEm }))
      return ultimoEnvioEm
    }

    function montar() {
      const { orquestrador } = criarNuvemFalsa()
      render(
        <ComNuvem orquestrador={orquestrador}>
          <LembreteBackup />
        </ComNuvem>,
      )
      return orquestrador
    }

    it('envio recente ao Drive dispensa o lembrete, mesmo sem backup em arquivo', async () => {
      await envioNoDrive(1)
      const orquestrador = montar()
      await new Promise((resolver) => setTimeout(resolver, 100))
      expect(screen.queryByRole('region', { name: 'Lembrete de backup' })).not.toBeInTheDocument()
      orquestrador.encerrar()
    })

    it('usa o mais recente dos dois para o texto', async () => {
      await db.configuracoes.update('app', {
        ultimoBackupEm: new Date(Date.now() - 20 * DIA).toISOString(),
      })
      const envio = await envioNoDrive(9)
      const orquestrador = montar()
      const fuso = (await db.configuracoes.get('app'))?.fusoHorario ?? 'UTC'
      expect(
        await screen.findByText(
          `Seu último backup foi em ${formatarDataHoraNoFuso(envio, fuso)}, há mais de 7 dias.`,
        ),
      ).toBeInTheDocument()
      orquestrador.encerrar()
    })
  })
})
