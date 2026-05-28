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

test('showcase serves the real love.js shader preview target', async ({ page }) => {
  const index = await page.request.get('/showcase-lovejs/index.html');
  expect(index.status()).toBe(200);
  expect(await index.text()).toContain('g=showcase.love');

  const bundle = await page.request.get('/showcase-lovejs/showcase.love');
  expect(bundle.status()).toBe(200);
  expect((await bundle.body()).length).toBeGreaterThan(0);

  await page.goto('/shader-graph');
  await expect(page.frameLocator('iframe[title="Shader Preview"]').locator('canvas')).toBeVisible();
});

test('shader graph node palette sections collapse and search hidden matches', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  const palette = page.getByTestId('shader-node-palette');
  const inputContent = palette.getByTestId('shader-node-category-content-input');
  const complexToggle = palette.getByTestId('shader-node-category-toggle-complex');
  const complexContent = palette.getByTestId('shader-node-category-content-complex');

  await expect(inputContent).toBeVisible();
  await expect(inputContent.getByRole('button', { name: 'Texture Color' })).toHaveAttribute('draggable', 'true');
  await expect(complexToggle).toBeVisible();
  await expect(complexContent).toBeHidden();

  await complexToggle.click();
  await expect(complexContent).toBeVisible();
  await expect(complexContent.getByRole('button', { name: 'Complex Multiply' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  await expect(palette.getByTestId('shader-node-category-content-complex')).toBeVisible();

  await palette.getByTestId('shader-node-category-toggle-complex').click();
  await expect(palette.getByTestId('shader-node-category-content-complex')).toBeHidden();

  await palette.getByLabel('Search shader nodes').fill('complexmultiply');
  await expect(palette.getByTestId('shader-node-category-content-complex')).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Complex Multiply' })).toBeVisible();

  await palette.getByLabel('Search shader nodes').fill('');
  await expect(palette.getByTestId('shader-node-category-content-complex')).toBeHidden();

  await palette.getByLabel('Search shader nodes').fill('not-a-real-node');
  await expect(palette.getByText('No shader nodes match this search.')).toBeVisible();
});

test('shader graph composition nodes support beginner effect flows', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  const palette = page.getByTestId('shader-node-palette');
  await palette.getByLabel('Search shader nodes').fill('mask');
  await expect(palette.getByRole('button', { name: 'Alpha Mask' })).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Luma Mask' })).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Mask Range' })).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Mask Combine' })).toBeVisible();

  await palette.getByLabel('Search shader nodes').fill('gradient');
  await expect(palette.getByRole('button', { name: 'Gradient Map' })).toBeVisible();

  await palette.getByLabel('Search shader nodes').fill('blend');
  await expect(palette.getByRole('button', { name: 'Blend Modes' })).toBeVisible();

  const nodesBeforeInsert = await page.locator('.react-flow__node').count();
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 320, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('blend modes');
  await page.getByTestId('shader-node-picker').getByRole('button', { name: /^blend modes composite$/i }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 1);

  const compositionGraph = {
    type: 'feather.shader-graph',
    version: 2,
    exportedAt: new Date('2026-05-28T00:00:00.000Z').toISOString(),
    shaderName: 'composition-basics-flow',
    playgroundTarget: null,
    nodes: [
      { id: 'texture', type: 'shaderNode', position: { x: 0, y: 0 }, data: { label: 'Sprite Texture', nodeType: 'TextureColor' } },
      { id: 'luma', type: 'shaderNode', position: { x: 280, y: 0 }, data: { label: 'Brightness Mask', nodeType: 'LumaMask' } },
      { id: 'gradient', type: 'shaderNode', position: { x: 560, y: 0 }, data: { label: 'Mapped Color', nodeType: 'GradientMap' } },
      { id: 'mix', type: 'shaderNode', position: { x: 840, y: 0 }, data: { label: 'Mix Into Sprite', nodeType: 'EffectMix' } },
      { id: 'out', type: 'shaderNode', position: { x: 1120, y: 0 }, data: { label: 'Final Color', nodeType: 'FragmentOutput' } },
    ],
    edges: [
      { id: 'texture:out->luma:color', source: 'texture', sourceHandle: 'out', target: 'luma', targetHandle: 'color' },
      { id: 'luma:mask->gradient:value', source: 'luma', sourceHandle: 'mask', target: 'gradient', targetHandle: 'value' },
      { id: 'texture:out->mix:base', source: 'texture', sourceHandle: 'out', target: 'mix', targetHandle: 'base' },
      { id: 'gradient:rgba->mix:effect', source: 'gradient', sourceHandle: 'rgba', target: 'mix', targetHandle: 'effect' },
      { id: 'luma:mask->mix:mask', source: 'luma', sourceHandle: 'mask', target: 'mix', targetHandle: 'mask' },
      { id: 'mix:out->out:color', source: 'mix', sourceHandle: 'out', target: 'out', targetHandle: 'color' },
    ],
    subgraphs: [],
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'composition-basics-flow.feathershgh',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(compositionGraph)),
  });

  await expect(page.getByTestId('shader-diagnostics')).toHaveCount(0);
  await expect(page.getByText(/float v_luma_mask = mix/i)).toBeVisible();
  await expect(page.getByText(/vec4 v_gradient_rgba/i)).toBeVisible();
  await expect(page.getByText(/vec4 v_mix_out/i)).toBeVisible();
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

test('shader graph preview probes inspect inline rgba flow', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  const graph = {
    type: 'feather.shader-graph',
    version: 2,
    exportedAt: new Date('2026-05-27T00:00:00.000Z').toISOString(),
    shaderName: 'preview-probe-flow',
    playgroundTarget: null,
    nodes: [
      { id: 'tex', type: 'shaderNode', position: { x: 0, y: 0 }, data: { label: 'Base Texture', nodeType: 'TextureColor' } },
      { id: 'probe-a', type: 'shaderNode', position: { x: 260, y: 0 }, data: { label: 'Before Invert', nodeType: 'Preview' } },
      { id: 'amount', type: 'shaderNode', position: { x: 260, y: 170 }, data: { label: 'Invert Amount', nodeType: 'FloatConstant', values: { val: 1 } } },
      { id: 'invert', type: 'shaderNode', position: { x: 520, y: 0 }, data: { label: 'Invert Pass', nodeType: 'InvertColor' } },
      { id: 'probe-b', type: 'shaderNode', position: { x: 790, y: 0 }, data: { label: 'After Invert', nodeType: 'Preview' } },
      { id: 'out', type: 'shaderNode', position: { x: 1060, y: 0 }, data: { label: 'Final Color', nodeType: 'FragmentOutput' } },
      { id: 'probe-loose', type: 'shaderNode', position: { x: 520, y: 250 }, data: { label: 'Loose Preview', nodeType: 'Preview' } },
    ],
    edges: [
      { id: 'tex:out->probe-a:color', source: 'tex', sourceHandle: 'out', target: 'probe-a', targetHandle: 'color' },
      { id: 'probe-a:out->invert:color', source: 'probe-a', sourceHandle: 'out', target: 'invert', targetHandle: 'color' },
      { id: 'amount:out->invert:amount', source: 'amount', sourceHandle: 'out', target: 'invert', targetHandle: 'amount' },
      { id: 'invert:out->probe-b:color', source: 'invert', sourceHandle: 'out', target: 'probe-b', targetHandle: 'color' },
      { id: 'probe-b:out->out:color', source: 'probe-b', sourceHandle: 'out', target: 'out', targetHandle: 'color' },
    ],
    subgraphs: [],
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'preview-probe-flow.feathershgh',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(graph)),
  });

  await expect(page.getByText(/vec4 v_probe_a_out/i)).toBeVisible();
  const beforeProbe = page.locator('.react-flow__node').filter({ hasText: 'Before Invert' });
  const afterProbe = page.locator('.react-flow__node').filter({ hasText: 'After Invert' });
  const looseProbe = page.locator('.react-flow__node').filter({ hasText: 'Loose Preview' });

  await expect(beforeProbe.getByTestId('shader-preview-probe')).toBeVisible();
  await expect(beforeProbe.getByTestId('shader-preview-probe').getByText(/select or pin this probe/i)).toBeVisible();
  await expect(beforeProbe.locator('iframe[title="Before Invert love.js preview"]')).toHaveCount(0);

  await beforeProbe.click();
  const beforePreviewFrame = beforeProbe.locator('iframe[title="Before Invert love.js preview"]');
  await expect(beforeProbe.frameLocator('iframe[title="Before Invert love.js preview"]').locator('canvas')).toBeVisible();
  const beforePreviewFrameBox = await beforePreviewFrame.boundingBox();
  expect(beforePreviewFrameBox).not.toBeNull();
  expect(Math.abs(beforePreviewFrameBox!.width / beforePreviewFrameBox!.height - 18 / 11)).toBeLessThan(0.08);
  await expect(beforeProbe.getByText('100%')).toBeVisible();
  await beforeProbe.getByTitle('Zoom preview in').click();
  await expect(beforeProbe.getByText('125%')).toBeVisible();
  await beforeProbe.getByTitle('Zoom preview out').click();
  await expect(beforeProbe.getByText('100%')).toBeVisible();
  await expect(beforeProbe.getByTitle('Connect a LÖVE session to preview in game')).toBeDisabled();
  await beforeProbe.getByTitle('Pin this preview open').click();

  await expect(afterProbe.getByTestId('shader-preview-probe')).toBeVisible();
  await expect(afterProbe.getByTestId('shader-preview-probe').getByText(/select or pin this probe/i)).toBeVisible();

  await afterProbe.click();
  await expect(beforeProbe.frameLocator('iframe[title="Before Invert love.js preview"]').locator('canvas')).toBeVisible();
  await expect(afterProbe.frameLocator('iframe[title="After Invert love.js preview"]').locator('canvas')).toBeVisible();
  await beforeProbe.getByTitle('Unpin this preview').click();

  await looseProbe.click();
  await expect(beforeProbe.locator('iframe[title="Before Invert love.js preview"]')).toHaveCount(0);
  await expect(afterProbe.locator('iframe[title="After Invert love.js preview"]')).toHaveCount(0);
  await expect(looseProbe.getByTestId('shader-preview-probe').getByText(/connect an rgba input/i)).toBeVisible();
  await expect(looseProbe.locator('iframe[title="Loose Preview love.js preview"]')).toHaveCount(0);
});
