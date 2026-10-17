import { defineConfig, devices } from '@playwright/test';

/**
 * Feather Studio's own suite.
 *
 * Runs against Studio's dev server, which is a different application from the
 * Showcase even though they render the same tools: Studio has its own shell,
 * its own Tauri host detection, and the optional Inspector bridge.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://127.0.0.1:1430', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm --filter @feather/studio run dev',
    url: 'http://127.0.0.1:1430',
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
