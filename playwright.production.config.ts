import { defineConfig, devices } from '@playwright/test';

const productionUrl = process.env.PROD_URL ?? 'https://thiepn.dev/notes/';

export default defineConfig({
  testDir: './pwa-e2e',
  testMatch: 'v11-phase4-rich-share.spec.ts',
  outputDir: './production-smoke-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: productionUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-production',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
