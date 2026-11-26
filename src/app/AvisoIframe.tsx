import { ShieldAlertIcon } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Mostrado no lugar do app quando ele está dentro de um iframe (Fase 8).
 * Nada do app é montado: nem banco, nem service worker, nem interface. O
 * aviso não redireciona a janela de cima nem oferece botão de ação.
 */
export function AvisoIframe() {
  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <h1 className="flex items-center gap-2 text-lg">
              <ShieldAlertIcon className="text-destructive size-5" aria-hidden="true" />O Study
              Manager não abre dentro de outra página
            </h1>
          </CardTitle>
          <CardDescription>
            Por segurança, o app não funciona dentro de um quadro (iframe). Abra o endereço do Study
            Manager diretamente numa aba do navegador.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}
