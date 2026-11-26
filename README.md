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
| 4    | Cronômetro                                      | Concluída |
| 5    | Estatísticas e lançamentos manuais              | Concluída |
| 6    | Backup, configurações e acabamento              | Concluída |
| 7    | Backup automático no Google Drive (opcional)    | Concluída |
| 8    | Publicação no GitHub Pages                      | Concluída |

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

### Cronômetro

O card **Cronômetro** fica na tela Principal. A sessão ativa aparece na barra lateral (no celular, no cabeçalho) em todas as telas; clicando nela você volta à Principal.

- Escolha uma matéria do planejamento e a duração (1 a 480 minutos; o campo lembra o último valor) e clique em **Iniciar**. Sem matérias no planejamento, o cronômetro fica indisponível.
- **Pausar/Continuar** (ou a tecla **Espaço**, fora de campos e botões), **Encerrar** (vai para a revisão antes do fim) e **Cancelar sessão** (descarta, depois de confirmar). Só existe uma sessão por vez.
- Quando o tempo acaba, o app abre a revisão em qualquer tela, toca o som (se ativado) e, com a aba em segundo plano, envia uma notificação do sistema. Para receber notificações, permita-as em **Configurações → Notificações**.
- **Nada é registrado sem clicar em Confirmar.** A revisão mostra matéria, código, objetivo, data, início, término, tempo estudado, tempo planejado e o tipo de encerramento. Sessões com menos de 1 minuto não podem ser registradas. O estudo conta para o dia do início, mesmo que passe da meia-noite.
- O tempo vem sempre do relógio, não de uma contagem. Se o computador dormir (ou o navegador congelar ou descarregar a aba), a sessão é pausada no último sinal de vida, a cada 5 s, e nada além disso é contado. O aviso mostra quanto tempo ficou de fora e o botão **Contar esse tempo**, para somar o intervalo se você estudou nele.
- Fechar ou recarregar a aba com uma sessão pede confirmação. Ao reabrir o app, aparece **Sessão interrompida encontrada**, com as opções Continuar, Encerrar e revisar ou Descartar.
- Com o app aberto em várias abas, uma só cuida da sessão (e toca o alarme). Abrir outra aba não interrompe nada, e se a aba principal fechar, outra assume sem pausar.

**Para o cronômetro não ser pausado à toa:** deixe a aba do app aberta durante a sessão (de preferência instale-o como app) e, no Chrome, inclua o site em **Configurações → Desempenho → Sempre manter estes sites ativos**, para a Economia de memória não descarregar a aba.

### Estatísticas e lançamentos manuais

Em **Estatísticas** fica todo o histórico, separado por ano e por mês.

- O seletor de **Ano** lista os anos com estudos e o ano atual. Cada ano tem as abas **Jan a Dez** e **Ano**. A tela abre no mês atual (em tela estreita, a aba dele rola para ficar visível) e, com o app aberto, acompanha a virada do mês; se você escolher outro mês, ele fica selecionado. Ao trocar de ano, a aba do mês é mantida.
- **Aba do mês:** o total do mês, o **Histórico** (data, início, término, tempo em minutos, matéria, origem e ações; do mais recente para o mais antigo, com os lançamentos manuais depois dos registros do cronômetro do mesmo dia) e o **Ranking** das matérias estudadas no mês, inclusive arquivadas.
- **Aba Ano:** o total do ano, o total de cada um dos 12 meses e o tempo de cada matéria estudada no ano.
- **Lançar estudo manual:** data (hoje ou antes, nunca no futuro, pelo fuso configurado), tempo de 1 a 480 minutos e uma matéria ativa de qualquer objetivo, mesmo fora do planejamento. O lançamento conta em todas as estatísticas e na tela Principal.
- **Editar** existe só para lançamentos manuais (data, tempo e matéria). Se a matéria foi arquivada depois, dá para editar mantendo-a, mas não trocar para outra arquivada. Registros do cronômetro não podem ser editados, só excluídos.
- **Excluir** pede confirmação. O registro some das telas e das somas, mas continua guardado no banco e nos backups.
- A tela Principal e as Estatísticas somam os mesmos registros, então os totais do mês batem. A soma é feita em segundos; cada linha arredonda os minutos para baixo, então a soma das linhas exibidas pode ficar um ou dois minutos abaixo do total.
- Os meses usam a data gravada em cada registro (a do início, no fuso configurado). Mudar o fuso depois não move nenhum estudo de mês.

### Configurações

- **Fuso horário:** Fernando de Noronha, Brasília, Amazonas, Acre ou **Outros** (qualquer fuso IANA, como `Europe/Lisbon`). O fuso define a data de hoje, o mês atual e a data dos registros novos. **Registros já gravados mantêm a data.**
- **Som:** liga ou desliga o som do fim do cronômetro, escolhe entre 3 sons e ajusta o volume. **Testar** toca o som escolhido mesmo com o som desligado.
- **Notificações:** pede a permissão do navegador e mostra a situação atual.
- **Armazenamento:** mostra se o navegador guarda os dados de forma persistente (sem apagá-los por falta de espaço). Quando não guarda, oferece **Pedir armazenamento persistente**.
- **Backup:** exportar e restaurar (veja [Backup e restauração](#backup-e-restauração)).

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

O service worker do PWA não roda no modo de desenvolvimento. Para testar o modo offline e a instalação, use o build de produção (se `http://localhost:4173` mostrar uma versão antiga, é o service worker de um build anterior: clique em **Atualizar** no aviso de nova versão ou limpe os dados do site nas ferramentas do navegador):

```bash
npm run build && npm run preview   # http://localhost:4173
```

## Testes

```bash
npm test                # testes unitários e de componentes (Vitest)
npm run test:coverage   # idem, com cobertura (mínimo de 90% em src/domain)
npm run test:e2e        # testes ponta a ponta (Playwright, Chromium e Firefox)
```

Os E2E cobrem os fluxos cadastro → planejamento → cronômetro → confirmação → estatísticas, a recuperação de sessão, o backup e a restauração (com outra aba aberta e com arquivo alterado), e a tela de falha do banco. O teste [`acessibilidade.spec.ts`](tests/e2e/acessibilidade.spec.ts) verifica as regras WCAG 2.1 A/AA (inclusive contraste) com o axe nas 4 telas e nos diálogos principais, nos temas claro e escuro, e confere que nenhuma tela rola de lado em 360 px.

O build usado pelo E2E define `VITE_FONTE_TICKS=principal`: o cronômetro passa a usar o `setInterval` da página em vez do Web Worker, para o `page.clock` do Playwright controlar o tempo. O worker só avisa "verifique agora" e nunca informa tempo, então o cálculo é o mesmo nos dois casos.

O Playwright sobe **três builds**. O normal, sem `VITE_GOOGLE_CLIENT_ID` (a variável é forçada vazia, então um `.env.local` com o ID real nunca entra no E2E), roda os testes de sempre e o [`sem-google.spec.ts`](tests/e2e/sem-google.spec.ts). O segundo, em `dist-e2e-nuvem/` na porta 4181, usa um Client ID de teste e `VITE_DESTINO_NUVEM=falso`: o backup no Google Drive existe, mas com um destino falso que guarda o "Drive" no `localStorage` e nunca fala com o Google. Ele roda os `*nuvem.spec.ts` (fluxos e acessibilidade do Drive), que bloqueiam e conferem que nenhuma requisição sai para `accounts.google.com` ou `googleapis.com`. O `npm run verificar:dist-google` confere que o destino falso não existe nos builds normais. O terceiro, em `dist-e2e-base/` na porta 4182, é servido sob `/study-manager/`, como no GitHub Pages, com o worker do cronômetro de verdade. Ele roda o [`caminho-base.spec.ts`](tests/e2e/caminho-base.spec.ts): navega, toca o som de teste, confere o escopo do service worker e o worker, e verifica que nenhuma requisição sai do caminho.

## Atualizações do app

Quando sai uma versão nova, o cabeçalho mostra **Nova versão disponível** e o botão **Atualizar**. O app nunca recarrega sozinho, e o botão fica desabilitado enquanto houver uma sessão do cronômetro.

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
scripts/          # scripts auxiliares (npm run icones, npm run sons)
```

## Deploy (GitHub Pages)

O app é publicado em `https://<usuário>.github.io/study-manager/`. O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda lint, formatação, a checagem do README, testes com cobertura, `npm audit`, build e as verificações de build em todo push e pull request. O deploy a partir da `main` **só roda quando é ativado de propósito** (variável `DEPLOY_PAGES`).

### Publicar pela primeira vez

**No GitHub** (repositório → **Settings**):

1. **General → Danger Zone → Change visibility:** deixe o repositório **público**. No plano gratuito, o Pages só publica repositórios públicos. Tudo fica visível: código, histórico e o e-mail de autor dos commits.
2. **Pages → Build and deployment → Source:** escolha **GitHub Actions**.
3. **Secrets and variables → Actions → aba Variables** (não **Secrets**): crie
   - `VITE_GOOGLE_CLIENT_ID` com o ID do cliente OAuth (sem ela, o app sai sem o backup no Google Drive);
   - `DEPLOY_PAGES` com o valor `true`.

**No Google Cloud** (só se for usar o backup no Drive):

1. Em **Google Auth Platform → Clientes**, abra o cliente do app e acrescente em **Origens JavaScript autorizadas** só `https://<usuário>.github.io`: sem `/study-manager`, sem barra no final. O Google não aceita caminho na origem. Veja também [Quando publicar no GitHub Pages](#quando-publicar-no-github-pages).
2. Escolha o modo do app em **Google Auth Platform → Público**: manter **Em teste** (você reconecta a cada 7 dias) ou publicar (**Em produção**). Veja [Reconsentimento a cada 7 dias no modo Teste](#reconsentimento-a-cada-7-dias-no-modo-teste).

Depois disso, todo push na `main` que passar nas verificações publica o app. O deploy aparece na aba **Actions** e o endereço em **Settings → Pages**.

### Levar os dados do localhost para o endereço novo

Os dados ficam no navegador e são separados por endereço: o app em `https://<usuário>.github.io/study-manager/` começa vazio, mesmo no mesmo computador e navegador. Nada passa sozinho.

1. No endereço antigo (por exemplo, `http://localhost:4173`), faça um backup: **Configurações → Backup → Exportar backup**. Se usa o Drive, clique também em **Fazer backup agora**.
2. Abra o endereço novo e restaure:
   - **pelo arquivo:** **Configurações → Backup → Restaurar de um backup**; ou
   - **pelo Drive:** **Conectar ao Google Drive** e depois **Restaurar do Google Drive**.
3. **Restaure antes de fazer qualquer envio pelo endereço novo.** Com o app vazio, o envio automático fica suspenso para não sobrescrever o backup bom do Drive (**Backup no Drive suspenso**). A restauração tira a suspensão. Não use **Fazer backup agora** nem confirme o envio com o app vazio.
4. Confira os dados e só então deixe de usar o endereço antigo.

### Instalar o app

Abra `https://<usuário>.github.io/study-manager/` no Chrome ou no Edge e use **Instalar app** (ícone na barra de endereço ou menu ⋮ → **Transmitir, salvar e compartilhar → Instalar página como app**). Um app instalado a partir do localhost é outro app, com outros dados: desinstale o antigo depois de migrar.

### Segurança no GitHub Pages

- **Origem compartilhada:** todos os sites do Pages de uma mesma conta dividem a origem `https://<usuário>.github.io`. Banco do navegador, `localStorage` e a origem autorizada no Google valem para todos eles. **Não publique outro site no Pages desta conta:** qualquer outro app em `https://<usuário>.github.io/...` poderia ler e apagar os dados deste e usar a autorização do Google Drive. Se precisar publicar outro site, use um domínio próprio para um dos dois ou outra conta do GitHub.
- **Proteção contra iframe:** o GitHub Pages não permite mandar `X-Frame-Options`, e a CSP por `<meta>` ignora `frame-ancestors`. Por isso o próprio app confere se está dentro de um quadro (iframe) e, se estiver, não monta nada (nem banco, nem service worker): mostra só o aviso "O Study Manager não abre dentro de outra página". Ele não tenta redirecionar a página de fora. Coberto por [`iframe.spec.ts`](tests/e2e/iframe.spec.ts).
- **CSP:** vai numa `<meta>` do `index.html`, porque o Pages não aceita cabeçalhos próprios. Sem cabeçalhos, também não há relatório de violações, e o service worker e o worker do cronômetro rodam sem CSP. Os dois só executam código do próprio app.

### Detalhes do build

O caminho base é definido pela variável `VITE_BASE_PATH` (veja [`.env.example`](.env.example)). No CI ela vale `/<nome-do-repositório>/`; localmente, `/`. O `npm run verificar:build-base` (também no CI) gera o build com `/study-manager/` e confere que HTML, manifest, service worker, pré-cache, worker e sons ficam sob o caminho, que nenhum arquivo aponta para a raiz e que a CSP é a mesma do build na raiz. Se o repositório mudar de nome, mude também a constante `BASE` do script.

**`npm audit`:** o CI falha com vulnerabilidades altas ou críticas. Hoje restam 4 moderadas, todas em dependências de desenvolvimento usadas só no build: `vite-plugin-pwa` → `workbox-build` → `glob`/`minimatch`. Nada disso vai para o app publicado (`npm audit --omit=dev` não encontra nenhuma). A correção sugerida pelo npm rebaixaria o `vite-plugin-pwa` para uma versão incompatível, então elas ficam até o `workbox-build` atualizar o `glob`.

## Backup e restauração

Os dados ficam só no navegador. **Faça backups com frequência**: se o navegador apagar os dados do site, o backup é a única cópia.

**Exportar:** em **Configurações → Backup**, clique em **Exportar backup**. O app baixa `study-manager-backup-AAAA-MM-DD-HHmm.json` com tudo: objetivos e matérias (inclusive arquivados), planejamento, registros (inclusive os excluídos) e configurações. A sessão do cronômetro em andamento não entra. Antes de baixar, o app valida o próprio arquivo com as mesmas regras da restauração; se algo estiver errado, nada é baixado e a mensagem explica o motivo.

**Lembrete:** sem nenhum backup, ou com o último feito há mais de 7 dias, aparece uma faixa no topo com o botão **Fazer backup agora**.

**Restaurar:** em **Configurações → Backup**, clique em **Restaurar de um backup** e escolha o arquivo.

1. A restauração fica bloqueada enquanto houver uma sessão do cronômetro, em qualquer aba.
2. O arquivo é conferido antes de qualquer alteração: tamanho (até 50 MB), formato, checksum SHA-256 (um arquivo alterado é recusado), versão e integridade dos dados (matérias, objetivos e registros que apontam uns para os outros, siglas e códigos únicos).
3. O app mostra um resumo (data do backup e quantidade de objetivos, matérias e registros) e pede confirmação: **isto substituirá todos os dados atuais**.
4. Antes de substituir, clique em **Baixar cópia dos dados atuais**: o app baixa `study-manager-antes-da-restauracao-AAAA-MM-DD-HHmm.json`, no mesmo formato de um backup (também pode ser restaurado). **Substituir dados** só fica disponível depois disso. Se os dados atuais não puderem ser lidos, o app avisa e só deixa seguir com a confirmação **Seguir sem cópia**.
5. Os dados são substituídos de uma vez só. Se algo falhar, nada é alterado.
6. Depois do sucesso, clique em **Recarregar**. O app não recarrega sozinho, para não interromper o download da cópia. **As outras abas abertas recarregam sozinhas**, para não ficarem com dados antigos na tela.

**Endereço seguro:** o checksum usa a criptografia do navegador, que só funciona em `https` ou `localhost`. Aberto por `http` num IP da rede, o app avisa que o backup não está disponível.

**Falha do banco:** se o banco do navegador não abrir, o app mostra uma tela de erro em vez de uma tela branca:

- **Banco corrompido ou que não abre:** **Tentar novamente** ou **Restaurar de um backup**. Nesse caso não dá para fazer backup dos dados atuais antes, porque eles não podem ser lidos. O banco é apagado e recriado com o backup, só depois da sua confirmação.
  - Essa tela restaura **só a partir de um arquivo**: sem o banco, a seção do Google Drive não abre. Se os seus backups estão no Drive, baixe antes o arquivo pelo site do Google Drive:
    1. Abra [drive.google.com](https://drive.google.com) com a conta conectada ao app e entre na pasta **Study Manager**.
    2. Os arquivos se chamam `study-manager-backup-AAAA-MM-DD.json`, um por dia. Clique com o botão direito no mais recente e escolha **Fazer download**.
    3. Volte à tela de falha, clique em **Restaurar de um backup** e escolha o arquivo baixado. Ele passa pela mesma conferência de qualquer backup.
- **Dados gravados por uma versão mais nova do app:** só **Recarregar**, para receber a versão atual. Nada é apagado.

## Backup no Google Drive (opcional)

> As regras estão na seção "Phase 7 addendum" da [especificação](docs/ESPECIFICACAO.md).

Além do backup em arquivo, o app pode enviar cópias automáticas para uma pasta **Study Manager** no seu Google Drive. O Drive é só um destino de backup: os dados continuam no navegador e nada é sincronizado. Nada é enviado antes de você clicar em **Conectar**.

O app só pede o escopo `drive.file`: ele enxerga apenas a pasta e os arquivos que ele mesmo criou, e nada mais do seu Drive.

**Em Configurações → Google Drive:** **Conectar ao Google Drive** (o Google pede a conta e a autorização, e o primeiro backup é enviado na hora), a conta conectada, a data do último envio, a situação (em dia, pendente ou erro), **Fazer backup agora** e **Desconectar**. Desconectar não apaga nada no Drive: os backups continuam na pasta.

- Se o envio ficar pendente sem autorização do Google nesta aba (por exemplo, depois de reabrir o app), o cabeçalho mostra **Reconectar Google Drive**.
- Se os dados deste navegador tiverem menos registros que o último backup no Drive (por exemplo, num navegador novo), o envio automático é suspenso para não sobrescrever o backup bom, e o cabeçalho mostra **Backup no Drive suspenso**. Nesse caso, restaure o backup do Drive ou, se for mesmo o que você quer, use **Fazer backup agora** e confirme.
- **Restaurar do Google Drive** lista os backups da pasta, do mais recente para o mais antigo, com a data do envio e o resumo gravado no Drive (informação ainda não conferida). O backup escolhido passa pela mesma restauração do arquivo: conferência completa, resumo do arquivo conferido, cópia dos dados atuais antes de substituir e **Recarregar**. Com o Drive conectado, o próximo envio substitui o backup de hoje no Drive pelos dados restaurados.
- O lembrete de backup considera também o último envio ao Drive.
- **Use um aparelho só, ou restaure sempre antes de estudar no outro.** O app não junta dados de dois aparelhos (por exemplo, casa e trabalho). O Drive guarda um arquivo por dia, e cada envio grava nele os dados completos do aparelho que enviou: o último a enviar sobrescreve o arquivo do dia. A restauração **substitui tudo**, não junta. E a proteção contra envio com menos registros não percebe esse caso, porque cada aparelho compara com o próprio último envio. Se você lançar estudos nos dois aparelhos sem restaurar antes, os registros de um deles podem se perder (fica só a cópia baixada antes de restaurar). Antes de estudar no outro aparelho, use **Restaurar do Google Drive** com o backup mais recente.
- **Quando envia:** ao confirmar uma sessão do cronômetro; ao lançar, editar ou excluir um estudo (inclusive registro do cronômetro); em **Conectar** e em **Fazer backup agora**. Ações seguidas são agrupadas: o envio sai 5 s depois da última. Mudanças de cadastro, planejamento e configurações vão no próximo envio. Há **um arquivo por dia** (`study-manager-backup-AAAA-MM-DD.json`), sobrescrito ao longo do dia; ficam os 30 dias mais recentes, e os mais antigos vão para a lixeira do Drive.
- **Nada espera o Google:** confirmar, lançar, editar e excluir funcionam sempre, mesmo sem internet ou com o popup bloqueado. Nesses casos o envio fica pendente e sai depois (quando a conexão volta ou pelo **Reconectar Google Drive**).
- **A autorização do Google fica só na memória da aba**, nunca no disco. Ao recarregar a página (F5, reabrir o app ou o Chrome descartar a aba), o próximo clique que envia abre um popup do Google, que normalmente pisca e fecha sozinho. Se o navegador bloquear o popup, libere popups para o site.
- No console do navegador podem aparecer avisos "Cross-Origin-Opener-Policy policy would block the window.closed call", vindos do script do Google. São do próprio Google e não afetam o app.

Para o recurso existir, o build precisa de um **ID do cliente OAuth** do Google, na variável `VITE_GOOGLE_CLIENT_ID`. Sem ela, a seção do Google Drive não aparece e o app funciona como antes.

### Guia de configuração do Google Cloud (uma vez só)

Você precisa de uma conta Google. O Google Cloud não cobra nada por isso: a Google Drive API é gratuita e não é preciso cadastrar cartão.

**1. Criar o projeto**

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e entre com a sua conta.
2. No topo da página, clique no seletor de projetos e depois em **Novo projeto**.
3. Em **Nome do projeto**, escreva `Study Manager` e clique em **Criar**.
4. Quando o projeto for criado, selecione-o no seletor de projetos. Confira que o nome dele aparece no topo antes de seguir.

**2. Ativar a Google Drive API**

1. No menu (☰), vá em **APIs e serviços → Biblioteca**.
2. Pesquise `Google Drive API`, abra o resultado e clique em **Ativar**.

**3. Configurar a tela de consentimento**

É a tela que o Google mostra quando você clica em **Conectar** no app. No console ela fica em **Google Auth Platform**. Para chegar lá, vá no menu em **APIs e serviços → Tela de permissão OAuth**, ou pesquise "Google Auth Platform" na barra de busca.

1. Clique em **Começar**.
2. **Informações do app:** nome do app `Study Manager` e, em **E-mail para suporte do usuário**, o seu e-mail. Clique em **Próxima**.
3. **Público:** escolha **Externo** e clique em **Próxima**. "Interno" só existe para contas de empresa do Google Workspace.
4. **Informações de contato:** o seu e-mail. Clique em **Próxima**.
5. Aceite a política de dados de usuário e clique em **Criar**.
6. Não envie logotipo. Com logotipo, o Google exige a verificação da marca.

**4. Deixar o app em modo Teste e cadastrar você como usuário de teste**

1. Em **Google Auth Platform**, abra **Público**.
2. Confira que o **Status de publicação** é **Em teste**.
3. Em **Usuários de teste**, clique em **Adicionar usuários**, digite o seu e-mail (o da conta Google em que os backups vão ficar) e salve.

No modo Teste, só os usuários dessa lista conseguem conectar (até 100). Veja abaixo como funciona a expiração de 7 dias.

**5. Autorizar o escopo `drive.file`**

1. Em **Google Auth Platform**, abra **Acesso a dados**.
2. Clique em **Adicionar ou remover escopos**.
3. No filtro, digite `drive.file` e marque `https://www.googleapis.com/auth/drive.file`. A descrição é "Consultar, editar, criar e excluir apenas os arquivos do Google Drive que você usa com este app".
4. Clique em **Atualizar** e depois em **Salvar**. O escopo deve aparecer na lista de **escopos não sensíveis**.

**6. Criar o ID do cliente OAuth**

1. Em **Google Auth Platform**, abra **Clientes** e clique em **Criar cliente**.
2. Em **Tipo de aplicativo**, escolha **Aplicativo da Web**. Em **Nome**, escreva, por exemplo, `Study Manager (web)`.
3. Em **Origens JavaScript autorizadas**, clique em **Adicionar URI** duas vezes e preencha:
   - `http://localhost:5173` (servidor de desenvolvimento, `npm run dev`)
   - `http://localhost:4173` (build de produção local, `npm run preview`)

   Escreva só o endereço, **sem barra no final e sem caminho**.

4. Deixe **URIs de redirecionamento autorizados** vazio. O app usa uma janela (popup) do Google e não precisa de redirecionamento.
5. Clique em **Criar**. Copie o **ID do cliente**, que termina em `.apps.googleusercontent.com`.

O console também mostra uma **chave secreta do cliente**. O app **não usa** essa chave: não a copie para o projeto nem a compartilhe.

As mudanças nas origens podem levar de 5 minutos a algumas horas para valer. Se o Google responder `origin_mismatch`, confira o endereço e espere um pouco.

**7. Informar o ID ao app (local)**

Crie o arquivo `.env.local` na raiz do projeto. Ele fica fora do git.

```bash
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

Reinicie o `npm run dev` (ou refaça o `npm run build`) para a variável valer.

### Quando publicar no GitHub Pages

1. No mesmo cliente OAuth (**Google Auth Platform → Clientes**), acrescente em **Origens JavaScript autorizadas** a origem do Pages: `https://<usuário>.github.io`. É só o domínio, sem `/<repositório>` e sem barra no final, porque o Google não aceita caminho na origem. Se o console pedir, inclua também `<usuário>.github.io` em **Domínios autorizados**, na seção **Branding**.
2. No GitHub, em **Settings → Secrets and variables → Actions**, abra a aba **Variables** (não **Secrets**) e crie a variável `VITE_GOOGLE_CLIENT_ID` com o ID do cliente. O workflow de deploy passa essa variável para o build.

**Por que variável e não secret:** o ID do cliente é público por natureza. Ele vai dentro do JavaScript publicado e aparece na URL de toda autorização feita pelo navegador. A proteção não vem de esconder o ID, e sim das **origens autorizadas**: o Google só aceita pedidos vindos dos endereços cadastrados no passo 6. O que seria segredo é a chave secreta do cliente, e ela não é usada.

### Reconsentimento a cada 7 dias no modo Teste

No modo **Em teste**, o Google faz a autorização vencer **7 dias depois do consentimento**. Na prática, uma vez por semana o app pede para você reconectar (aparece **Reconectar Google Drive**) e o Google mostra de novo a tela de permissão.

Se isso incomodar, publique o app:

1. Em **Google Auth Platform → Público**, clique em **Publicar app** e confirme. O status passa a **Em produção**.
2. Como o app só usa um escopo **não sensível** (`drive.file`) e não tem logotipo, **a verificação do Google não é obrigatória**. O Google só exige verificação para escopos sensíveis ou restritos, e a verificação da marca só para exibir logotipo ou nome do app.
3. Sem a verificação da marca, a tela de permissão mostra só o domínio do app, e não o nome "Study Manager". Isso não muda nada no funcionamento.
4. A lista de usuários de teste deixa de valer: qualquer conta Google consegue conectar ao seu ID do cliente. Cada pessoa só envia backups para o próprio Drive, e o app só enxerga os arquivos que ele mesmo criou.

**Pendência:** o Google indica links de página inicial e de política de privacidade para apps externos em produção. O app ainda não tem uma página de política de privacidade. Se o console bloquear a publicação sem esses links, ela precisa ser criada antes.

## Ícones e sons

Os ícones do PWA e os sons de alerta do cronômetro (`public/sounds/*.wav`) são gerados por scripts sem dependências externas. Os sons são sintetizados, sem amostras de terceiros:

```bash
npm run icones
npm run sons
```
