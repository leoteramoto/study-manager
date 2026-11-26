# Fase 8: publicação no GitHub Pages

Roteiro da fase aprovado pelo usuário em 2026-11-25. Não é especificação: a fonte da verdade continua sendo `docs/ESPECIFICACAO.md`.

**Objetivo:** publicar o app numa URL https fixa (`https://<usuário>.github.io/study-manager/`) com o backup no Google Drive funcionando lá, e fechar as pendências da Fase 7.

## Decisões da aprovação

1. **Hospedagem: repositório público** (hipótese a), com a varredura da Etapa 0 antes. O e-mail de autor dos commits fica público, e o histórico não é reescrito.
2. **Proteção contra iframe:** entra como etapa extra (Etapa 2b). Dentro de um iframe, o app esconde o conteúdo e mostra um aviso. Ele não tenta redirecionar a janela de cima.
3. **Origem compartilhada:** não há outro site da conta no Pages. O README precisa registrar que publicar outro app no mesmo `<usuário>.github.io` daria a ele acesso aos dados deste, e que a saída seria um domínio próprio ou outra conta.
4. **Revogação (Etapa 3):** está autorizado acrescentar exatamente `https://oauth2.googleapis.com/revoke` ao `connect-src`, se for esse o endereço bloqueado. Com qualquer outro endereço, parar e perguntar.
5. A pasta "Study Manager" do Drive do usuário não é tocada em nenhuma etapa. A limpeza dos backups de teste fica com o usuário.

## Situação de partida

- **CSP:** é entregue por `<meta http-equiv>`, inserida pelo `vite.config.ts` só no build. No Pages fica igual, porque lá não há cabeçalhos HTTP próprios.
- **Diretivas que a `<meta>` ignora:** `frame-ancestors`, `report-uri`/`report-to` e `sandbox`. O app não usa nenhuma hoje.
- **Efeitos de não ter cabeçalhos:**
  - **Clickjacking:** nada impede um iframe de outro site, e o Pages não manda `X-Frame-Options`. Por isso existe a Etapa 2b.
  - **Relatório:** não há relatório de violações.
  - **Workers:** o service worker e o worker do cronômetro rodam sem CSP, porque um worker só recebe CSP pelos cabeçalhos do próprio arquivo. O risco é baixo: os dois só rodam código próprio, da mesma origem.
- **Caminho base:** já é configurável (`VITE_BASE_PATH`, que o CI preenche com `/<nome-do-repo>/`).
  - O `index.html` e os sons usam o `BASE_URL`.
  - O manifest tem `start_url` e `scope` relativos (`.`).
  - O worker do cronômetro usa `import.meta.url`.
- **Roteamento:** HashRouter. Não precisa de fallback 404.
- **Deploy:** o job já existe no `ci.yml`, travado por `vars.DEPLOY_PAGES`. O repositório ainda não tem nenhuma variável.
- **Origem compartilhada:** todos os sites do Pages da mesma conta dividem `https://<usuário>.github.io`. Isso vale para IndexedDB, localStorage e a origem autorizada no OAuth.

## Etapas

### Etapa 0: varredura do histórico atrás de segredos

- **O que muda:** nada no código. Varrer todos os commits atrás de:
  - `.env.local` ou outro `.env` que tenha entrado;
  - padrões de Client ID e de chave do Google;
  - tokens `ya29.`, `Bearer`, chaves privadas e `AKIA`;
  - e-mails, no conteúdo e nos metadados.

  A varredura usa só o git e o grep, sem ferramenta nova.
- **Relatório:** quantidades e lugares, nunca os valores. O e-mail de autor já foi aceito como público.
- **Parada obrigatória:** entregar o relatório e esperar a resposta. Nada é publicado antes. Reescrever o histórico está fora de questão sem ordem explícita.

### Etapa 1: checagem dos títulos do README no CI

- **O que muda:**
  - um script que falha se faltar algum dos títulos "Como usar", "Backup e restauração", "Backup no Google Drive" e "Deploy";
  - um comando no `package.json`;
  - um passo no job de verificação do CI;
  - a pendência sai do `CLAUDE.md`.
- **Arquivos:** `scripts/`, `package.json`, `.github/workflows/ci.yml` e `CLAUDE.md`.
- **Testes:** o README atual passa, e uma cópia truncada falha (controle negativo).
- **Parada:** nenhuma.

### Etapa 2: build com o caminho base `/study-manager/`

- **O que muda:** uma verificação do build com o caminho base. Ela confere:
  - os caminhos do HTML;
  - o `start_url` e o `scope` do manifest;
  - o registro e o escopo do service worker;
  - o `navigateFallback` do Workbox;
  - os sons, o `tema.js`, os ícones e o worker;
  - a CSP igual à do build na raiz.

  Mais um E2E curto servindo esse build sob o caminho: abrir, navegar, tocar o som de teste, ver o service worker ativo e conferir que nada vaza para a raiz. Os caminhos absolutos que aparecerem são corrigidos.
- **Arquivos:** `scripts/`, `playwright.config.ts`, um spec novo em `tests/e2e/` e talvez `vite.config.ts`.
- **Testes:** o script novo, o E2E novo e a bateria completa.
- **Parada:** só se a correção mudar o comportamento do PWA.

### Etapa 2b: proteção contra iframe

- **O que muda:** dentro de um iframe, o app não monta a interface: esconde o conteúdo e mostra um aviso. Ele não tenta redirecionar a janela de cima.
- **Arquivos:** a inicialização do app (`src/main.tsx` ou equivalente), um componente de aviso e o README.
- **Testes:**
  - um unitário da detecção;
  - um E2E que abre o app num iframe de outra origem e confere que o conteúdo não aparece e o aviso sim;
  - a abertura normal sem iframe continua igual.
- **Parada:** nenhuma.

### Etapa 3: revogação no "Desconectar" sob a CSP

- **O que muda:** um teste manual com o Google de verdade, conduzido com o usuário.
  - **Ambiente:** `vite preview` do build de produção, com o mesmo caminho base e a mesma CSP do Pages, numa porta já autorizada no cliente OAuth.
  - **Roteiro:** o usuário conecta e desconecta. Leio as violações de CSP no console, e o usuário confere em myaccount.google.com/permissions se o acesso sumiu.
- **Se o bloqueio for em `https://oauth2.googleapis.com/revoke`:** acrescentar exatamente esse endereço ao `connect-src`, ajustar o `verificar:dist-google` e repetir o teste.
- **Parada:** se o endereço bloqueado for qualquer outro.
- **Registro:** o resultado vai para a especificação (registro do teste manual) e para o `CLAUDE.md`.

### Etapa 4: README

- **Migração dos dados do localhost para a URL nova:**
  - os dados não passam sozinhos;
  - o caminho é exportar o arquivo e restaurar na URL nova, ou restaurar do Drive depois de conectar;
  - recomendar "Fazer backup agora" antes;
  - restaurar antes de enviar o primeiro backup pela URL nova, para não acionar a proteção RN45.
- **No GitHub:**
  - deixar o repositório público;
  - ativar o Pages com a fonte "GitHub Actions";
  - criar as variáveis `VITE_GOOGLE_CLIENT_ID` e `DEPLOY_PAGES=true`.
- **No Google Cloud:**
  - incluir só a origem `https://<usuário>.github.io`, sem caminho;
  - escolher entre "Em produção" e manter o modo Teste, com reconexão a cada 7 dias.
- **Também:**
  - o aviso da origem compartilhada (decisão 3);
  - a instalação do PWA pela URL nova;
  - a proteção contra iframe.
- **Arquivos:** `README.md`.
- **Testes:** a checagem da Etapa 1 e o Prettier.
- **Parada:** nenhuma.

### Etapa 5: publicação

- **Antes:** o usuário faz as configurações no GitHub e no Google Cloud.
- **O que muda:** nenhum arquivo. O push na `main` publica.
  - Acompanhar o deploy pelo `gh`.
  - Conferir por `curl` que a página publicada tem a CSP com o Google, o manifest e o service worker sob o caminho, e nenhuma URL do destino falso.
  - Depois, um teste curto do usuário na URL: abrir, instalar, conectar, enviar um backup e desconectar.
- **Parada obrigatória:** antes do primeiro deploy, que é público e difícil de desfazer: só seguir com o "pode publicar" do usuário. Também parar se a publicação falhar.
- **Registro:** o resultado vai para o `CLAUDE.md` (decisões da Fase 8) e o README marca a fase como concluída.

## Tamanho previsto

Uns 5 commits: Etapas 1, 2, 2b e 4, mais o registro das Etapas 3 e 5.
