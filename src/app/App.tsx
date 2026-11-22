import { HashRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProvedorTema } from './tema/ProvedorTema'
import { Rotas } from './Rotas'

export function App() {
  return (
    <ProvedorTema>
      <TooltipProvider>
        <HashRouter>
          <Rotas />
        </HashRouter>
      </TooltipProvider>
    </ProvedorTema>
  )
}
