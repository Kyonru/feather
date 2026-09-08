import { expect, test } from '@playwright/test';

/**
 * Feather Studio's shell.
 *
 * The tools themselves are covered by the Showcase suite, which renders the same
 * components. What is unique to Studio — and what these assert — is that it is a
 * *separate application*: it boots without an Inspector, treats the bridge as
 * optional, and never assumes a game is attached.
 */

test('Studio boots as a standalone application', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Feather Studio' })).toBeVisible();
  await expect(page.getByText('Shader graph · Texture lab · Particle playground')).toBeVisible();
});

test('Studio is usable with no Inspector running', async ({ page }) => {
  await page.goto('/');

  // Not an error state. Standalone Studio is a supported, fully useful mode —
  // this is the null bridge from @feather/session-bridge.
  await expect(page.getByText('Not connected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect to Feather Inspector/ })).toBeVisible();
  await expect(page.getByText(/Studio works as a local editor without it/)).toBeVisible();
});

test('Studio reports a failed Inspector connection without breaking', async ({ page }) => {
  await page.goto('/');
  // Nothing is listening on the bridge port in this suite, so connecting fails.
  await page.getByRole('button', { name: /Connect to Feather Inspector/ }).click();

  await expect(page.getByText('Not connected')).toBeVisible();
  // The shell stays interactive rather than throwing.
  await expect(page.getByRole('heading', { name: 'Feather Studio' })).toBeVisible();
});

test('Studio knows which host it is running under', async ({ page }) => {
  await page.goto('/');
  // Under Playwright there is no Tauri runtime, so the web host is correct.
  await expect(page.getByText('Browser', { exact: true })).toBeVisible();
});
