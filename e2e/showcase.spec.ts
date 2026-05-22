import { expect, test } from '@playwright/test';

test('standalone showcase loads the landing page and tools', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /browser-native authoring tools/i })).toBeVisible();

  await page.locator('header').getByRole('button', { name: /^shader graph$/i }).click();
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  await expect(page.getByText('GLSL Output')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Shader Preview"]').locator('canvas')).toBeVisible();

  const nodesBeforeInsert = await page.locator('.react-flow__node').count();
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 300, y: 220 } });
  await expect(page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes')).toBeVisible();
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('time');
  await page.getByTestId('shader-node-picker').getByRole('button', { name: /^time input$/i }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 1);
  await page.getByRole('button', { name: /create subgraph from selection/i }).click();
  await expect(page.getByRole('dialog', { name: /create subgraph/i })).toBeVisible();
  await page.getByLabel('Name').fill('Reusable Time');
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.locator('.react-flow__node', { hasText: 'Reusable Time' })).toBeVisible();

  const nodesBeforePreset = await page.locator('.react-flow__node').count();
  await page.getByText('Insert preset').click();
  await page.getByRole('option', { name: /texture pass/i }).click();
  await expect.poll(() => page.locator('.react-flow__node').count()).toBeGreaterThan(nodesBeforePreset);

  await page.locator('header').getByRole('button', { name: /particle playground/i }).click();
  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Emitter Properties' })).toBeVisible();
  await expect(page.getByText('Rate')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Particle Preview"]').locator('canvas')).toBeVisible();
});
