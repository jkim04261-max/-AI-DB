import { defineConfig, devices } from '@playwright/test'

// Every test in e2e/ drives the real frontend build against page.route()
// mocks of /api/** — there is no real backend, DB, or external API call
// in this suite (see e2e/README.md). That's also why `webServer` just
// starts the plain Vite dev server: no Vercel functions, no secrets, no
// Postgres/Gemini/Resend credentials are needed to run these tests.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0, // a flaky test must fail, not quietly pass on a retry
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
})
