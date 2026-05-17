import { expect, test, type Page } from '@playwright/test';

async function seedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'session-storage',
      JSON.stringify({
        state: {
          sessions: {
            demo: {
              id: 'demo',
              name: 'Demo Session',
              os: 'Web',
              connected: true,
              connectedAt: Date.now(),
            },
          },
        },
        version: 0,
      }),
    );
  });
}

test('shows no-session empty state and opens settings', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('No session connected')).toBeVisible();
  await expect(page.getByText('Start a game with Feather enabled')).toBeVisible();

  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('WebSocket Port')).toHaveValue('4004');
  await expect(page.getByLabel('Connection Timeout (seconds)')).toHaveValue('15');
});

test('persists settings changes across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();

  await page.getByLabel('WebSocket Port').fill('4111');
  await page.getByLabel('Connection Timeout (seconds)').fill('22');

  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByLabel('Asset Source Directory').fill('/tmp/feather-assets');

  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();

  await page.reload();
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await expect(page.getByLabel('WebSocket Port')).toHaveValue('4111');
  await expect(page.getByLabel('Connection Timeout (seconds)')).toHaveValue('22');

  await page.getByRole('tab', { name: 'General' }).click();
  await expect(page.getByLabel('Asset Source Directory')).toHaveValue('/tmp/feather-assets');
});

test('keeps tool routes gated until a session is selected', async ({ page }) => {
  await page.goto('/assets');

  await expect(page.getByText('No session connected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assets' })).toBeDisabled();
});

test('activates a persisted session and renders core tools', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Demo Session/ })).toBeVisible();
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByPlaceholder('Search...')).toBeVisible();

  await page.getByRole('link', { name: /Performance/ }).click();
  await expect(page.getByText('Track disk usage')).toBeVisible();

  await page.getByRole('link', { name: /Assets/ }).click();
  await expect(page.getByText('No assets captured yet')).toBeVisible();
});
