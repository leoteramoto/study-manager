import { BarChart3, FolderTree, Home, Settings, type LucideIcon } from 'lucide-react'

export interface ItemNavegacao {
  rota: string
  rotulo: string
  icone: LucideIcon
}

export const ITENS_NAVEGACAO: readonly ItemNavegacao[] = [
  { rota: '/', rotulo: 'Principal', icone: Home },
  { rota: '/cadastro', rotulo: 'Cadastro', icone: FolderTree },
  { rota: '/estatisticas', rotulo: 'Estatísticas', icone: BarChart3 },
  { rota: '/configuracoes', rotulo: 'Configurações', icone: Settings },
]
