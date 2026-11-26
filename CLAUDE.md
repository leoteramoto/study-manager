# CLAUDE.md — Study Manager

## Idioma
- **Responda sempre em português do Brasil**, mesmo que a especificação ou o prompt estejam em inglês.
- Textos da interface, comentários, mensagens de commit e README em português do Brasil.

## O projeto
O Study Manager é uma SPA/PWA local-first para planejar e controlar estudos de concurso. Ela substitui planilhas manuais. Não tem servidor nem login, e todos os dados ficam no IndexedDB do navegador, com backup em JSON. O uso principal é no computador; o celular vem depois.

A especificação completa está em `docs/ESPECIFICACAO.md`. **Ela é a fonte da verdade.** As regras são citadas pelo número: RF01–RF11 e RN01–RN53 (RF11 e RN40–RN53: backup no Google Drive, Fase 7).

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
  - **Única exceção (Fase 7):** o script do Google Identity Services, `https://accounts.google.com/gsi/client`. O Google só permite carregá-lo dessa URL (não aceita empacotar nem hospedar cópia), por isso só esse arquivo. Ele entra na CSP só quando `VITE_GOOGLE_CLIENT_ID` existe no build. É carregado só com o Client ID presente **e** (1) ao exibir a seção Google Drive de Configurações ou (2) na inicialização, se o estado da nuvem estiver conectado. O `initTokenClient` é criado logo depois de carregar, para o `requestAccessToken` ser chamado de forma síncrona no clique (carregar só no clique tiraria o pedido do gesto do usuário, e o Firefox bloquearia o popup). Clique antes de o script carregar: o pedido falha (fica pendente) e nenhum popup abre depois. Nunca é carregado sem Client ID, nos testes unitários nem no build E2E (RN41, RN51). O `DestinoGoogle` é importado de forma dinâmica e só com Client ID; `npm run verificar:dist-google` confere o `dist/` e a CSP com e sem a variável.
- Commits pequenos no padrão Conventional Commits, em português (`feat(cronometro): ...`).
- Datas-hora gravadas em ISO UTC; datas de calendário em `YYYY-MM-DD`, calculadas no fuso configurado.

## Como trabalhar
- **Fase atual: nenhuma.** A Fase 8 (publicação no GitHub Pages) foi concluída em 2026-11-25; o app está em https://leoteramoto.github.io/study-manager/. A Fase 9 ainda não foi escolhida nem aprovada (projeto pausado).
- Uma fase por vez (veja o plano na especificação). **O plano de cada fase precisa da aprovação do usuário**; aprovado, as etapas seguem as regras de "Autonomia" abaixo.
- **Não invente regras de negócio** e não altere requisitos confirmados. Diante de ambiguidade, conflito ou caso não coberto, **pare e pergunte**.
- Ao propor algo, separe o que é **requisito confirmado**, o que é **sugestão** e o que é **pendência**.
- Não implemente itens das listas "Depois" ou "Fora de escopo" sem autorização.
- Mantenha o README atualizado.
- **Push ao fim de cada etapa:** depois do commit e com todas as verificações passando, rode `git push origin main`. Nunca use `--force` nem crie outra branch. Se o push falhar (rede, autenticação, rejeição), não tente contornar: mostre o erro e pare. Com o `gh` disponível, mostre também o resultado do CI do push (`gh run watch` ou `gh run list`).

## Autonomia
Pode fazer **sem perguntar**:
- Executar todas as etapas de um plano de fase já aprovado, em sequência, sem parar entre elas.
- Corrigir erros de lint, tipos, formatação e testes que você mesmo causou.
- Decisões técnicas pequenas (nomes, organização de arquivos, mensagens de erro, ajustes de teste sem afrouxar asserções). Registre cada uma em uma linha no relatório final.
- Commit e push ao fim de cada etapa, só com a bateria completa passando, e conferir o CI pelo `gh`. Se o CI falhar, corrija e tente de novo (no máximo 2 vezes); depois disso, pare.

**Pare e pergunte** antes de:
- Mudar regra de negócio, requisito confirmado ou a especificação além do que o plano previu.
- Mudar o formato dos dados, a versão de qualquer banco ou o formato do backup.
- Apagar ou sobrescrever dados do usuário, arquivos fora do projeto ou o histórico do git (force push, `reset --hard`, rebase em `main`).
- Acrescentar dependência nova, serviço externo, domínio na CSP ou qualquer coisa com custo.
- Mexer em segredos, `.env.local`, permissões ou configurações de conta (Google, GitHub).
- Afrouxar ou remover asserção de teste, ou desligar uma verificação do CI.
- Começar uma fase nova (o plano da fase continua precisando de aprovação).

**Economia de tokens:**
- Leia só os trechos necessários (grep, intervalos de linhas); não releia arquivos inteiros já lidos.
- Durante o trabalho, rode só os testes afetados. A bateria completa (lint, cobertura, build, Prettier, audit, `verificar:dist-google` e E2E se a etapa mexeu em telas) roda uma vez, antes do commit.
- Filtre saídas longas (`tail`, `grep`); nunca despeje logs inteiros.
- Sem narração entre comandos. Relatório final em até 15 linhas: o que foi feito, commits, resultado da bateria e do CI, decisões tomadas sozinho e pendências.
- Ao fim de cada fase, escreva o resumo de continuação e sugira `/compact`.

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

## Decisões da Fase 4 (casos não cobertos pela especificação, confirmados pelo usuário)
- **O relógio:** a fonte de ticks só avisa "verifique agora", nunca informa tempo. Todo cálculo usa o `Date` da thread principal. A fonte é injetável: Web Worker (padrão, não sofre o limite de timers de abas ocultas do Chrome) ou `setInterval` na thread principal (`VITE_FONTE_TICKS=principal`, usado no build do E2E para o `page.clock` controlar o tempo).
- **Aba líder** via `navigator.locks` (lock `study-manager:cronometro`): só ela grava heartbeat, detecta suspensão e toca alertas; as outras só exibem.
- **Recuperação (RN20) só quando nenhuma aba estava com a sessão** (app reaberto ou F5 na única aba). Aba nova com outra já rodando: nada. Aba que vira líder porque a antiga fechou: continua sem modal e sem pausa.
- **Término do registro = fim do último trecho contado:** concluído → instante exato do fim do planejado; encerrado em andamento → o clique; encerrado pausado → o instante da pausa; recuperado → o último heartbeat. Pausar e continuar atualizam `ultimoHeartbeatEm`.
- **Tempo não contado em pausa automática:** toda pausa automática (suspensão, aba congelada, aba descartada, recuperação) guarda o intervalo entre o último heartbeat e o instante em que o app percebeu a pausa, e oferece o botão **"Contar esse tempo"** (soma limitada ao planejado; se alcançar o planejado, vai para a confirmação como `concluido`). Nada é somado sem o clique.
  - **Desvio do modelo de dados:** `sessaoAtiva` ganhou o campo `pausaDetectadaEm: string | null` (não indexado; sem nova versão do Dexie; `sessaoAtiva` não entra no backup).
  - O aviso mostra o motivo detectado: `resume` da Page Lifecycle API → "O navegador congelou a aba"; `document.wasDiscarded` → "O navegador descarregou a aba"; senão → "Estudo pausado porque o computador ficou inativo". `freeze`/`resume` não distinguem com segurança congelamento de suspensão (o computador pode dormir com a aba congelada), por isso a decisão fica com o usuário.
- **Confirmar é idempotente:** a transação relê a sessão; clique duplo ou duas abas gravam exatamente 1 registro.
- **Som:** rejeição de `audio.play()` (autoplay bloqueado) é ignorada; destaque visual e notificação vêm antes e não dependem do som. O áudio é "destravado" no clique de Iniciar. Sons gerados por `scripts/gerar-sons.mjs` (WAV sintetizado, sem direitos autorais).
- **Permissão de notificação (RN39) adiantada** para a Fase 4, numa seção de Configurações.
- **Minutos:** valor inicial é o último usado, no localStorage (`study-manager:ultimaDuracaoMin`, preferência de tela, fora do banco e do backup); na primeira vez, 60.
- **Espaço (RN26) global**, exceto com foco em campo de texto, select, checkbox, botão ou com diálogo aberto.
- **Modal de confirmação global e não fechável:** abre sozinho em qualquer tela; só sai por Confirmar ou Cancelar. Com menos de 60 s, "Descartar" não pede 2ª confirmação.
- **PWA com `registerType: 'prompt'`:** aviso "Nova versão disponível" no cabeçalho; "Atualizar" fica desabilitado enquanto houver sessão.
- Se, ao fechar o trecho por suspensão/recuperação, o tempo já alcançou o planejado, a sessão vai para a confirmação como `concluido`. A `data` do registro usa o fuso configurado na confirmação, aplicado a `inicioEm`. A sessão continua se a matéria sair do planejamento no meio dela.

## Decisões da Fase 5 (casos não cobertos pela especificação, confirmados pelo usuário)
- **Evento do usuário logo após pausa automática:** se a verificação feita antes de qualquer evento aplicar uma pausa automática, o evento não é aplicado e só a pausa é devolvida (com o aviso e o "Contar esse tempo"). Vale para encerrar, continuar e pausar.
- **Ordem do histórico (RN28):** data decrescente; no mesmo dia, primeiro os registros do cronômetro (início mais recente primeiro), depois os manuais (`criadoEm` mais recente primeiro); desempate final pelo id.
- **Lançamento manual:** a data é a string `YYYY-MM-DD` do campo, gravada sem passar por `new Date()`. "Não futura" compara com hoje no fuso configurado, revalidado na transação. Sem data mínima e sem limite diário. Pode ser da mesma matéria da sessão ativa, sem aviso. Valores iniciais: data = hoje; minutos e matéria vazios. O seletor lista só matérias ativas de objetivos ativos, agrupadas por objetivo.
- **Edição de lançamento com matéria arquivada:** permite editar data e tempo mantendo a matéria; não permite trocar para outra matéria arquivada. Editar preserva `criadoEm`, atualiza `atualizadoEm` e recalcula `objetivoId`.
- **Exclusão (RN31):** pede confirmação, vale para registros do cronômetro e manuais. Registro excluído não pode ser editado nem excluído de novo.
- **Seletor de ano (RN27):** anos com pelo menos um registro **não excluído**, mais o ano atual. O ano exibido continua na lista enquanto estiver selecionado, mesmo que fique sem registros; ao sair dele, some. Trocar de ano mantém a aba de mês.
- **Aba do mês atual:** a seleção começa "acompanhando o mês atual" (vira sozinha na virada do mês, via `useAgora`). Escolher outra aba ou ano fixa a seleção; voltar ao mês atual volta a acompanhá-lo. Seletor e abas só aparecem depois que as configurações (fuso) carregam.
- **Abas de mês em tela estreita:** ao abrir a tela e ao trocar de ano, a aba selecionada rola para ficar visível (`scrollIntoView({ block: 'nearest', inline: 'center' })`). Clicar numa aba não rola.
- **Ranking:** só matérias com tempo > 0 no período, inclusive arquivadas; empate pelo código. A aba Ano mostra os 12 meses, inclusive os zerados.
- **Coluna Origem:** "Cronômetro" (com o tipo de encerramento em texto secundário) ou "Manual".
- **Totais batem:** Principal e Estatísticas usam a mesma função (`somarSegundosPorMateria`) sobre o mesmo filtro de `data`. Nenhuma das duas inclui a sessão em andamento (só registros confirmados).

## Decisões da Fase 6 (casos não cobertos pela especificação, confirmados pelo usuário)
- **Backup completo:** exporta arquivados e registros excluídos logicamente; `sessaoAtiva` fica fora. O `ultimoBackupEm` gravado no arquivo já é o `exportadoEm` (restaurar reproduz os dados exatamente e o lembrete não reaparece).
- **Checksum** = SHA-256 do `JSON.stringify(dados)` compacto; o arquivo sai indentado e a indentação não entra no hash. Bytes fora de `dados` (ex.: `exportadoEm`) não são cobertos, como na especificação.
- **Exportar valida o próprio arquivo** com `validarArquivoBackup` antes de baixar; se falhar, não baixa e mostra o erro.
- **Validação estrita do arquivo** (rejeita o arquivo inteiro): chaves desconhecidas, ids que não são UUID ou repetidos em qualquer tabela, nome não normalizado, descrição com espaços nas pontas, cor fora de `#rrggbb`, peso com mais de uma casa, `data` que não passa em `dataValida`, `duracaoSeg` < 60, manual com `inicio`/`fim`/planejado, cronômetro sem eles, `origem` incompatível com `tipoEncerramento`, fuso ou som desconhecidos, código ≠ `gerarCodigo(nome, sigla)`, sigla/código repetidos, FKs inexistentes, `registro.objetivoId` ≠ objetivo da matéria, planejamento com matéria arquivada ou de objetivo arquivado. Tamanho ≤ 50 MB conferido antes de ler o arquivo.
- **Ordem da validação:** JSON → envelope (Zod) → checksum → versão/migração → conteúdo (Zod) → integridade. O conteúdo só é validado depois da migração. `MIGRACOES` está vazio (só existe a versão 1). `SCHEMA_VERSION` do banco vem de `VERSAO_SCHEMA` do domínio.
- **Restauração:** sessão conferida antes e de novo dentro da transação `rw` (que inclui `sessaoAtiva`). Depois do sucesso, `BroadcastChannel` (`study-manager:restauracao`) faz as **outras** abas recarregarem sozinhas. Ouvir e avisar usam **o mesmo objeto** do canal; com objetos diferentes, a própria aba receberia o aviso.
- **Cópia antes de restaurar (substitui a recarga automática da própria aba):** no diálogo de confirmação, primeiro o botão "Baixar cópia dos dados atuais"; "Substituir dados" só habilita depois dele. A cópia (`gerarCopiaSeguranca`) é gerada com `montarArquivoBackup` **sem validar** (guarda o que existe), no formato da RN32 e com o nome `study-manager-antes-da-restauracao-AAAA-MM-DD-HHmm.json`. Se nem a leitura funcionar: "Não foi possível copiar os dados atuais." e uma segunda confirmação explícita ("Seguir sem cópia") para habilitar a substituição. No modo de banco com falha não há cópia. Depois do sucesso, a aba que restaurou **não recarrega sozinha**: o diálogo "Backup restaurado" não fecha por Esc nem por clique fora, só pelo botão "Recarregar" (uma recarga automática mata a URL do blob e pode cancelar o download da cópia, por exemplo com "perguntar onde salvar").
- **Sem `crypto.subtle`** (http fora de localhost): exportar e importar mostram `MENSAGEM_SEM_CRIPTOGRAFIA`.
- **Falha do banco (RN36):** banco que não abre ou corrompido → "Tentar novamente" e restauração com `Dexie.delete()` + recriação, com confirmação e o aviso de que não há backup prévio. **Versão mais nova** → só a mensagem e "Recarregar". O Dexie 4 **não lança `VersionError`**: abre sem erro um banco de versão maior. Por isso `inicializarBanco` compara `backendDB().version` com `verno × 10` e lança `ErroVersaoBanco`.
- **Lembrete (RN34):** regra ao pé da letra (aparece também com o app vazio), não pode ser dispensado, "Fazer backup agora" baixa direto. Limite: mais de 7 × 24 h.
- **Fuso (RN37):** gravado na forma canônica do `Intl`; "Outros" usa `<input>` com `<datalist>` de `Intl.supportedValuesOf('timeZone')`. Pode ser trocado com sessão ativa.
- **Som (RN38):** "Testar" toca mesmo com o som desligado; volume gravado ao soltar o controle (passo de 5%); escolha e volume desabilitados com o som desligado.
- **Armazenamento (RN35):** mostra a situação e oferece "Pedir armazenamento persistente" quando não é persistente.
- **Acessibilidade:** `@axe-core/playwright` (devDependency autorizada) em `tests/e2e/acessibilidade.spec.ts`, WCAG 2.1 A/AA nos dois temas, mais a checagem de rolagem horizontal em 360 px. Correções: no tema escuro, o hover do botão primário clareia o fundo (`color-mix` com branco) e o destrutivo usa fundo sólido escurecido; o nome acessível das abas de mês começa pelo texto visível (`Nov, novembro de 2026`); os grids das Estatísticas usam `minmax(0, 1fr)`.
- **Seed:** a sessão de 10 h do mês anterior virou duas de 5 h (o limite do cronômetro é 480 min; o backup recusaria o registro).
- **`npm audit`:** 4 moderadas só em dependências de desenvolvimento (`vite-plugin-pwa` → `workbox-build` → `glob`/`minimatch`); não mexer até o `workbox-build` atualizar.

## Decisões da Fase 7 (backup no Google Drive; casos não cobertos pela especificação, confirmados pelo usuário)
- **Local-first mantido:** o Drive é só destino de backup, sem sincronização. Nada é enviado antes de "Conectar". Sem `VITE_GOOGLE_CLIENT_ID`, nada do Drive existe no build (nem o banco `study-manager-nuvem`, nem a seção, nem a CSP do Google).
- **Estado da nuvem em banco separado** (`study-manager-nuvem`, Dexie v1, tabela `estado`): o banco principal continua na v1 (uma versão anterior do app ainda o abre, RN36). Fica fora do backup, sobrevive à restauração e só é limpo por "Desconectar". Campos além da especificação inicial: `motivoErro` (`suspenso` | `falha`) e `ultimoGatilhoEm` (envio iniciado antes do último gatilho não marca "ok").
- **Arquitetura:** regras puras em `domain/backupNuvem.ts`; `DestinoBackupNuvem` com `DestinoGoogle` (GIS + `fetch`), `DestinoFalso` (testes) e `destinoE2E` (só no build de E2E, com o "Drive" no `localStorage` e sem gancho em `window`); `orquestrador.ts` decide quando enviar. `npm run verificar:dist-google` confere, nos builds normais, que não há Google sem a variável nem destino falso (marcador `study-manager:e2e-destino-falso`).
- **Token (RN41):** só em memória, por aba; vencido 1 min antes do `expires_in`. `prompt: 'select_account'` em "Conectar" e `prompt: ''` com `login_hint` na renovação. `autorizar` nunca rejeita: popup bloqueado, fechado, sem resposta em 2 min, escopo negado, script não carregado → `false` (pendente); token tardio é aproveitado; clique duplo reusa o pedido. Revogação com limite de 10 s. Recarregar a página apaga o token: o próximo clique que envia abre o popup (que pisca e fecha sozinho).
- **GIS sob demanda:** carregado ao exibir a seção Google Drive ou na inicialização com o estado conectado; `initTokenClient` logo depois, para `requestAccessToken` sair de forma síncrona no clique. O aviso de COOP do GIS no console é inofensivo.
- **Gatilhos (RN43):** Confirmar do cronômetro (fim do tempo, Encerrar ou recuperação), salvar/editar lançamento, excluir **qualquer** registro, "Fazer backup agora" e "Conectar" (envio na hora, depois de ler a referência do Drive). `executarComBackup`/`useComBackup`: token pedido de forma síncrona no clique ou submit; a ação local nunca espera o Google nem mostra erro dele; gatilho só se a ação der certo; "pendente" gravado na hora; agrupamento de 5 s; Web Lock entre abas (fila local sem Web Locks); orquestrador ainda carregando → grava o pendente direto. Clique duplo em Confirmar: trava no diálogo. O `ProvedorNuvem` envolve o `ProvedorCronometro`.
- **Envio imediato depois do próprio gatilho** ("Conectar", "Fazer backup agora") espera o relógio passar do milissegundo do gatilho (no máximo 20 esperas de 1 ms).
- **Retentativa:** token novo ou conexão de volta reenviam o que está pendente ou em erro comum (`falha`); a suspensão só sai pelas regras do RN45. Falha ao mover para a lixeira não muda o resultado do envio.
- **Proteção (RN45):** referência = registros (inclusive excluídos) do último envio ou da última restauração; lida do `appProperties` do backup mais recente do Drive só quando não há referência local (primeira conexão ou depois de "Desconectar"; renovar o token não relê). Restauração bem-sucedida (arquivo, Drive ou tela de falha), só com o recurso disponível: referência = restaurados, "pendente", suspensão limpa. Suspensão no cabeçalho (RN53), com prioridade sobre "Reconectar"; a seção sugere restaurar do Drive; "Fazer backup agora" pede confirmação.
- **Drive (RN46):** pasta e arquivos marcados em `appProperties`; um arquivo por dia no fuso configurado, sobrescrito; 30 dias; o resto vai para a lixeira (`trashed: true`, nunca `DELETE`). Upload resumable com `fields=id` e resposta validada só pelo `id` (sem `fields`, o Drive devolve só `kind`, `id`, `name`, `mimeType`); `Location` validado. Lista com até 20 páginas. `credentials: 'omit'`, `cache: 'no-store'`. Erros: rede → offline; 401 → sem autorização (esquece o token); resto → falha (`ErroNuvem` com `status`; `ErroArquivoGrande` para os 50 MB). Nenhum log com token, `Authorization`, URL de sessão ou conteúdo (testado).
- **Restaurar do Drive (RN47):** mesmo fluxo da restauração por arquivo (`useRestauracao` + `DialogoRestauracao`); a lista mostra "Enviado em" (data do Drive) e o resumo como não conferido (singular/plural); listar não cria pasta (`acharPasta`); a confirmação vinda do Drive avisa que o próximo envio substitui o backup de hoje. Uma instância só do `RestaurarDoDrive`, sempre na mesma posição (a restauração limpa a suspensão e não pode desmontar o diálogo de sucesso).
- **Telas:** "Desconectar" pede confirmação e diz que nada é apagado no Drive; o link "Backup no Drive suspenso" leva à seção com foco no título (estado da navegação, por causa do HashRouter); no celular os indicadores mostram só o ícone. O lembrete (RN50) usa o mais recente entre o backup em arquivo e o último envio; o botão dele continua só baixando o arquivo.
- **CSP:** só com o Client ID: `script-src https://accounts.google.com/gsi/client`; `connect-src https://accounts.google.com/gsi/ https://www.googleapis.com https://oauth2.googleapis.com/revoke`. O teste manual com o Google de verdade (build de produção) não mostrou nenhuma violação em conectar, enviar e restaurar. A revogação foi bloqueada no teste da Fase 8 (etapa 3) e o caminho exato `/revoke` entrou no `connect-src` (veja as decisões da Fase 8).
- **Testes:** nenhum teste acessa o Google. O Vitest também lê o `.env.local`, por isso o `vitest.config.ts` força `VITE_GOOGLE_CLIENT_ID` e `VITE_DESTINO_NUVEM` vazios. E2E com dois builds (normal, com `VITE_GOOGLE_CLIENT_ID` forçado vazio; e `dist-e2e-nuvem` na porta 4181 com `VITE_DESTINO_NUVEM=falso`), bloqueando requisições ao Google; axe nas telas do Drive em tela larga e celular, nos dois temas. Nos testes do cronômetro, a espera do heartbeat é determinística (sonda do provedor; polling de no máximo 8 s; arquivo com tempo limite de 20 s).
- **Configuração:** `VITE_GOOGLE_CLIENT_ID` no `.env.local` (fora do git) e, no CI, como variável do repositório (público por natureza, não secret). No modo Teste do Google, a autorização vence em 7 dias. Guia no README.

## Decisões da Fase 8 (publicação no GitHub Pages)
- **Checagem do README no CI:** `npm run verificar:readme` falha se faltar algum cabeçalho `## ` que comece por "Como usar", "Backup e restauração", "Backup no Google Drive" ou "Deploy". Aceita um caminho como argumento (controle negativo).
- **Caminho base:** o build com `/study-manager/` já saía correto; nada foi corrigido. `npm run verificar:build-base` (no CI) confere HTML, manifest, registro e escopo do service worker, `navigateFallback`, pré-cache, worker, sons e a CSP igual à da raiz (sem e com o Google); a busca por literais na raiz tem controle positivo no build na raiz. E2E `caminho-base.spec.ts` num terceiro build (`dist-e2e-base`, porta 4182, worker de verdade), projetos `chromium-base` e `firefox-base`.
- **Proteção contra iframe:** `estaEmIframe` (`src/lib/iframe.ts`; `self !== top`, erro na leitura conta como iframe) é checado no `main.tsx` antes de tudo. Em iframe, só `AvisoIframe` (sem botão nem link); service worker, canal de restauração e banco não são iniciados; a janela de cima não é tocada. No E2E, a página de fora fica em `127.0.0.1` e o app em `localhost`; o Chromium precisa da permissão `local-network-access` para carregar o quadro.
- **Revogação sob a CSP (etapa 3, teste manual com o Google, preview do build de produção sob `/study-manager/` na porta 4173):** o "Desconectar" tinha o POST do GIS para `https://oauth2.googleapis.com/revoke` bloqueado (`connect-src`, `(blocked:csp)`), e o acesso continuava ativo. Entrou exatamente esse endereço (caminho, não o domínio) no `connect-src`, só com o Client ID; `verificar:dist-google` e `verificar:build-base` exigem a CSP exata. No "Conectar", o console só mostra avisos de COOP ("Cross-Origin-Opener-Policy policy would block the window.closed call") do `requestAccessToken` do GIS: ruído do Google, não violação de CSP. **Segundo teste, com o build novo:** revoke `POST` com status 200, sem violação, e o app voltou a desconectado. Logo depois, o app ainda aparecia em myaccount.google.com/connections: a remoção nessa lista do Google pode demorar; se persistir, o usuário remove à mão.
- **Publicação (etapa 5):** repositório público, Pages com fonte GitHub Actions, variáveis `VITE_GOOGLE_CLIENT_ID` e `DEPLOY_PAGES=true`, origem `https://leoteramoto.github.io` no cliente OAuth (app do Google "Em teste"). O deploy roda só em push na `main` ou `workflow_dispatch` na `main`, nunca em pull request. O primeiro deploy (por `workflow_dispatch`, sem commit) falhou no `deploy-pages` ("Fetching artifact metadata failed", artefato `github-pages` não encontrado, ~1 s depois do upload) e passou com `gh run rerun --failed`: falha passageira do GitHub, nada mudou no código. Conferido por `curl`: CSP com o Google e o `/revoke`, `src`/`href` sob `/study-manager/`, manifest com `start_url`/`scope` `.`, service worker com escopo `/study-manager/`, sem destino falso; a raiz da conta dá 404. Teste do usuário na URL: abrir, instalar, conectar (suspensão da RN45 com o app vazio, como esperado), restaurar do Drive, fazer backup (em dia) e desconectar, tudo certo.

## Pendências conhecidas
- **Dois aparelhos (risco de perder registros):** o Drive guarda um arquivo por dia, sobrescrito pelo último aparelho que enviou, com os dados completos dele; a restauração substitui tudo (não junta); e a RN45 não ajuda, porque cada aparelho compara com a própria referência local (o número do Drive só é lido na primeira conexão). Registros lançados só num aparelho somem do arquivo do dia e se perdem ao restaurar no outro (sobra só a cópia baixada antes). Orientação atual (README): usar um aparelho só ou restaurar sempre antes de estudar no outro. Resolver exige mudar formato do backup e regras RN45–RN47: só com aprovação (candidata à Fase 9).
- **"Reconectar" depois de desconectar e conectar em seguida (etapa 3):** com a revogação funcionando, o Google cancela a autorização inteira; um token pedido logo depois pode ser recusado (401) no envio seguinte, e o app mostra "Envio pendente" + "Reconectar" (comportamento da RN49, sem perda). Não confirmado pela Network; nada foi mudado.
- **myaccount.google.com/connections** pode continuar listando o app por um tempo depois do "Desconectar"; se persistir, o usuário remove à mão.
