import { defineConfig, devices } from '@playwright/test';

const appE2EPort = Number(process.env.PLAYWRIGHT_PORT ?? 1421);
const appE2EUrl = `http://127.0.0.1:${appE2EPort}`;
const reuseExistingAppServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
  testDir: './e2e',
  testIgnore: /showcase\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: appE2EUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run web -- --host 127.0.0.1 --port ${appE2EPort}`,
    url: appE2EUrl,
    reuseExistingServer: reuseExistingAppServer,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
