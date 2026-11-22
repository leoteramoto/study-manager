import { defineConfig, devices } from '@playwright/test'

// Porta própria dos testes, para nunca reaproveitar um `vite preview` aberto à mão
// (que pode estar servindo um build antigo).
const PORTA = 4180

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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORTA} --strictPort`,
    // Ticks do cronômetro na thread principal, para o page.clock controlar o tempo.
    env: { VITE_FONTE_TICKS: 'principal' },
    url: `http://localhost:${PORTA}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
