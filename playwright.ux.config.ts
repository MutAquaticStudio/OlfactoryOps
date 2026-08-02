import { defineConfig, devices } from '@playwright/test'

const remoteBaseUrl = process.env.UX_TEST_BASE_URL?.trim()
const authenticatedStorageState = process.env.UX_TEST_STORAGE_STATE?.trim()

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.playwright.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/ux-playwright', open: 'never' }]],
  expect: { timeout: 10_000, toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.015 } },
  use: {
    baseURL: remoteBaseUrl || 'http://127.0.0.1:4173',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    storageState: authenticatedStorageState || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: remoteBaseUrl ? undefined : {
    command: 'npm.cmd run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  outputDir: '.qa/ux-playwright-results',
  snapshotPathTemplate: '{testDir}/visual-snapshots/{projectName}/{arg}{ext}',
})
