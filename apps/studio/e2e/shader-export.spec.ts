import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Shader Graph exports generated GLSL separately from the editable graph', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-shader-graph').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export GLSL' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.glsl$/);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const source = await readFile(filePath!, 'utf8');
  expect(source).toContain('vec4');
  await expect(page.getByRole('button', { name: 'Export Graph' })).toBeVisible();
});
