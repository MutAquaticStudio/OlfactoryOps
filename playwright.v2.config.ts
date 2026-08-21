import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/v2-role-workflows.playwright.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [['list'], ['html', { outputFolder: 'reports/v2-role-playwright', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', colorScheme: 'dark', reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  globalSetup: './scripts/v2-role-global-setup.mjs',
  globalTeardown: './scripts/v2-role-global-teardown.mjs',
  webServer: [
    { command: 'node dist-api/server/src/main.js', url: 'http://127.0.0.1:4000/api/v1/v2/platform/health', reuseExistingServer: false, timeout: 120_000 },
    { command: 'npx.cmd vite preview --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 120_000 },
  ],
  projects: [{ name: 'v2-role-matrix', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
})
