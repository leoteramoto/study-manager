# Study Manager

Aplicativo web para planejar e controlar o tempo de estudo para concursos públicos, feito para substituir as planilhas manuais.

- **Local-first:** todos os dados ficam no navegador (IndexedDB). Não há servidor, login nem custo.
- **Offline:** depois da primeira visita, funciona sem internet e pode ser instalado como app (PWA).
- **Privacidade:** nenhum dado sai do seu computador. Sem analytics ou rastreadores.

A especificação completa está em [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md).

## Situação

| Fase | Conteúdo                                        | Situação  |
| ---- | ----------------------------------------------- | --------- |
| 1    | Fundação: projeto, layout, tema, banco, PWA, CI | Concluída |
| 2    | Cadastro de objetivos e matérias                | Concluída |
| 3    | Planejamento e tela Principal                   | Concluída |
| 4    | Cronômetro                                      | A fazer   |
| 5    | Estatísticas e lançamentos manuais              | A fazer   |
| 6    | Backup, configurações e acabamento              | A fazer   |

## Como usar

### Cadastro

Em **Cadastro**, crie seus **objetivos** (ex.: "Polícia Federal", sigla `PF`) e, dentro de cada um, as **matérias**.

- A **sigla** do objetivo tem até 10 letras (A–Z) ou números, é única e não pode ser alterada depois.
- Cada matéria recebe um **código** no formato `Matéria-SIGLA` (ex.: `Matemática-PF`). O código é único: não dá para ter duas matérias com o mesmo código, mesmo com maiúsculas diferentes. Ao renomear a matéria, o código muda junto, inclusive no histórico.
- O objetivo de uma matéria não pode ser trocado. Para usar a mesma matéria em outro objetivo, crie uma matéria nova nele.
- Nada é excluído: objetivos e matérias são **arquivados**. Arquivar um objetivo arquiva as matérias dele, e matérias arquivadas saem do planejamento. Para vê-los, ative **Mostrar arquivados**. Desarquivar um objetivo traz as matérias de volta; uma matéria só pode ser desarquivada se o objetivo dela estiver ativo.
- A ordem é ajustada com as setas de subir e descer.

### Principal (planejamento do mês)

Na tela **Principal** ficam o painel do mês e a tabela do planejamento.

- **Editar planejamento** abre a lista de matérias ativas, agrupadas por objetivo. Marque as que entram na meta do mês; elas podem ser de objetivos diferentes. Tirar uma matéria do planejamento não apaga o tempo estudado: ele continua no total do mês.
- **Meta mensal:** em horas, de 0,5 a 744. Digite no card do painel e tecle Enter (ou saia do campo); Esc cancela. Depois de definida, a meta não fica vazia: apagar o campo volta ao último valor.
- **Peso:** de 0,1 a 100, editado direto na tabela. Aceita vírgula ou ponto (`1,5` ou `1.5`); valores com mais de uma casa são arredondados (`1,25` vira `1,3`). Zero, negativo ou campo vazio voltam ao último valor.
- **Meta da matéria** = meta mensal × peso ÷ soma dos pesos. Ex.: meta de 100 h com pesos 2, 1 e 1 dá 50h00, 25h00 e 25h00.
- **% concluída** pode passar de 100%, mas só mostra 100% quando a meta foi atingida (99,6% aparece como 99%). Quando o tempo estudado chega à meta, o tempo restante mostra 0h00 e o selo **Meta atingida**. O tempo restante arredonda os minutos para cima, então só mostra 0h00 quando a meta foi mesmo atingida.
- O painel soma **todo** o tempo do mês, inclusive de matérias fora do planejamento e de lançamentos manuais. Com a meta definida, o % e o tempo restante do painel aparecem mesmo com o planejamento vazio.
- O mês segue o fuso configurado e vira sozinho, mesmo com o app aberto. Nenhum dado é zerado: o planejamento, os pesos e a meta continuam no mês seguinte.

## Requisitos

- Node.js 24 (LTS) e npm. Com [nvm](https://github.com/nvm-sh/nvm): `nvm use`.

## Instalação

```bash
npm ci
```

Para os testes E2E, instale também os navegadores do Playwright (uma vez):

```bash
npx playwright install chromium firefox
```

## Desenvolvimento

```bash
npm run dev       # servidor de desenvolvimento em http://localhost:5173
npm run lint      # ESLint + checagem de tipos
npm run format    # formata o código com o Prettier
```

No modo de desenvolvimento, a tela Principal mostra o botão **Popular dados de teste**, que cria objetivos, matérias, planejamento, meta e registros de exemplo. Ele só funciona com o banco vazio e não existe no build de produção. Para recomeçar do zero, apague o banco `study-manager` nas ferramentas do navegador (Aplicativo → IndexedDB).

O service worker do PWA não roda no modo de desenvolvimento. Para testar o modo offline e a instalação, use o build de produção:

```bash
npm run build && npm run preview   # http://localhost:4173
```

## Testes

```bash
npm test                # testes unitários e de componentes (Vitest)
npm run test:coverage   # idem, com cobertura (mínimo de 90% em src/domain)
npm run test:e2e        # testes ponta a ponta (Playwright, Chromium e Firefox)
```

## Estrutura

```
src/
├─ app/           # layout, rotas, tema
├─ db/            # schema Dexie, migrações e repositórios
├─ domain/        # regras de negócio em funções puras
├─ features/      # telas de cada área
├─ components/ui/ # componentes shadcn/ui
└─ lib/           # utilitários
tests/e2e/        # testes Playwright
scripts/          # scripts auxiliares (ex.: npm run icones)
```

## Deploy (GitHub Pages)

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda lint, formatação, testes com cobertura, `npm audit` e build em todo push e pull request. O deploy no GitHub Pages a partir da `main` já está pronto, mas **só é ativado de propósito**:

1. Crie o repositório no GitHub e envie o código.
2. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
3. Em **Settings → Secrets and variables → Actions → Variables**, crie a variável `DEPLOY_PAGES` com o valor `true`.
4. A partir daí, todo push na `main` que passar nas verificações publica o app em `https://<usuário>.github.io/<repositório>/`.

O caminho base é definido pela variável `VITE_BASE_PATH` (veja [`.env.example`](.env.example)). No CI ela vale `/<nome-do-repositório>/`; localmente, `/`.

## Backup e restauração

_Chega na Fase 6._ Os dados ficam só no navegador, então será possível exportar um arquivo JSON de backup e restaurá-lo em Configurações.

## Ícones

Os ícones do PWA são gerados por um script sem dependências externas:

```bash
npm run icones
```
