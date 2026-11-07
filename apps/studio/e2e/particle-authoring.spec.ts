import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

async function openParticles(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId('studio-tool-particle-playground').click();
  await expect(page.getByTestId('particle-workbench-header')).toBeVisible();
}

test('author, preview, save, import, and package a layered particle effect', async ({ page }, testInfo) => {
  await openParticles(page);

  await page.getByTitle('New composite').click();
  await page.getByPlaceholder('Explosion').fill('Aurora impact');
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Complex Composite' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByTestId('particle-workbench-header')).toContainText('Aurora impact');
  await expect(page.locator('[data-testid^="particle-emitter-row-"]')).toHaveCount(5);

  await page.getByRole('tab', { name: 'Preview & Assets' }).click();
  await page.getByRole('button', { name: 'star', exact: true }).click();
  await page.getByLabel('Shader preset').click();
  await page.getByRole('option', { name: 'Ember Heat' }).click();
  await page.getByRole('button', { name: 'Apply Preset' }).click();
  await expect(page.getByLabel('Current emitter texture')).toHaveValue('star.png');
  await expect(page.getByLabel('Shader path')).toBeVisible();
  await expect(page.getByLabel('Export file')).toHaveValue('ember-heat.glsl');
  await expect(page.getByLabel('Shader source')).toHaveValue(/float n = hash/);

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('particle-timeline-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play timeline' })).toBeVisible();
  await page.getByRole('button', { name: 'Play timeline' }).click();
  await expect.poll(() => page.getByTestId('particle-timeline-playhead').inputValue().then(Number)).toBeGreaterThan(0);

  await page.screenshot({ path: testInfo.outputPath('particle-playground-aurora-impact.png'), fullPage: false });

  await page.getByRole('button', { name: 'Project' }).click();
  const projectDownloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save Project', exact: true }).click();
  const projectDownload = await projectDownloadPromise;
  expect(projectDownload.suggestedFilename()).toBe('Aurora-impact.featherparticles');
  const projectPath = await projectDownload.path();
  expect(projectPath).not.toBeNull();
  const project = JSON.parse(await readFile(projectPath!, 'utf8')) as {
    version: number;
    composite: { systems: Array<{ texturePreset: string; shaderFilename: string; shaderPath: string; shaderSource: string }>; timeline?: { tracks: unknown[] } };
  };
  expect(project.version).toBe(4);
  expect(project.composite.systems).toHaveLength(5);
  expect(project.composite.systems[0]?.texturePreset).toBe('star');
  expect(project.composite.systems[0]?.shaderFilename).toBe('ember-heat.glsl');
  expect(project.composite.systems[0]?.shaderPath).toBe('');
  expect(project.composite.systems[0]?.shaderSource).toContain('float n = hash');
  expect(project.composite.timeline?.tracks).toHaveLength(5);

  await page.getByRole('button', { name: 'Project' }).click();
  await page.getByRole('menuitem', { name: 'Import Project', exact: true }).click();
  await page.getByTestId('particle-project-import-input').setInputFiles(projectPath!);
  await expect(page.getByText('Particle project imported')).toBeVisible();
  await expect(page.getByTestId('particle-workbench-header')).toContainText('Aurora impact 2');
  await expect(page.locator('[data-testid^="particle-emitter-row-"]')).toHaveCount(5);

  await page.getByRole('button', { name: 'Project' }).click();
  const zipDownloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save Project ZIP' }).click();
  const zipDownload = await zipDownloadPromise;
  expect(zipDownload.suggestedFilename()).toBe('Aurora-impact-2-project.zip');
  const zipPath = await zipDownload.path();
  expect(zipPath).not.toBeNull();
  const archive = unzipSync(await readFile(zipPath!));
  const entries = Object.keys(archive);
  expect(entries.some((name) => name.endsWith('.featherparticles'))).toBe(true);
  expect(entries.some((name) => name.endsWith('.lua'))).toBe(true);
  expect(entries.some((name) => name.endsWith('.glsl'))).toBe(true);
  const zipProject = JSON.parse(strFromU8(archive[entries.find((name) => name.endsWith('.featherparticles'))!])) as {
    composite: { systems: unknown[]; timeline?: { tracks: unknown[] } };
  };
  expect(zipProject.composite.systems).toHaveLength(5);
  expect(zipProject.composite.timeline?.tracks).toHaveLength(5);
});
