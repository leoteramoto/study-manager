# Project: Study Manager

## Response language

**Always reply to the user in Brazilian Portuguese (pt-BR)**: explanations, questions, phase summaries and status reports. This specification is written in English only for precision. All UI text, code comments, commit messages and the README must also be in Brazilian Portuguese.

## Context

Study Manager is a web application for planning and tracking study time, built to fully replace the manual spreadsheets the user relies on today. The initial audience is a single user preparing for Brazilian public-sector exams (*concursos públicos*). It may later be sold to other students as standalone software with a one-time payment and no SaaS.

The user organizes subjects (*matérias*) under **study goals** (*objetivos*, e.g. "Polícia Federal", "Carreira Fiscal") and builds a **monthly plan** (*planejamento*): they pick subjects from any goal, assign weights and set a monthly hour target. The target is split across subjects in proportion to their weights. Study time is recorded through a **timer that requires explicit confirmation** or through **manual entries**. All history is shown in monthly and yearly **statistics**.

All data stays in the user's own browser. There is no server, no login and no cost. The user protects their data with file backups.

**Success criterion:** fully replace the manual spreadsheets.

## Your role

You are a senior software engineer building this project from scratch, strictly following this specification. Also follow the rules in the "Working rules" section at the end of this document.

## Scope

### MVP (build now)
- Goal and subject registration, with archiving
- Main tab: indicator panel, planning (subject selection, weights, monthly target) and main table
- Study timer with a state machine, confirmation, session recovery and sleep detection
- Statistics: year selector, Jan–Dec sub-tabs, yearly view, manual entries, editing of manual entries and soft deletion of records
- Settings: time zone, sound, notifications
- JSON backup and restore with validation, plus a backup reminder
- Installable PWA, 100% offline
- Light and dark themes; desktop-first layout, responsive down to mobile

### Later (do NOT build now, but do not block it)
- Charts and dashboards
- Export to PDF, Excel and CSV
- Filters and extra indicators
- Cloud sync with login
- Desktop packaging (Tauri) for one-time-payment sales
- Dedicated mobile polish

### Out of scope
- AI, flashcards, spaced repetition, question banks, calendar, weekly planning
- Multi-user, server, shared database

## Required stack

Use the current stable version of each item and pin versions in `package-lock.json`. Before installing, confirm every package exists and is the official one.

| Technology | Purpose |
|---|---|
| Node.js LTS + npm | Development environment |
| React + TypeScript (`strict` mode) | UI |
| Vite | Build and dev server |
| Tailwind CSS + shadcn/ui | Styling and components |
| React Router | Routing |
| Dexie + dexie-react-hooks | Local database (IndexedDB) with reactive queries |
| Zod | Validation of forms and imported backups |
| date-fns + @date-fns/tz | Dates and time zones |
| vite-plugin-pwa | Offline support and installation |
| Vitest + Testing Library + fake-indexeddb | Unit and component tests |
| Playwright | End-to-end tests |
| ESLint + Prettier | Code quality |

Do not add libraries outside this list without asking.

## Architecture and folder structure

Local-first SPA with no backend. Business rules live in **pure functions** in `src/domain`, with no dependency on React or Dexie, so they can be tested in isolation. **No derived value is stored in the database** (totals, per-subject targets, percentages): everything is computed from the base data.

```
study-manager/
├─ src/
│  ├─ app/              # layout, routes, providers, theme
│  ├─ db/               # Dexie schema, migrations, repositories
│  ├─ domain/           # pure rules: calculos.ts, codigo.ts, tempo.ts, cronometro.ts, backup.ts
│  ├─ features/
│  │  ├─ cadastro/
│  │  ├─ principal/
│  │  ├─ cronometro/
│  │  ├─ estatisticas/
│  │  ├─ configuracoes/
│  │  └─ backup/
│  ├─ components/ui/    # shadcn components
│  └─ lib/              # utilities (formatting, ids)
├─ public/sounds/       # alert sounds
├─ tests/e2e/           # Playwright
├─ .github/workflows/   # CI and deploy
└─ README.md
```

Table, field and identifier names stay in Portuguese, as defined below.

## Data model (IndexedDB via Dexie)

IDs are UUID v4 (`crypto.randomUUID()`). Timestamps are stored as ISO strings in UTC. Calendar dates are stored as `YYYY-MM-DD`, computed in the configured time zone.

### `objetivos` (study goals)
| Field | Type | Rule |
|---|---|---|
| id | string | PK |
| nome | string | Required, 1–60 chars, editable |
| sigla | string | Required acronym, 1–10 chars `[A-Z0-9]`, uppercased automatically, **unique and immutable** |
| ordem | number | Display order |
| ativo | boolean | `false` = archived |
| criadoEm, atualizadoEm | ISO string | |

Indexes: `&sigla`, `ordem`.

### `materias` (subjects)
| Field | Type | Rule |
|---|---|---|
| id | string | PK |
| objetivoId | string | FK, required, **immutable** |
| nome | string | Required, 1–60 chars, editable |
| codigo | string | Generated: `${nome.trim()}-${sigla}`, **unique**, never edited manually, recalculated when the name changes |
| descricao | string \| null | Optional, up to 500 chars |
| cor | string | Required hex color; default assigned in rotation from a 12-color palette; customizable |
| ordem | number | Order within the goal |
| ativo | boolean | `false` = archived |
| criadoEm, atualizadoEm | ISO string | |

Indexes: `&codigo`, `objetivoId`, `[objetivoId+ordem]`.

### `planejamento` (subjects in the current plan)
| Field | Type | Rule |
|---|---|---|
| materiaId | string | PK, FK |
| peso | number | Weight 0.1 to 100, step 0.1, default 1, never empty |
| adicionadoEm | ISO string | |

### `registros` (study history)
| Field | Type | Rule |
|---|---|---|
| id | string | PK |
| materiaId | string | FK |
| objetivoId | string | FK (copied for queries) |
| data | string `YYYY-MM-DD` | Date in the configured time zone, at the **start** of the session |
| inicio | ISO string \| null | Null for manual entries |
| fim | ISO string \| null | Null for manual entries |
| duracaoSeg | number | Effective duration in seconds, ≥ 60 |
| duracaoPlanejadaMin | number \| null | Null for manual entries |
| origem | `'cronometro' \| 'manual'` | |
| tipoEncerramento | `'concluido' \| 'antecipado' \| 'recuperado' \| 'manual'` | |
| excluidoEm | ISO string \| null | Soft delete; deleted records are excluded from all calculations |
| criadoEm, atualizadoEm | ISO string | |

Indexes: `data`, `materiaId`, `[materiaId+data]`.

The code shown in the history is always the subject's **current** code, resolved through `materiaId`.

### `sessaoAtiva` (at most one row, `id = 'atual'`)
| Field | Type |
|---|---|
| id | `'atual'` |
| materiaId | string |
| duracaoPlanejadaMin | number (1–480) |
| inicioEm | ISO string (first start) |
| segmentoInicioEm | ISO string \| null (null while paused) |
| acumuladoSeg | number (time from already closed segments) |
| ultimoHeartbeatEm | ISO string |
| estado | `'em_andamento' \| 'pausado' \| 'aguardando_confirmacao'` |
| tipoEncerramento | `'concluido' \| 'antecipado' \| 'recuperado' \| null` |
| fimEm | ISO string \| null |
| motivoPausaAutomatica | `'suspensao' \| 'recuperacao' \| null` |

### `configuracoes` (single row, `id = 'app'`)
| Field | Type | Default |
|---|---|---|
| metaMensalHoras | number \| null | null |
| fusoHorario | IANA string | browser time zone; if it cannot be detected, `America/Sao_Paulo` |
| somAtivo | boolean | true |
| somId | string | first available sound |
| volume | number 0–1 | 0.7 |
| notificacoesAtivas | boolean | false (true once the user grants permission) |
| ultimoBackupEm | ISO string \| null | null |
| schemaVersion | number | 1 |

Use Dexie schema versioning (`db.version(n).stores(...).upgrade(...)`) from version 1.

## Business rules

### Goals and subjects
- **RN01:** the goal's acronym (`sigla`) is unique across the system (case-insensitive comparison) and cannot be changed after creation. Renaming a goal does not change its acronym.
- **RN02:** a subject's goal is set at creation and cannot be changed. To use the same subject under another goal, create a new subject.
- **RN03:** the subject code is `SubjectName-ACRONYM` (e.g. `Matemática-PF`). It is unique across the system; the comparison ignores case and leading/trailing spaces. Creating or renaming a subject that would produce a duplicate code is **blocked**, with a clear message. On rename, the code is recalculated and the whole history shows the new code.
- **RN04:** goals and subjects are never physically deleted, only archived (`ativo = false`), and archiving can be undone.
  - Archiving a subject automatically removes it from the plan.
  - A subject (or its goal) cannot be archived while that subject is in the active timer session.
  - Archiving a goal archives all its subjects.
  - Archived subjects cannot be used for new study sessions (timer or manual entry), but their history appears normally in the statistics.
  - Archived goals and subjects are hidden by default, with a "Mostrar arquivados" toggle.
- **RN05:** order is editable with move up/down buttons (no drag and drop in the MVP). Goals are sorted by their own order; subjects, by their order within the goal.

### Planning and calculations
- **RN06:** the plan accepts active subjects from any goal and can be changed at any time. Removing a subject from the plan deletes no records: its time stays in the history and in the monthly total, but it no longer takes part in the targets.
- **RN07:** the weight is required and decimal, from 0.1 to 100, step 0.1, default 1. Zero, negative values and empty fields are rejected; an empty field reverts to the last valid value.
- **RN08:** the monthly target is entered in hours (decimal ≥ 0.5, up to 744) and can be changed at any time without altering time already studied.
- **RN09:** per-subject target = monthly target × (weight ÷ sum of plan weights). There is no proration by remaining days: a subject added mid-month receives its full share.
- **RN10:** subject completion % = time studied this month ÷ per-subject target × 100. It can exceed 100%. It is displayed **with no decimal places** (standard rounding), with full internal precision.
- **RN11:** remaining time = target − studied. If the result is negative, display "0" and highlight the subject as "meta atingida" (target reached).
- **RN12:** time studied this month is the sum of `duracaoSeg` over non-deleted records whose `data` falls in the current month in the configured time zone. This includes manual entries. The month rollover happens naturally through the date filter; **there is no routine that resets data**. Plan, weights and target carry over unchanged to the next month.
- **RN13:** if the target is empty or the plan has no subjects, the panel shows "Defina a meta mensal" or "Adicione matérias ao planejamento", and the % and remaining-time columns show "—". The timer is only available with at least one subject in the plan.
- **RN14:** all sums are done in seconds. Display: whole minutes rounded down in minute columns; hours in the `4h27` format for totals and targets.

### Timer
- **RN15:** the timer has the states **Ready → Running ⇄ Paused → Awaiting confirmation → Finished or Cancelled → Ready**. Details:
  - Starting requires a subject from the plan and an integer duration of 1 to 480 minutes.
  - Running and Paused allow "Encerrar" (end early: goes to confirmation with type `antecipado`) and "Cancelar sessão" (discards, after confirming).
  - When the planned time ends, the session goes to Awaiting confirmation with type `concluido`, and the effective time is capped at the planned time.
- **RN16:** only one session can exist at a time. The subject cannot be changed during a session.
- **RN17:** elapsed time is always computed from the wall clock: `acumuladoSeg + (now − segmentoInicioEm)`. **Never** count ticks. The UI refreshes every 1 s.
- **RN18 (heartbeat):** while the session is Running, `ultimoHeartbeatEm` is written to IndexedDB every 5 s. Every state change is also written immediately.
- **RN19 (sleep):** if, on any tick or on the `visibilitychange` event, `now − ultimoHeartbeatEm` exceeds 30 s while the session is Running, the app treats it as sleep. It then:
  - closes the segment at `ultimoHeartbeatEm`, counting only up to that point;
  - moves the session to **Paused**, with `motivoPausaAutomatica = 'suspensao'`;
  - shows a notice: "Estudo pausado porque o computador ficou inativo".

  If the session was already paused, it stays paused.
- **RN20 (recovery):** when the app opens and a `sessaoAtiva` exists:
  - If it was Running, apply the same logic as RN19, with `motivoPausaAutomatica = 'recuperacao'`.
  - Then open the "Sessão interrompida encontrada" modal, with the subject, the counted time and the options **Continuar** (resume), **Encerrar e revisar** (end and go to confirmation with type `recuperado`) and **Descartar** (discard).
  - If the session was Awaiting confirmation, reopen the confirmation screen.
- **RN21 (confirmation):** no record is saved without clicking **Confirmar**.
  - The summary shows: subject, code, goal, date, start time, end time, time studied, planned time and end type.
  - Buttons: **Confirmar** (saves the record and moves to Finished) and **Cancelar** (asks a second confirmation, discards and moves to Cancelled).
  - If the effective time is under 60 s, it says the session cannot be recorded and offers only Descartar.
  - After Finished or Cancelled, `sessaoAtiva` is deleted and the timer returns to Ready.
- **RN22:** the record's date is the date of `inicioEm` in the configured time zone. A session that crosses midnight counts entirely for the start day.
- **RN23:** while a session is Running, Paused or Awaiting confirmation, the `beforeunload` event asks for exit confirmation.
- **RN24:** changing the target, the weights or the plan during a session does not affect the session.
- **RN25 (end alerts):** when the time ends, the app:
  - shows a visual highlight on screen;
  - plays the configured sound, if enabled;
  - sends a system notification, if permission was granted and the tab is in the background.

  Include 3 short royalty-free sounds in `public/sounds/`.
- **RN26:** the **Space** key pauses and resumes the session when focus is not in a text field.

### Statistics and entries
- **RN27:** a year selector lists the years that have records, plus the current year. Each year has Jan–Dec sub-tabs and an "Ano" tab; the default sub-tab is the current month.
- **RN28 (month tab):** shows the month's total study time and two tables.
  - **Table 01, History:** columns Data | Início | Término | Tempo (min) | Matéria (code) | Origem | Ações. Sorted by date and start time, newest first.
  - **Table 02, Ranking:** columns Matéria (code, with color) | Tempo total (`4h27`). Sorted from most to least time.
- **RN29 (year tab):** shows the year's total time, a list of the 12 months with each month's total, and a list of every subject studied in the year with its total, from most to least.
- **RN30 (manual entry):** the "Lançar estudo manual" button is on the Statistics tab. Fields:
  - date: required and **cannot be in the future** (in the configured time zone);
  - time: integer from 1 to 480 minutes;
  - subject: required, among **active** registered subjects from any goal, without needing to be in the plan.

  The record is saved with `origem = 'manual'`, `tipoEncerramento = 'manual'` and null `inicio`/`fim`. It counts in all statistics and on the Main tab.
- **RN31 (editing):** **manual** entries can be edited (date, time, subject, with the same validations) and deleted. **Timer** records can only be **deleted**, never edited. Every deletion asks for confirmation and is **soft** (`excluidoEm`): the record leaves all calculations and screens but stays in the database and in backups.

### Backup and restore
- **RN32 (export):** generates and downloads `study-manager-backup-YYYY-MM-DD-HHmm.json`, in this format:
  ```json
  { "app": "study-manager", "schemaVersion": 1, "exportadoEm": "ISO", "checksum": "sha256-hex", "dados": { "objetivos": [], "materias": [], "planejamento": [], "registros": [], "configuracoes": {} } }
  ```
  The checksum is the SHA-256 (Web Crypto) of the serialized JSON of `dados`. `sessaoAtiva` is not included. After exporting, the app updates `ultimoBackupEm`.
- **RN33 (import), in this order:**
  1. Block the import if a session is active.
  2. Read the file and validate its structure with Zod.
  3. Verify the checksum.
  4. Reject a `schemaVersion` higher than the current one; migrate if it is lower.
  5. Validate referential integrity (every subject points to an existing goal; every record points to an existing subject; unique acronyms and codes).
  6. Show a summary (number of goals, subjects and records, and backup date).
  7. Ask for explicit confirmation ("Isto substituirá todos os dados atuais").
  8. **Automatically download a backup of the current data.**
  9. Replace everything in a single Dexie transaction.

  Any failure aborts the whole operation without changing current data and shows a clear message.
- **RN34 (reminder):** if `ultimoBackupEm` is null or older than 7 days, show a discreet banner at the top with a "Fazer backup agora" button.
- **RN35:** on first run, call `navigator.storage.persist()` and show in Settings whether storage is persistent.
- **RN36 (database failure):** if IndexedDB fails to open or is corrupted, show an error screen with a "Restaurar de um backup" option instead of a blank screen.

### Settings
- **RN37:** the time zone comes from a list of Brazilian time zones with friendly names: Fernando de Noronha (`America/Noronha`), Brasília (`America/Sao_Paulo`), Amazonas (`America/Manaus`) and Acre (`America/Rio_Branco`). An "Outros" option allows picking any IANA zone. Changing the zone affects display and new records; existing records keep their `data`.
- **RN38 (sound):** on/off toggle, choice among 3 sounds, volume control and a "Testar" button.
- **RN39 (notifications):** a button to request notification permission and show the current status.

## Functional requirements and acceptance criteria

- **RF01 – Goals:** create, rename, reorder, archive and unarchive.
  - *Acceptance:* creating a second "PF" acronym is blocked; the acronym field is disabled when editing; an archived goal disappears from plan selection.
- **RF02 – Subjects:** create inside a goal, edit name, description and color, reorder, archive and unarchive.
  - *Acceptance:* creating "Matemática" under PF produces `Matemática-PF`; renaming it to "Matemática Básica" also changes the code in the history; renaming to an existing code is blocked.
- **RF03 – Plan:** add and remove subjects and edit weights directly in the table.
  - *Acceptance:* with a 100 h target and weights 2, 1 and 1, the targets are 50h00, 25h00 and 25h00; changing the target to 80 h recalculates instantly, without reloading the page.
- **RF04 – Panel:** shows the current date (in the time zone), monthly target (editable), time studied this month, remaining time, overall % and number of subjects in the plan.
- **RF05 – Main table:** columns % Concluída | Peso | Código | Matéria | Tempo estudado (min) | Meta da matéria | Tempo restante. Sorted by goal order, then subject order, with the subject's color dot.
  - *Acceptance:* with a 20 h target and 30 h studied, the subject shows 150%.
- **RF06 – Timer:** the full flow from RN15 to RN26. An active-session indicator (subject and time) is visible in the sidebar on every screen.
  - *Acceptance:* pausing freezes the time; ending at 23 min of 60 shows 23 min in the confirmation; "Cancelar" saves nothing; closing and reopening the tab shows the recovery modal; simulating a 5-minute clock jump pauses the session counting only up to the last heartbeat.
- **RF07 – Statistics:** RN27 to RN29.
  - *Acceptance:* records from January 2026 and January 2027 appear under different years; the ranking sums correctly and separates `Matemática-PF` from `Matemática-CF`.
- **RF08 – Manual entries and editing:** RN30 and RN31.
  - *Acceptance:* a future date is rejected; a timer record shows no edit option; a deleted record disappears from the totals but remains in the backup.
- **RF09 – Backup:** RN32 to RN36.
  - *Acceptance:* exporting then importing reproduces the data exactly; a file with 1 byte changed is rejected by the checksum; a rejected import changes nothing.
- **RF10 – Settings:** RN37 to RN39.

## Non-functional requirements

- **Platform:** desktop first (1280 px and up), using the horizontal space: fixed sidebar and wide tables. The layout is responsive down to 360 px, with a collapsible menu and horizontally scrolling tables, with no dedicated mobile polish in the MVP.
- **Browsers:** current versions of Chrome, Edge and Firefox. Safari where possible.
- **Offline:** 100% functional without internet after the first load. Installable as a PWA.
- **Performance:** initial load under 2 s; smooth screens with 20,000 records (calculations with `useMemo` and indexed queries).
- **Accessibility:** full keyboard navigation, visible focus, labels on every field, AA contrast in both themes.
- **Language:** Brazilian Portuguese, with numbers formatted as `1.234,5`.
- **Error handling:** friendly messages, no stack traces for the user; detailed errors only in the `console` in development mode.
- **Privacy:** no data leaves the device. No analytics, no trackers, no network calls other than loading the app itself. **Exception (Phase 7):** the optional Google Drive backup, which only runs after the user connects their own Google account (see "Phase 7 addendum").

## Interface

All UI text in Brazilian Portuguese.

- **Layout:** sidebar with Principal, Cadastro, Estatísticas and Configurações, plus the active-session indicator. Header with the backup reminder when applicable. Light and dark themes follow the system, with a manual toggle.
- **Principal (Main):**
  - indicator panel in cards;
  - plan table, with an "Editar planejamento" button that opens a dialog listing active subjects grouped by goal, with checkboxes;
  - timer card: subject select, minutes, Iniciar, Pausar/Continuar, Encerrar and Cancelar, with the time prominently displayed and a progress bar.
- **Cadastro (Registration):** list of goals (name, acronym, order, actions), each expandable to show its subjects (color, name, code, description, order, actions), plus the "Mostrar arquivados" toggle.
- **Estatísticas (Statistics):** year selector, Jan–Dec and Ano tabs, total at the top, Table 01 and Table 02 side by side on desktop, and the "Lançar estudo manual" button.
- **Configurações (Settings):** sections for time zone, sound, notifications, storage (persistence status) and backup (export and import).
- **Visual style:** clean and neutral (shadcn default), indigo accent color, comfortable buttons and click targets, and each subject's color used for identification.

## Security

- The app has no login and no server, so there are no secrets or sensitive environment variables. Do not create a `.env` with real data.
- Validate every form input and **every imported file** with Zod. Treat backups as untrusted data.
- Never use `dangerouslySetInnerHTML` or `eval`. User text is rendered as plain text only.
- Include a restrictive Content-Security-Policy via `<meta>` (`default-src 'self'`, no external scripts).
- Pin dependency versions and run `npm audit` in CI. No external CDNs; everything is bundled at build time.
- **Single exception (Phase 7):** the Google Identity Services script `https://accounts.google.com/gsi/client`. Google only supports loading it from that URL ("self-hosting or bundling an offline copy of the script is not supported"), so it cannot be bundled. It is allowed in the CSP only when `VITE_GOOGLE_CLIENT_ID` is set at build time, and loaded only on demand (RN41). No other external script is allowed.
- Never log the content of user data.

## Environment variables

- `VITE_BASE_PATH`: deploy base path (e.g. `/study-manager/` on GitHub Pages; `/` locally). Ship a `.env.example` with this value.
- `VITE_GOOGLE_CLIENT_ID` (Phase 7, optional): OAuth client ID of type "Web application". It is public by nature (it is sent to the browser in every authorization request), so in CI it is a repository **variable**, not a secret. When it is missing, the Google Drive backup does not exist in the build.

## Implementation plan

Build **one phase at a time**. At the end of each phase, run lint, tests and build, show the results (in Portuguese) and **wait for my confirmation** before moving on.

### Phase 1 – Foundation
- Vite + React + strict TS project, Tailwind, shadcn/ui, ESLint and Prettier, React Router with the 4 routes, sidebar layout, light and dark themes.
- Dexie schema version 1 with all tables, creation of the default `configuracoes` row and `navigator.storage.persist()`.
- PWA (manifest, icons, service worker, offline).
- GitHub Actions workflow: lint, tests and build on every push; deploy to GitHub Pages from `main`.
- *Acceptance:* the app opens, navigates between the empty screens, works offline after the first visit and is installable.

### Phase 2 – Registration
- RF01 and RF02, with `domain/codigo.ts` (code generation and uniqueness check) covered by tests.
- *Acceptance:* the acceptance criteria of RF01 and RF02.

### Phase 3 – Planning and Main tab
- `domain/calculos.ts` (targets, %, remaining time, monthly totals) and `domain/tempo.ts` (current month and date in the time zone, `4h27` formatting), with extensive tests: month rollover, different time zones, empty target, empty plan, % above 100.
- RF03, RF04 and RF05.
- *Acceptance:* the criteria of RF03 and RF05, using test records inserted by a development-only seed script.

### Phase 4 – Timer
- `domain/cronometro.ts` as a pure state machine (state + event + now → new state), with tests for every transition, the heartbeat, sleep, recovery and the time cap.
- Dexie integration, the timer card UI, the confirmation modal, the recovery modal, `beforeunload`, sound, notification and keyboard shortcut.
- *Acceptance:* the criteria of RF06.

### Phase 5 – Statistics
- RF07 and RF08: year selector, tabs, tables, yearly view, manual entry, editing and soft deletion.
- *Acceptance:* the criteria of RF07 and RF08.

### Phase 6 – Backup, settings and polish
- `domain/backup.ts` (serialization, checksum, validation, migration) with tests. RF09 and RF10. Backup reminder. Database failure screen.
- Playwright E2E tests of the flows: register → plan → time a session → confirm → see it in the statistics; session recovery; backup and restore.
- Accessibility and responsiveness review, and the final README.
- *Acceptance:* the criteria of RF09 and the full Definition of done.

### Phase 7 – Google Drive backup
- RF11 and RN40–RN53, as described in "Phase 7 addendum" below.
- *Acceptance:* the criteria of RF11.

## Phase 7 addendum: automatic backup to Google Drive

Added after the MVP, at the user's request. It does **not** change the manual file backup (RN32–RN36), which keeps working exactly as before.

**What it is:** besides the file backup, the app sends automatic copies of the data to a folder in the user's own Google Drive, and can restore from them. The app stays **local-first**: Drive is only a backup destination. There is **no sync**: data is never merged, and nothing is read from Drive except when the user restores a backup. The "Cloud sync with login" item in "Later" remains out of scope.

**Opt-in:** nothing is sent to Google until the user clicks "Conectar" in Settings.

### Cloud state database
The Drive state lives in a **separate Dexie database**, `study-manager-nuvem`, version 1. The main database (`study-manager`) is **not** changed and keeps its version, so an older app version can still open it (RN36).

Table `estado` (at most one row, `id = 'drive'`):

| Field | Type | Rule |
|---|---|---|
| id | `'drive'` | |
| conectado | boolean | `true` after a successful "Conectar"; `false` after "Desconectar" |
| email | string \| null | Connected account, from the Drive API; shown in Settings and used as `login_hint` |
| pastaId | string \| null | ID of the "Study Manager" folder created by the app |
| ultimoEnvioEm | ISO string \| null | Last **successful** upload |
| ultimoGatilhoEm | ISO string \| null | Last upload trigger (RN43). An upload that started before it does not set `situacao = 'ok'` (the data sent may be outdated) |
| situacao | `'ok' \| 'pendente' \| 'erro'` | Current state |
| mensagemErro | string \| null | User-facing message (Portuguese, no technical details) when `situacao = 'erro'` |
| motivoErro | `'suspenso' \| 'falha'` \| null | `'suspenso'`: automatic upload suspended by RN45; `'falha'`: any other error. Null unless `situacao = 'erro'` |
| registrosUltimoEnvio | number \| null | Total number of records (including soft-deleted) in the last successful upload, or in the last restored backup (RN45) |

This database is **not** part of the backup file, survives a restore (RN33) and is only cleared by "Desconectar". The access token is **never** stored in it (RN41).

### Rules
- **RN40 (availability):** the feature exists only when `VITE_GOOGLE_CLIENT_ID` is set at build time. Without it, the Settings section, the indicator (RN49) and the Google CSP entries (RN51) do not exist, and the app works exactly as before.
- **RN41 (authorization):**
  - Google Identity Services (GIS) **token model**, entirely in the browser: no backend, no client secret, no refresh token. The **only** scope is `https://www.googleapis.com/auth/drive.file` (the app only sees the files and folders it created).
  - The GIS script is loaded **on demand only**: client ID present **and** (the user clicks "Conectar" **or** the state says `conectado` and a token is needed). It is never loaded at app start, in unit tests or in the E2E build.
  - The access token lives **only in memory**, per tab. It is never written to `localStorage`, IndexedDB, logs or the URL. After a reload, a new tab or expiry (about 1 h, per `expires_in`, with a safety margin), there is no token.
  - A new token is requested with `requestAccessToken({ prompt: '', login_hint: email })`. Since browsers only allow popups right after a click, it is called **synchronously inside the click handler**, before any `await`. Popup blocked (`popup_failed_to_open`), closed (`popup_closed`) or with no answer within 2 minutes only leaves the backup as `pendente`; a token that arrives after the time limit is still used.
- **RN42 (local action never waits):** confirming a timer session and saving, editing or deleting a manual entry always happen locally, whatever happens with Google. The token request runs **in parallel** with the local action, and no failure from Google (popup, network, API) blocks, delays or undoes it.
- **RN43 (when to upload):**
  - Triggers: Confirmar of a timer session (RN21); saving, editing or deleting a manual entry (RN30, RN31); the "Fazer backup agora" button of the Google Drive section; a successful "Conectar". Only while `conectado`.
  - **"Conectar" uploads at once** (no 5 s wait), right after reading the reference from Drive (RN45). It is an automatic upload, so RN45 applies to it.
  - On each trigger, `situacao = 'pendente'` is written to the cloud database **immediately**, so a pending upload is still visible if the tab closes before the upload.
  - Automatic triggers are **grouped**: the upload happens 5 s after the last trigger. "Fazer backup agora" uploads at once.
  - Uploads from several tabs are serialized by a Web Lock (`study-manager:nuvem`).
  - No token: stays `pendente` and shows the indicator (RN49). Offline: stays `pendente` and retries when the `online` event fires, if the tab still has a valid token. API failure: `situacao = 'erro'` with a friendly message.
  - Success: `situacao = 'ok'`, `ultimoEnvioEm` and `registrosUltimoEnvio` updated.
- **RN44 (content):** the uploaded content is produced by the same `gerarBackup` as the manual export: exactly the RN32 format (with checksum), validated before leaving. If validation fails, nothing is uploaded and `situacao = 'erro'`. Uploading to Drive does **not** change `configuracoes.ultimoBackupEm` locally (the file itself carries `ultimoBackupEm = exportadoEm`, as in RN32).
- **RN45 (protection against overwriting a good backup):** since records are only soft-deleted, the total number of records (including soft-deleted) does not decrease in normal use.
  - Before each **automatic** upload, if the current total is **lower** than `registrosUltimoEnvio`, nothing is sent and `situacao = 'erro'` with the message: "Os dados deste navegador têm menos registros que o último backup no Drive. O envio automático foi suspenso para não sobrescrever o backup."
  - In that case, "Fazer backup agora" asks for explicit confirmation before uploading.
  - While suspended, the Settings section also suggests restoring from Drive ("Se este navegador é novo ou está sem os seus dados, restaure um backup do Google Drive."), next to "Restaurar do Google Drive". Typical case: connecting from a new, still empty browser, whose total is lower than the reference read from Drive, so the first upload is suspended.
  - The suspension is stored as `situacao = 'erro'` with `motivoErro = 'suspenso'`, and is shown in the header (RN53).
  - **Reference read from Drive:** when connecting with no local reference (`registrosUltimoEnvio = null`: first connection, or after "Desconectar"), after finding the folder the app reads the number of records stored in the `appProperties` of the **most recent** backup in the folder and uses it as `registrosUltimoEnvio`. It is untrusted data, validated with Zod; if it is missing or invalid, there is no reference. This is safe because the reference can only block automatic uploads, never allow them. Renewing the token ("Reconectar Google Drive", RN49) does **not** read it again, so a deliberate restore of an older backup (below) is not blocked afterwards.
  - With no reference there is no comparison.
  - After any successful restore (from a file or from Drive), `registrosUltimoEnvio` becomes the total of the restored data. If connected, `situacao` becomes `'pendente'` (the restored data is not on Drive yet) and any error, including the suspension, is cleared.
- **RN46 (files and retention):**
  - Folder "Study Manager" in the root of the user's Drive, created by the app and marked with `appProperties`. It is found by `pastaId`; if it no longer exists or is in the trash, it is searched by its mark and, if not found, created again.
  - **One file per day:** `study-manager-backup-YYYY-MM-DD.json`, with the day in the configured time zone at upload time. Later uploads on the same day **overwrite** that day's file. Files are marked with `appProperties` (app mark, day and a summary: export time and number of goals, subjects and records).
  - **Retention:** the 30 most recent days are kept. Older files created by the app are moved to the **trash** (`trashed: true`), never deleted permanently. Files not created by the app are never touched.
- **RN47 (restore from Drive):**
  - "Restaurar do Google Drive" lists the app's backups in the folder, newest first, with date/time and the summary from `appProperties`. That summary is untrusted data: it is validated before display and shown only as information.
  - The chosen file is downloaded (size ≤ 50 MB, checked from the metadata before downloading and again on the text) and goes through **exactly** the RN33 flow: blocked with an active session, `validarArquivoBackup`, summary computed from the validated file, confirmation, copy of the current data, replacement in one transaction, "Recarregar". No shortcut skips validation or the copy.
- **RN48 (Settings):** a "Google Drive" section with:
  - "Conectar" / "Desconectar"; connected e-mail; date/time of the last successful upload; state (ok / pendente / erro, with the message); "Fazer backup agora"; "Restaurar do Google Drive".
  - "Desconectar" revokes the token (when the tab has one), clears the cloud database and **deletes nothing in Drive**. The screen says so explicitly.
- **RN49 (indicator):** while `conectado` and `pendente` with no valid token in the tab, a discreet header indicator "Reconectar Google Drive" is shown. Clicking it requests the token (it is a click, so the popup is allowed) and uploads.
- **RN50 (reminder):** RN34 now uses the most recent of `configuracoes.ultimoBackupEm` and `ultimoEnvioEm`. The reminder's "Fazer backup agora" keeps downloading the file only.
- **RN51 (security):**
  - CSP entries are added **only** when `VITE_GOOGLE_CLIENT_ID` is set at build time: `script-src https://accounts.google.com/gsi/client` (the GIS library, that single file); `connect-src https://accounts.google.com/gsi/` (GIS internal calls, as recommended by Google) and `https://www.googleapis.com` (Drive API: metadata, upload, download). Any other entry (e.g. `frame-src`) is added only if a real test proves it necessary, with the reason recorded.
  - Never log the token or backup content.
  - Every API response is untrusted data: validated with Zod before use.
  - Error messages in Portuguese, with no technical details (detailed errors only in the console in development mode).
- **RN52 (testability):** Drive access lives behind an interface (`DestinoBackupNuvem`) with a real implementation (GIS + Drive REST API through `fetch`) and a fake one (in memory). Unit and E2E tests use only the fake one or fake `fetch`/`google` objects; **no test reaches Google**. The fake implementation never reaches the production `dist/`.
- **RN53 (suspension indicator):** while `motivoErro = 'suspenso'`, the header shows a discreet indicator "Backup no Drive suspenso", in the same style as RN49, linking to the Google Drive section in Settings. It takes precedence over the RN49 indicator (reconnecting would not resume the upload). Other errors (`motivoErro = 'falha'`) are shown only in Settings: the next trigger tries again.

### RF11 – Google Drive backup
- RN40 to RN53.
- *Acceptance:* without `VITE_GOOGLE_CLIENT_ID` nothing changes; confirming a session works normally with the popup blocked, closed or unanswered, leaving the backup `pendente`; several triggers within 5 s produce one upload; a pending state written before closing the tab is shown after reopening; fewer records than the last upload suspends automatic uploads and shows "Backup no Drive suspenso" in the header; connecting reads the reference count from the most recent backup in Drive; a 31st day moves the oldest file to the trash; restoring from Drive goes through validation and the copy of current data; "Desconectar" deletes nothing in Drive.

## Tests

- **Unit (Vitest):** all of `src/domain`, with a minimum of **90%** coverage in that directory. Use `vi.useFakeTimers()` and `vi.setSystemTime()` in time and time-zone tests.
- **Components (Testing Library + fake-indexeddb):** registration forms, main table and confirmation modal.
- **E2E (Playwright):** the flows listed in Phase 6, on Chromium and Firefox. Use `page.clock` to simulate the passage of time and sleep.

## Conventions

- Code identifiers (variables and functions) in **Portuguese**, without accents (e.g. `calcularMetaIndividual`). Comments and UI text in Brazilian Portuguese.
- Components in PascalCase, one component per file. Business logic only in `src/domain`, never inside components.
- Database access only through the repositories in `src/db`.
- Commits follow Conventional Commits, in Portuguese (e.g. `feat(cronometro): detecta suspensao pelo heartbeat`).
- No `any` in TypeScript.

## Working rules

- **Always reply to the user in Brazilian Portuguese.**
- Build one phase at a time. At the end of each phase, run the tests, show the results and wait for confirmation before continuing.
- **Do not invent business rules** and do not change the rules confirmed in this document.
- Do not add features, libraries or services outside this specification without asking. Do not build anything from the "Later" or "Out of scope" lists.
- If you find an ambiguity, conflict or uncovered case, **stop and ask** instead of assuming. When proposing something, clearly separate what is a confirmed requirement, what is your suggestion and what is still pending.
- Always preserve the integrity of the history. No operation may physically delete records, except a backup restore confirmed by the user.
- Prioritize simplicity and maintainability.
- Make small, descriptive commits.
- Keep the README up to date (in Portuguese) with: what the app is, how to install, how to run in development, how to run the tests, how to deploy and how to back up and restore.

## Definition of done

- [ ] All of RF01–RF10 implemented, with acceptance criteria verified
- [ ] All of RN01–RN39 respected
- [ ] `npm run lint`, `npm test` and `npm run build` with no errors; coverage ≥ 90% in `src/domain`
- [ ] E2E tests passing on Chromium and Firefox
- [ ] App works offline and is installable as a PWA
- [ ] Automatic deploy to GitHub Pages working
- [ ] Exporting and importing a backup reproduces the data exactly
- [ ] Full keyboard navigation and AA contrast in both light and dark themes
- [ ] `npm audit` with no high or critical vulnerabilities
- [ ] Complete README
