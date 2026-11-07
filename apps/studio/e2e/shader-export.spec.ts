import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

test('template controls are accessible and their edits survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-shader-graph').click();
  await expect(page.getByTestId('studio-tool-surface').getByText('Loading tool…')).toBeHidden();

  const speed = page.getByRole('spinbutton', { name: 'Speed' });
  await expect(speed).toHaveValue('0.18');
  await speed.fill('0.35');
  await expect(speed).toHaveValue('0.35');

  await page.reload();
  await expect(page.getByTestId('studio-tool-surface').getByText('Loading tool…')).toBeHidden();
  await expect(page.getByRole('spinbutton', { name: 'Speed' })).toHaveValue('0.35');
});

test('Shader Graph palette search, category controls, add, undo, and redo work together', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-shader-graph').click();
  await expect(page.getByTestId('studio-tool-surface').getByText('Loading tool…')).toBeHidden();

  const canvas = page.getByTestId('shader-canvas');
  const initialNodeCount = await canvas.locator('.react-flow__node').count();
  const search = page.getByRole('textbox', { name: 'Search shader nodes' });
  await search.fill('Sine Waves');
  const sineNode = page.getByRole('button', { name: 'Add Sine Waves node to graph' });
  await expect(sineNode).toBeVisible();
  await sineNode.click();
  await expect(canvas.locator('.react-flow__node')).toHaveCount(initialNodeCount + 1);

  const undoButton = page.getByTitle('Undo (Cmd/Ctrl+Z)');
  await expect(undoButton).toBeVisible();
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect(page.getByTitle('Redo (Cmd/Ctrl+Shift+Z or Ctrl+Y)')).toBeEnabled();
  await expect(canvas.locator('.react-flow__node')).toHaveCount(initialNodeCount);
  await page.getByTitle('Redo (Cmd/Ctrl+Shift+Z or Ctrl+Y)').click();
  await expect(canvas.locator('.react-flow__node')).toHaveCount(initialNodeCount + 1);

  await search.fill('no node matches this');
  await expect(page.getByText('No shader nodes match this search.')).toBeVisible();
  await search.clear();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(sineNode).toBeHidden();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(sineNode).toBeVisible();
});

test('Shader Graph exports generated GLSL separately from the editable graph', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-shader-graph').click();
  await expect(page.getByTestId('studio-tool-surface').getByText('Loading tool…')).toBeHidden();
  await page.getByRole('button', { name: 'Export' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export GLSL' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.glsl$/);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const source = await readFile(filePath!, 'utf8');
  expect(source).toContain('vec4');

  await page.getByRole('button', { name: 'Export' }).click();
  const graphDownloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export Graph' }).click();
  const graphDownload = await graphDownloadPromise;
  expect(graphDownload.suggestedFilename()).toMatch(/\.feathershgh$/);
  const graphPath = await graphDownload.path();
  expect(graphPath).not.toBeNull();
  const graph = JSON.parse(await readFile(graphPath!, 'utf8')) as { type: string; version: number };
  expect(graph.type).toBe('feather.shader-graph');
  expect(graph.version).toBeGreaterThan(0);
});

test('Shader Graph imports an exported workspace and clears it after confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-shader-graph').click();
  await expect(page.getByTestId('studio-tool-surface').getByText('Loading tool…')).toBeHidden();

  const canvas = page.getByTestId('shader-canvas');
  const initialNodeCount = await canvas.locator('.react-flow__node').count();
  expect(initialNodeCount).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Export' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export Graph' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByTestId('shader-graph-import-input').setInputFiles(path!);
  await expect(page.getByText('Shader graph imported')).toBeVisible();
  await expect(canvas.locator('.react-flow__node')).toHaveCount(initialNodeCount);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByText('Shader Graph cleared')).toBeVisible();
  await expect(canvas.locator('.react-flow__node')).toHaveCount(0);
});

test('Shader Graph exports a bundle manifest and generated shader stages', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-shader-graph').click();
  await expect(page.getByTestId('studio-tool-surface').getByText('Loading tool…')).toBeHidden();
  await page.getByRole('button', { name: 'Export' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export Bundle' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-shader\.zip$/);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const entries = unzipSync(await readFile(filePath!));
  expect(entries['pixel.glsl']).toBeDefined();
  const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as { type: string; stages: { pixel: string } };
  expect(manifest.type).toBe('feather.shader-bundle');
  expect(manifest.stages.pixel).toBe('pixel.glsl');
});
