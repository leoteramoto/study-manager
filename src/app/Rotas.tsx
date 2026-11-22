import { Route, Routes } from 'react-router'
import { PaginaCadastro } from '@/features/cadastro/PaginaCadastro'
import { PaginaConfiguracoes } from '@/features/configuracoes/PaginaConfiguracoes'
import { PaginaEstatisticas } from '@/features/estatisticas/PaginaEstatisticas'
import { PaginaPrincipal } from '@/features/principal/PaginaPrincipal'
import { Layout } from './layout/Layout'
import { PaginaNaoEncontrada } from './PaginaNaoEncontrada'

export function Rotas() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PaginaPrincipal />} />
        <Route path="cadastro" element={<PaginaCadastro />} />
        <Route path="estatisticas" element={<PaginaEstatisticas />} />
        <Route path="configuracoes" element={<PaginaConfiguracoes />} />
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Route>
    </Routes>
  )
}
