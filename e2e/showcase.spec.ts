import { expect, test } from '@playwright/test';

test('standalone showcase loads the landing page and tools', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /browser-native authoring tools/i })).toBeVisible();

  await page.locator('header').getByRole('button', { name: /^shader graph$/i }).click();
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  await expect(page.getByText('GLSL Output')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Shader Preview love.js preview"]').locator('canvas')).toBeVisible();

  await page.locator('header').getByRole('button', { name: /particle playground/i }).click();
  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await expect(page.getByLabel('Rate')).toBeVisible();
  await page.getByLabel('Rate').fill('144');
  await expect(page.getByLabel('Rate')).toHaveValue('144');
  await expect(page.frameLocator('iframe[title="Particle Preview love.js preview"]').locator('canvas')).toBeVisible();
});
