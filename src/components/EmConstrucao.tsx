import { Card, CardContent } from '@/components/ui/card'

export function EmConstrucao({ fase }: { fase: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground">Em construção — chega na Fase {fase}.</p>
      </CardContent>
    </Card>
  )
}
