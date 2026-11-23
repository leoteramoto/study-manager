import { DatabaseZapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TipoFalhaBanco } from '@/db/inicializar'
import { RestaurarBackup } from '@/features/backup/RestaurarBackup'
import { detectarFusoNavegador } from '@/lib/fuso'
import { recarregarPagina } from '@/lib/recarregar'

/**
 * Tela mostrada quando o banco não abre (RN36), no lugar de uma tela branca.
 * Não usa o layout nem o cronômetro, que dependem do banco.
 *
 * Versão mais nova: só "Recarregar", porque apagar destruiria dados bons.
 * Outras falhas: "Tentar novamente" ou restaurar um backup num banco recriado.
 */
export function TelaFalhaBanco({ tipo }: { tipo: TipoFalhaBanco }) {
  const versao = tipo === 'versao'

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <h1 className="flex items-center gap-2 text-lg">
              <DatabaseZapIcon className="text-destructive size-5" aria-hidden="true" />
              {versao
                ? 'Os dados foram gravados por uma versão mais nova do app'
                : 'Não foi possível abrir o banco de dados'}
            </h1>
          </CardTitle>
          <CardDescription>
            {versao
              ? 'Esta versão do Study Manager é mais antiga que os seus dados. Recarregue a página com internet para receber a versão atual. Nada foi apagado.'
              : 'O banco local do navegador não abriu ou está corrompido. Tente de novo; se o problema continuar, restaure um backup. Em janela anônima, alguns navegadores não oferecem o banco local.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {versao ? (
            <div>
              <Button onClick={recarregarPagina}>Recarregar</Button>
            </div>
          ) : (
            <>
              <div>
                <Button variant="outline" onClick={recarregarPagina}>
                  Tentar novamente
                </Button>
              </div>
              <RestaurarBackup modo="bancoComFalha" fuso={detectarFusoNavegador()} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
