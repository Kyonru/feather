import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The Showcase suite: Feather Studio running in a browser.
 *
 * Runs against the built output rather than dev, because the showcase ships as
 * a static site and that is what users get.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  webServer: {
    command:
      'pnpm run showcase:build && pnpm exec vite preview --config apps/showcase/vite.config.ts --host 127.0.0.1',
    url: 'http://127.0.0.1:4174',
    cwd: repoRoot,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
