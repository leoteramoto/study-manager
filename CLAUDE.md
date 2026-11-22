# CLAUDE.md — Study Manager

## Idioma
- **Responda sempre em português do Brasil**, mesmo que a especificação ou o prompt estejam em inglês.
- Textos da interface, comentários, mensagens de commit e README em português do Brasil.

## O projeto
O Study Manager é uma SPA/PWA local-first para planejar e controlar estudos de concurso. Ela substitui planilhas manuais. Não tem servidor nem login, e todos os dados ficam no IndexedDB do navegador, com backup em JSON. O uso principal é no computador; o celular vem depois.

A especificação completa está em `docs/ESPECIFICACAO.md`. **Ela é a fonte da verdade.** As regras são citadas pelo número: RF01–RF10 e RN01–RN39.

## Stack
React + TypeScript (strict) + Vite · Tailwind CSS + shadcn/ui · React Router · Dexie (IndexedDB) · Zod · date-fns + @date-fns/tz · vite-plugin-pwa · Vitest + Testing Library + fake-indexeddb · Playwright · ESLint + Prettier.
Não adicione dependências fora dessa lista sem perguntar.

## Comandos
```bash
npm run dev        # servidor de desenvolvimento
npm run lint       # ESLint + checagem de tipos
npm test           # Vitest (unitários e componentes)
npm run test:e2e   # Playwright
npm run build      # build de produção
```
Antes de dizer que uma tarefa está pronta, rode `lint`, `test` e `build`.

## Arquitetura
- `src/domain/`: regras de negócio em **funções puras**, sem React e sem Dexie. Cobertura mínima de 90%.
- `src/db/`: schema Dexie, migrações e repositórios. Todo acesso ao banco passa por aqui.
- `src/features/<área>/`: telas e componentes de cada área.
- `src/components/ui/`: componentes shadcn.

## Invariantes (não violar)
1. **Nada derivado é gravado no banco.** Metas individuais, percentuais, totais e tempo restante são sempre calculados a partir dos dados-base.
2. **A virada do mês é um filtro de data no fuso configurado.** Não existe rotina que zere dados.
3. **O tempo do cronômetro vem do relógio** (`acumuladoSeg + (agora − segmentoInicioEm)`), nunca da contagem de ticks. Heartbeat a cada 5 s; um intervalo maior que 30 s indica suspensão, e então a sessão é pausada no último heartbeat.
4. **Nenhum registro de estudo é gravado sem confirmação explícita do usuário.**
5. **Não existe exclusão física.** Objetivos e matérias são arquivados; registros recebem exclusão lógica (`excluidoEm`). A única exceção é a restauração de backup confirmada pelo usuário.
6. A **sigla** do objetivo e o **objetivo** de uma matéria são imutáveis. O código `NomeDaMatéria-SIGLA` é único e é recalculado quando a matéria é renomeada.
7. Registros do cronômetro podem ser excluídos, mas **não editados**. Só lançamentos manuais podem ser editados.
8. Todo backup importado é dado não confiável: validar com Zod, conferir o checksum e a integridade referencial, e substituir tudo numa única transação.
9. Somas sempre em segundos. A % é exibida sem casas decimais, mas calculada com precisão total.

## Convenções
- Identificadores em português, sem acentos (`calcularMetaIndividual`). PascalCase em componentes, um componente por arquivo.
- Sem `any`. Sem `dangerouslySetInnerHTML`, `eval` ou CDNs externas.
- Commits pequenos no padrão Conventional Commits, em português (`feat(cronometro): ...`).
- Datas-hora gravadas em ISO UTC; datas de calendário em `YYYY-MM-DD`, calculadas no fuso configurado.

## Como trabalhar
- Implemente **uma fase por vez** (veja o plano na especificação). Ao final de cada fase, mostre os resultados de lint, testes e build e **aguarde confirmação**.
- **Não invente regras de negócio** e não altere requisitos confirmados. Diante de ambiguidade, conflito ou caso não coberto, **pare e pergunte**.
- Ao propor algo, separe o que é **requisito confirmado**, o que é **sugestão** e o que é **pendência**.
- Não implemente itens das listas "Depois" ou "Fora de escopo" sem autorização.
- Mantenha o README atualizado.
