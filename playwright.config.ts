import { defineConfig, devices } from '@playwright/test'

// Portas próprias dos testes, para nunca reaproveitar um `vite preview` aberto à
// mão (que pode estar servindo um build antigo).
const PORTA = 4180
/** Build com o backup na nuvem usando o destino falso (Fase 7). */
const PORTA_NUVEM = 4181
/** Build servido sob o caminho base do GitHub Pages (Fase 8). */
const PORTA_BASE = 4182
const CAMINHO_BASE = '/study-manager/'

/** Specs que só rodam no build com o destino falso da nuvem. */
const SPECS_NUVEM = /nuvem\.spec\.ts$/
/** Specs que só rodam no build com o caminho base. */
const SPECS_BASE = /caminho-base\.spec\.ts$/

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}/`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [SPECS_NUVEM, SPECS_BASE],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: [SPECS_NUVEM, SPECS_BASE],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'chromium-base',
      testMatch: SPECS_BASE,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PORTA_BASE}${CAMINHO_BASE}`,
      },
    },
    {
      name: 'firefox-base',
      testMatch: SPECS_BASE,
      use: {
        ...devices['Desktop Firefox'],
        baseURL: `http://localhost:${PORTA_BASE}${CAMINHO_BASE}`,
      },
    },
    {
      name: 'chromium-nuvem',
      testMatch: SPECS_NUVEM,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORTA_NUVEM}/` },
    },
    {
      name: 'firefox-nuvem',
      testMatch: SPECS_NUVEM,
      use: { ...devices['Desktop Firefox'], baseURL: `http://localhost:${PORTA_NUVEM}/` },
    },
  ],
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORTA} --strictPort`,
      // Ticks do cronômetro na thread principal, para o page.clock controlar o tempo.
      // VITE_GOOGLE_CLIENT_ID vazio: o E2E nunca usa o Client ID de um .env.local
      // nem carrega o script do Google (a variável do processo tem prioridade).
      env: { VITE_FONTE_TICKS: 'principal', VITE_GOOGLE_CLIENT_ID: '' },
      url: `http://localhost:${PORTA}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Client ID de teste e destino falso: o recurso do Drive existe, mas nada
      // sai para o Google (o GIS nunca é carregado). Pasta e porta próprias.
      command: `npx vite build --outDir dist-e2e-nuvem --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e-nuvem --port ${PORTA_NUVEM} --strictPort`,
      env: {
        VITE_FONTE_TICKS: 'principal',
        VITE_GOOGLE_CLIENT_ID: 'e2e-teste.apps.googleusercontent.com',
        VITE_DESTINO_NUVEM: 'falso',
      },
      url: `http://localhost:${PORTA_NUVEM}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Caminho base do GitHub Pages; ticks pelo worker de verdade. O preview
      // lê o mesmo VITE_BASE_PATH e serve o app sob o caminho.
      command: `npx vite build --outDir dist-e2e-base --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e-base --port ${PORTA_BASE} --strictPort`,
      env: { VITE_BASE_PATH: CAMINHO_BASE, VITE_GOOGLE_CLIENT_ID: '', VITE_DESTINO_NUVEM: '' },
      url: `http://localhost:${PORTA_BASE}${CAMINHO_BASE}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
