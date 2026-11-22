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
| 2    | Cadastro de objetivos e matérias                | A fazer   |
| 3    | Planejamento e tela Principal                   | A fazer   |
| 4    | Cronômetro                                      | A fazer   |
| 5    | Estatísticas e lançamentos manuais              | A fazer   |
| 6    | Backup, configurações e acabamento              | A fazer   |

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
