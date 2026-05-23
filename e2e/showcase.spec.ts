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
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 420, y: 220 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('float');
  await page.getByTestId('shader-node-picker').getByRole('button', { name: /^float input$/i }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 2);
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 260, y: 320 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('float parameter');
  await page.getByTestId('shader-node-picker').getByRole('button', { name: /^float parameter input$/i }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 3);
  await expect(page.getByText(/extern number u_param_/i)).toBeVisible();
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 380, y: 320 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('color parameter');
  await page.getByTestId('shader-node-picker').getByRole('button', { name: /^color parameter input$/i }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 4);
  await expect(page.getByText(/extern vec4 u_param_/i)).toBeVisible();
  await page.keyboard.press('Control+C');
  await page.keyboard.press('Control+V');
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 5);
  await expect(page.getByRole('button', { name: /unlink linked node/i })).toHaveCount(1);
  await page.keyboard.press('Control+D');
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 6);
  await expect(page.getByRole('button', { name: /unlink linked node/i })).toHaveCount(2);
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Unlink this node?');
    await dialog.accept();
  });
  await page.getByRole('button', { name: /unlink linked node/i }).first().click();
  await expect(page.getByRole('button', { name: /unlink linked node/i })).toHaveCount(1);

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
