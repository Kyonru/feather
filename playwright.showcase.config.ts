import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /showcase\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  // @ts-expect-error process is only defined in Node.js environment, and this config file is not bundled
  reporter: process?.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run showcase:build && npm run showcase:preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4174',
    // @ts-expect-error process is only defined in Node.js environment, and this config file is not bundled
    reuseExistingServer: !process?.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
