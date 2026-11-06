import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

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
