// Importado antes de qualquer outro módulo no main.tsx: os esquemas Zod são
// construídos no carregamento dos módulos e a opção precisa valer antes disso.
//
// Sem compilação JIT: o Zod testaria `Function('')`, o que a CSP
// (script-src 'self', sem 'unsafe-eval') bloqueia e o Firefox registra como violação.
import { z } from 'zod'

z.config({ jitless: true })
