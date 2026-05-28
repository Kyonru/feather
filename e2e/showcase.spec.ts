import { expect, test } from '@playwright/test';

test('standalone showcase loads the landing page and tools', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /complete developer toolkit/i })).toBeVisible();

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

test('shader graph surfaces compiler diagnostics for broken imports', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  const brokenGraph = {
    type: 'feather.shader-graph',
    version: 2,
    exportedAt: new Date('2026-05-27T00:00:00.000Z').toISOString(),
    shaderName: 'broken-diagnostics',
    playgroundTarget: null,
    nodes: [
      {
        id: 'texture',
        type: 'shaderNode',
        position: { x: 0, y: 0 },
        data: { label: 'Missing Noise Texture', nodeType: 'TextureInput', uniformName: 'noise' },
      },
      {
        id: 'sample',
        type: 'shaderNode',
        position: { x: 260, y: 0 },
        data: { label: 'Sample Noise', nodeType: 'SampleTexture' },
      },
      {
        id: 'broken-fn',
        type: 'shaderNode',
        position: { x: 0, y: 220 },
        data: {
          label: 'Broken Function',
          nodeType: 'CustomFunction',
          customCode: 'vec4 broken(vec4 color) {\\n  color.rgb = color.rgb\\n  return color;\\n}',
        },
      },
      {
        id: 'out',
        type: 'shaderNode',
        position: { x: 540, y: 0 },
        data: { label: 'Final Color', nodeType: 'FragmentOutput' },
      },
    ],
    edges: [
      {
        id: 'texture:texture->sample:texture',
        source: 'texture',
        sourceHandle: 'texture',
        target: 'sample',
        targetHandle: 'texture',
      },
      {
        id: 'sample:out->out:color',
        source: 'sample',
        sourceHandle: 'out',
        target: 'out',
        targetHandle: 'color',
      },
      {
        id: 'missing:out->sample:uv',
        source: 'missing-node',
        sourceHandle: 'out',
        target: 'sample',
        targetHandle: 'uv',
      },
    ],
    subgraphs: [
      {
        id: 'cyclic-subgraph',
        name: 'Cyclic Utility',
        functionName: 'feather_subgraph_cyclic_utility',
        nodes: [
          {
            id: 'self',
            type: 'shaderNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Self Reference',
              nodeType: 'SubgraphInstance',
              subgraphId: 'cyclic-subgraph',
              subgraphInputs: [],
              subgraphOutputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
            },
          },
        ],
        edges: [],
        inputs: [],
        outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
        inputMappings: {},
        outputMappings: { out: { nodeId: 'self', portId: 'out' } },
      },
    ],
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken-diagnostics.feathershgh',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(brokenGraph)),
  });

  const diagnostics = page.getByTestId('shader-diagnostics');
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.getByText(/Upload a texture for Missing Noise Texture/i)).toBeVisible();
  await expect(diagnostics.getByText(/Remove stale connection/i)).toBeVisible();
  await expect(diagnostics.getByText(/Fix Broken Function/i)).toBeVisible();
  await expect(diagnostics.getByText(/cyclic subgraph reference/i)).toBeVisible();

  await diagnostics.getByRole('button', { name: /Upload a texture for Missing Noise Texture/i }).click();
  await expect(page.getByText('Texture File')).toBeVisible();
  await expect(page.getByText('Fallback texture until a file is loaded')).toBeVisible();
  await expect(page.getByRole('button', { name: /preview on/i })).toBeDisabled();
});
