import { expect, test } from '@playwright/test';

test('Texture Lab preview announces the selected generator and output dimensions', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-texture-lab').click();

  const preview = page.getByTestId('texture-lab-preview');
  await expect(preview).toHaveAttribute('alt', 'Soft Circle texture preview, 64 x 64 pixels');

  await page.getByRole('button', { name: /Spark/ }).first().click();
  await expect(preview).toHaveAttribute('alt', 'Spark texture preview, 64 x 64 pixels');
});
