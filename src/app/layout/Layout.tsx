import { Outlet } from 'react-router'
import { LembreteBackup } from '@/features/backup/LembreteBackup'
import { IndicadorSessao } from '@/features/cronometro/IndicadorSessao'
import { ProvedorCronometro } from '@/features/cronometro/ProvedorCronometro'
import { AvisoNovaVersao } from '../pwa/AvisoNovaVersao'
import { SeletorTema } from '../tema/SeletorTema'
import { BarraLateral } from './BarraLateral'
import { Marca } from './Marca'
import { MenuMobile } from './MenuMobile'

export function Layout() {
  return (
    <ProvedorCronometro>
      <div className="min-h-svh lg:pl-64">
        <a
          href="#conteudo"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          onClick={(evento) => {
            // Com HashRouter, o âncora mudaria a rota: movemos o foco manualmente.
            evento.preventDefault()
            document.getElementById('conteudo')?.focus()
          }}
        >
          Pular para o conteúdo
        </a>
        <BarraLateral />
        <LembreteBackup />
        <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur lg:px-8">
          <MenuMobile />
          <div className="lg:hidden">
            <Marca />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="lg:hidden">
              <IndicadorSessao compacto />
            </div>
            <AvisoNovaVersao />
            <SeletorTema />
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="p-4 outline-none lg:p-8">
          <Outlet />
        </main>
      </div>
    </ProvedorCronometro>
  )
}
