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

## Decisões técnicas da Fase 1
- **HashRouter** (`/#/cadastro`): o GitHub Pages não tem fallback de SPA, e o hash funciona em qualquer hospedagem estática (e no futuro Tauri).
- **Tema no localStorage** (chave `study-manager:tema`: `sistema` | `claro` | `escuro`). É preferência visual: fica fora da tabela `configuracoes` e **fora do backup**. O `public/tema.js` aplica o tema antes do React, para não piscar.
- **CSP com `style-src 'self' 'unsafe-inline'`**: componentes Radix/shadcn injetam `<style>` em tempo de execução. Scripts continuam restritos a `'self'`. A meta CSP só entra no build de produção, porque o dev server do Vite usa scripts inline.
- **TypeScript 6.0**, não 7.x: o typescript-eslint exige `typescript <6.1.0`. Só atualizar quando ele aceitar o 7.
- **Deploy travado pela variável `DEPLOY_PAGES`**: o job de deploy do `ci.yml` só roda na `main` quando a variável do repositório `DEPLOY_PAGES` vale `true`.
- **Persistência pedida sem bloquear a abertura**: `navigator.storage.persist()` é chamado só na primeira execução e **não é aguardado**. No Firefox ele abre um aviso de permissão e a promessa só termina quando o usuário responde, o que deixava o app em tela branca.

## Decisões da Fase 2 (casos não cobertos pela especificação, confirmados pelo usuário)
- **Desarquivamento simétrico:** desarquivar o objetivo desarquiva todas as matérias dele. Desarquivar uma matéria com o objetivo arquivado é bloqueado ("Desarquive o objetivo primeiro"). A matéria desarquivada **não** volta ao planejamento.
- **Não se cria matéria em objetivo arquivado** (consequência da regra acima).
- **Nome normalizado ao salvar:** trim e espaços internos repetidos reduzidos a um (`normalizarNome`). Comparação de sigla/código: NFC + minúsculas `pt-BR`; acentos contam.
- **Unicidade de sigla e código inclui arquivados.** O índice `&codigo` do Dexie diferencia maiúsculas; a regra sem diferenciar fica em `domain/codigo.ts` e é revalidada dentro da transação.
- **Cor:** paleta de 12 cores (`PALETA_MATERIAS`, rodízio pela quantidade de matérias) mais `<input type="color">`.
- **Confirmação só ao arquivar objetivo**; matéria é arquivada direto.
- **Subir/descer troca com o vizinho da lista visível** (com arquivados ocultos, eles são ignorados).

### Pendências
- **Fase 4:** trocar o `registerType: 'autoUpdate'` do PWA (em `vite.config.ts`) por um aviso de nova versão (`prompt`), para não recarregar a página com o cronômetro rodando.

## Decisões da Fase 3 (casos não cobertos pela especificação, confirmados pelo usuário)
- **% geral e tempo restante do painel** usam **todo** o tempo do mês (inclui matérias fora do planejamento e lançamentos manuais) ÷ meta mensal. Com meta definida e **planejamento vazio**, % e restante **são calculados** assim mesmo, e o aviso "Adicione matérias ao planejamento" continua. Só sem meta eles mostram "—".
- **% nunca mostra 100% sem a meta atingida:** o arredondamento padrão vale, mas se ele der 100% ou mais com a meta não atingida, a tela mostra 99% (99,6% → 99%). Vale para o painel e para a tabela.
- **Números decimais:** `interpretarNumeroBr` aceita **vírgula e ponto** como separador decimal (não há separador de milhar nesses campos: peso ≤ 100, meta ≤ 744). "1,5" → 1.5; "1.5" → 1.5.
- **Peso com mais de uma casa** é **arredondado para 0,1** e gravado ("1,25" → 1,3). O arredondamento é imune a erro de ponto flutuante (1,15 → 1,2; 1,05 → 1,1; 2,25 → 2,3); nunca usar `Math.round(x * 10)` direto.
- **Meta mensal não pode ser apagada:** campo vazio ou inválido volta ao último valor válido. Ela só fica vazia antes da primeira definição.
- **Arredondamento na exibição:** tempo estudado e metas arredondam os minutos **para baixo**; o **tempo restante arredonda para cima**, para nunca mostrar "0h00" sem a meta estar atingida (40 s faltando → "0h01").
- **Virada do mês com o app aberto:** o mês da tela Principal é calculado a partir de `useAgora` (atualizado a cada minuto) no fuso configurado, e a consulta de registros depende dele.
- **Seed de desenvolvimento:** botão "Popular dados de teste" na Principal, só em `import.meta.env.DEV`; só roda com o banco vazio e não apaga nada. O texto não pode aparecer no `dist/`.
- **Tabela principal** mostra só as matérias do planejamento. Peso e meta são gravados no blur/Enter (Esc cancela). Remover do planejamento não pede confirmação (nenhum registro é apagado).
