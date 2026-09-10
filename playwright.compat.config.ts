import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './compat-e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: 0,
  workers: isCi ? 3 : undefined,
  reporter: [['html', { outputFolder: 'compat-playwright-report', open: 'never' }]],
  outputDir: 'compat-test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173/notes/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-core',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-core',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-core',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/notes/',
    reuseExistingServer: !isCi,
  },
});
