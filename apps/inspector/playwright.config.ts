import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright runs webServer.command from this config's directory; the Inspector's
// Vite config lives at the repository root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const port = Number(process.env.PLAYWRIGHT_PORT ?? 1421);
const url = `http://127.0.0.1:${port}`;

/**
 * Feather Inspector's suite.
 *
 * One product per config: Inspector, Studio and the Showcase are separate
 * applications now, and a shared config would have hidden that. Each runs
 * against its own server.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: url, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  webServer: {
    // `pnpm exec` rather than `pnpm run`: pnpm passes `--` through literally, so
    // flags after it never reach Vite.
    command: `pnpm exec vite --host 127.0.0.1 --port ${port}`,
    url,
    cwd: repoRoot,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
