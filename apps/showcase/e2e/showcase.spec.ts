import { expect, test } from '@playwright/test';

test('Showcase mounts the shared Studio shell and all creative tools', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByTestId('studio-strip')).toBeVisible();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Shader Graph');
  await expect(page.getByTestId('studio-inspector-status')).toContainText('Local only');

  await page.getByTestId('studio-menu-trigger').click();
  await expect(page.getByTestId('studio-tool-shader-graph')).toBeVisible();
  await expect(page.getByTestId('studio-tool-particle-playground')).toBeVisible();
  await expect(page.getByTestId('studio-tool-texture-lab')).toBeVisible();

  await page.getByTestId('studio-tool-particle-playground').click();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Particles');
  await expect(page.getByTestId('particle-playground-root')).toBeVisible();

  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-texture-lab').click();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Texture Lab');
  await expect(page.getByTestId('texture-lab-preview')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Showcase supports the existing tool deep links', async ({ page }) => {
  await page.goto('/particle-system-playground');
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Particles');
  await expect(page.getByTestId('particle-playground-root')).toBeVisible();

  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-texture-lab').click();
  await expect(page).toHaveURL(/\/texture-lab$/);
  await page.reload();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Texture Lab');
});

test('Showcase preserves Studio tool selection and exports a browser texture', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-texture-lab').click();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Texture Lab');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/i);

  await page.reload();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Texture Lab');
});

test('Showcase Studio workbench fits a practical compact browser window', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-texture-lab').click();

  await expect(page.getByTestId('texture-lab-preview')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
