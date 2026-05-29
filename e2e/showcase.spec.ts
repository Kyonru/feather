import { expect, test, type Locator, type Page } from '@playwright/test';

async function openShaderOutput(page: Page) {
  await page.getByRole('tab', { name: 'Output' }).click();
}

async function openShaderControls(page: Page) {
  await page.getByRole('tab', { name: 'Controls' }).click();
}

async function dragLocatorBy(page: Page, locator: Locator, dx: number, dy = 0) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, { steps: 6 });
  await page.mouse.up();
}

async function dragLocatorToX(page: Page, locator: Locator, x: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, box!.y + box!.height / 2, { steps: 6 });
  await page.mouse.up();
}

async function dragPaletteNodeToCanvas(page: Page, nodeName: string, position: { x: number; y: number }) {
  const source = page.getByTestId('shader-node-palette').getByRole('button', { name: nodeName }).first();
  const target = page.getByTestId('shader-canvas');
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + position.x, targetBox!.y + position.y, { steps: 8 });
  await page.mouse.up();
}

test('standalone showcase loads the landing page and tools', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /complete developer toolkit/i })).toBeVisible();

  await page
    .locator('header')
    .getByRole('button', { name: /^shader graph$/i })
    .click();
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  await expect(page.getByTestId('shader-controls-panel')).toBeVisible();
  await openShaderOutput(page);
  await expect(page.getByText('GLSL Output')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Shader Preview"]').locator('canvas')).toBeVisible();

  const nodesBeforeInsert = await page.locator('.react-flow__node').count();
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 300, y: 220 } });
  await expect(page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes')).toBeVisible();
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('time');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^time input$/i })
    .click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 1);
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 420, y: 220 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('float');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^float input$/i })
    .click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 2);
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 260, y: 320 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('float parameter');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^float parameter input$/i })
    .click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 3);
  await expect(page.getByText(/extern number u_param_/i)).toBeVisible();
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 380, y: 320 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('color parameter');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^color parameter input$/i })
    .click();
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
  await page
    .getByRole('button', { name: /unlink linked node/i })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /unlink linked node/i })).toHaveCount(1);

  const nodesBeforePreset = await page.locator('.react-flow__node').count();
  await page.getByText('Insert preset').click();
  await page.getByRole('option', { name: /texture pass/i }).click();
  await expect.poll(() => page.locator('.react-flow__node').count()).toBeGreaterThan(nodesBeforePreset);

  await page
    .locator('header')
    .getByRole('button', { name: /particle playground/i })
    .click();
  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Emitter Properties' })).toBeVisible();
  await expect(page.getByText('Rate', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Emit$/ })).toHaveCount(0);
  await expect(page.getByTestId('love-js-preview-floating')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Particle Preview"]').locator('canvas')).toBeVisible();
  const particlePreviewFrame = await page.getByTestId('love-js-preview-frame').boundingBox();
  expect(particlePreviewFrame).not.toBeNull();
  expect(Math.abs(particlePreviewFrame!.width / particlePreviewFrame!.height - 16 / 9)).toBeLessThan(0.04);
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

test('particle playground timeline edits clips and keyframes in the showcase', async ({ page }) => {
  await page.goto('/particle-system-playground');
  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Emitter' }).click();
  await expect(page.getByTestId('particle-emitter-row-2')).toBeVisible();
  await page.getByTestId('particle-emitter-row-1').click();
  await page.getByText('Emitter Lifetime').locator('..').getByRole('spinbutton').fill('0.8');
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('particle-timeline-panel')).toBeVisible();
  await expect(page.getByTestId('particle-timeline-track-1')).toBeVisible();
  await expect(page.getByTestId('particle-timeline-track-2')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Particle Preview"]').locator('canvas')).toBeVisible();
  await page.getByTitle('Minimise').click();

  const mainWidth = await page
    .getByTestId('particle-playground-main')
    .evaluate((element) => element.getBoundingClientRect().width);
  const panelWidth = await page
    .getByTestId('particle-timeline-panel')
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(panelWidth).toBeGreaterThan(mainWidth * 0.85);

  const timelineScroll = page.getByTestId('particle-timeline-scroll');
  const defaultOverflow = await timelineScroll.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(defaultOverflow).toBeLessThanOrEqual(2);

  const smoothPlayhead = page.getByTestId('particle-timeline-playhead');
  await page.getByTitle('Play timeline').click();
  await expect.poll(async () => Number(await smoothPlayhead.inputValue()), { timeout: 1500 }).toBeGreaterThan(0.05);
  const animatedTime = Number(await smoothPlayhead.inputValue());
  expect(animatedTime).toBeLessThan(1);
  await page.getByTitle('Pause timeline').click();
  await page.getByTitle('Reset playhead').click();

  await page.getByTestId('particle-timeline-track-1').click();
  await expect(page.getByRole('button', { name: 'Select Emitter' })).toBeVisible();

  const clipBox = await page.getByTestId('particle-timeline-clip-1').first().boundingBox();
  const trackStripBox = await page.getByTestId('particle-timeline-track-strip-1').boundingBox();
  expect(clipBox).not.toBeNull();
  expect(trackStripBox).not.toBeNull();
  expect(clipBox!.x).toBeGreaterThanOrEqual(trackStripBox!.x - 1);
  expect(clipBox!.x + clipBox!.width).toBeLessThanOrEqual(trackStripBox!.x + trackStripBox!.width + 1);

  await dragLocatorToX(
    page,
    page.getByTestId('particle-timeline-clip-end-handle-1').first(),
    trackStripBox!.x + trackStripBox!.width * 0.8,
  );
  await expect(page.getByLabel('Stop at').first()).toHaveValue('2.4');

  await page.getByRole('button', { name: 'Zoom In' }).click();
  await page.getByRole('button', { name: 'Zoom In' }).click();
  const zoomedOverflow = await timelineScroll.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(zoomedOverflow).toBeGreaterThan(20);
  await expect(page.getByText('150%')).toBeVisible();

  const zoomedTrackStripBoxForDrag = await page.getByTestId('particle-timeline-track-strip-1').boundingBox();
  expect(zoomedTrackStripBoxForDrag).not.toBeNull();
  await dragLocatorBy(
    page,
    page.getByTestId('particle-timeline-clip-1').first(),
    zoomedTrackStripBoxForDrag!.width * (0.2 / 3),
  );
  await expect(page.getByLabel('Emit at').first()).toHaveValue('0.2');
  await expect(page.getByLabel('Stop at').first()).toHaveValue('2.6');

  const emissionWindow = page.getByTestId('particle-timeline-emission-window-1').first();
  await expect(emissionWindow).toBeVisible();
  const resizedClipBox = await page.getByTestId('particle-timeline-clip-1').first().boundingBox();
  const emissionBox = await emissionWindow.boundingBox();
  expect(resizedClipBox).not.toBeNull();
  expect(emissionBox).not.toBeNull();
  expect(emissionBox!.width).toBeLessThan(resizedClipBox!.width * 0.6);
  await expect(page.getByTestId('particle-timeline-emission-window-2')).toHaveCount(0);
  const tail = page.getByTestId('particle-timeline-tail-1').first();
  await expect(tail).toBeVisible();
  const tailBox = await tail.boundingBox();
  const zoomedTrackStripBox = await page.getByTestId('particle-timeline-track-strip-1').boundingBox();
  expect(tailBox).not.toBeNull();
  expect(zoomedTrackStripBox).not.toBeNull();
  expect(tailBox!.x).toBeGreaterThanOrEqual(zoomedTrackStripBox!.x - 1);
  expect(tailBox!.x + tailBox!.width).toBeLessThanOrEqual(zoomedTrackStripBox!.x + zoomedTrackStripBox!.width + 1);

  await page.getByRole('button', { name: /duplicate clip/i }).click();
  await expect(page.getByTestId('particle-timeline-clip-1')).toHaveCount(2);
  await page.getByRole('button', { name: /delete clip/i }).click();
  await expect(page.getByTestId('particle-timeline-clip-1')).toHaveCount(1);

  const playhead = page.getByTestId('particle-timeline-playhead');
  await playhead.fill('1.2');
  await playhead.dispatchEvent('change');
  await expect(page.getByText(/1\.20s \/ 3\.00s/)).toBeVisible();

  await page.getByText('Opacity').click();
  await page.getByRole('button', { name: /add key at playhead/i }).click();
  await page.getByLabel('Opacity key value').first().fill('0.55');
  const curveSelect = page.getByTestId('particle-timeline-inspector').getByLabel('Opacity key curve');
  await curveSelect.click();
  await page.getByRole('option', { name: 'Out Quad', exact: true }).click();
  await expect(curveSelect).toContainText('Out Quad');
  const opacityCurve = page.getByTestId('particle-timeline-curve-opacity-1');
  await expect(opacityCurve).toBeVisible();
  await expect(opacityCurve.locator('path')).toHaveAttribute('d', /L/);
  const createdKey = page.locator('[title="Opacity 1.20s = 0.55"]').first();
  await expect(createdKey).toBeVisible();
  await page.getByTestId('particle-timeline-keyframe-opacity-1').last().click();
  await expect(page.getByTestId('particle-timeline-inspector').getByLabel('Opacity key curve')).toBeDisabled();
  await createdKey.click();
  await dragLocatorBy(page, createdKey, zoomedTrackStripBox!.width * (0.4 / 3));
  await expect(page.getByLabel('Opacity key time').first()).toHaveValue('1.6');

  await expect(page.getByTestId('particle-timeline-lane-opacity-1').getByText('4 keys')).toBeVisible();
  await page.getByTestId('particle-timeline-inspector').click({ position: { x: 8, y: 8 } });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('particle-timeline-lane-opacity-1').getByText('3 keys')).toBeVisible();

  await page.getByTestId('particle-emitter-row-1').dragTo(page.getByTestId('particle-emitter-row-2'));
  await page.getByTestId('particle-timeline-track-2').click();
  await expect(page.getByLabel('Stop at').first()).toHaveValue('2.6');
  await page.getByTestId('particle-timeline-track-1').click();
  await expect(page.getByLabel('Stop at').first()).toHaveValue('3');

  await page.getByTitle('Play timeline').click();
  await expect(page.getByTitle('Pause timeline')).toBeVisible();
  await page.getByTitle('Pause timeline').click();
  await page.getByTitle('Reset playhead').click();

  await page.getByRole('button', { name: /snap on/i }).click();
  await expect(page.getByRole('button', { name: /snap off/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByText('150%')).toBeVisible();
  await expect(page.getByRole('button', { name: /snap off/i })).toBeVisible();
});

test('particle playground creates the complex composite timeline template in the showcase', async ({ page }) => {
  await page.goto('/particle-system-playground');
  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();

  await page.getByTitle('New composite').click();
  const dialog = page.getByRole('dialog', { name: 'New Composite' });
  await dialog.getByPlaceholder('Explosion').fill('Complex Demo');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Complex Composite' }).click();
  await dialog.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByTestId('particle-emitter-row-5')).toBeVisible();
  await expect(page.getByText('Spark Trails')).toBeVisible();
  await expect(page.getByText('Dust Wake')).toBeVisible();

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('particle-timeline-track-5')).toBeVisible();
  await expect(page.getByTestId('particle-timeline-track-4').getByText('Spark Trails')).toBeVisible();
  await expect(page.getByTestId('particle-timeline-track-5').getByText('Dust Wake')).toBeVisible();
  await page.getByTestId('particle-timeline-track-5').click();
  await expect(page.getByLabel('Emit at').first()).toHaveValue('0.28');
  await expect(page.getByLabel('Burst particles').first()).toHaveValue('100');
});

test('shader graph right panel exposes root shader controls', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 260, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('float parameter');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^float parameter input$/i })
    .click();

  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 420, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('color parameter');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^color parameter input$/i })
    .click();

  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 580, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('texture parameter');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^texture parameter input$/i })
    .click();

  const controls = page.getByTestId('shader-controls-panel');
  await expect(controls).toBeVisible();
  await expect(controls.getByText('float', { exact: true })).toBeVisible();
  await expect(controls.getByText('color', { exact: true })).toBeVisible();
  await expect(controls.getByText('texture', { exact: true })).toBeVisible();
  await expect(controls.getByText('Not connected').first()).toBeVisible();

  await controls.getByLabel('Float Parameter label').fill('Strength');
  await controls.getByLabel('Strength value').fill('0.42');
  await controls.getByLabel('Color Parameter label').fill('Tint');
  await controls.getByLabel('Tint alpha').fill('0.75');

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('feather-shader-graph') || '{}')?.state;
        const strength = state?.nodes?.find((node: { data?: { label?: string } }) => node.data?.label === 'Strength');
        const tint = state?.nodes?.find((node: { data?: { label?: string } }) => node.data?.label === 'Tint');
        return {
          strength: strength?.data?.values?.val,
          tintAlpha: tint?.data?.values?.val?.[3],
        };
      });
    })
    .toEqual({ strength: 0.42, tintAlpha: 0.75 });

  await controls.getByTitle('Select parameter node').first().click();
  await expect(page.getByTestId('shader-right-panel-selection')).toBeVisible();
  await expect(page.locator('input[value="Strength"]')).toBeVisible();

  await page.getByText('Insert preset').click();
  await page.getByRole('option', { name: /^outline$/i }).click();
  await openShaderControls(page);
  await expect(page.getByTestId('shader-template-controls')).toBeVisible();
  await page.getByTestId('shader-template-controls').getByTitle('Select boundary node').first().click();
  await expect(page.getByRole('button', { name: 'Back to parent graph' })).toBeEnabled();
  await openShaderControls(page);
  await expect(controls.getByText(/root graph controls/i)).toBeVisible();
  await controls.getByTitle('Select parameter node').first().click();
  await expect(page.getByRole('button', { name: 'Back to parent graph' })).toBeDisabled();
  await expect(page.locator('input[value="Strength"]')).toBeVisible();
});

test('shader graph node palette sections collapse and search hidden matches', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  const palette = page.getByTestId('shader-node-palette');
  const inputContent = palette.getByTestId('shader-node-category-content-input');
  const complexToggle = palette.getByTestId('shader-node-category-toggle-complex');
  const complexContent = palette.getByTestId('shader-node-category-content-complex');

  await expect(inputContent).toBeVisible();
  await expect(inputContent.getByRole('button', { name: 'Texture Color' })).toBeVisible();
  const nodesBeforeDrag = await page.locator('.react-flow__node').count();
  await dragPaletteNodeToCanvas(page, 'Texture Color', { x: 360, y: 220 });
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeDrag + 1);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Texture Color' }).first()).toBeVisible();
  const canvasBoxAfterDrag = await page.getByTestId('shader-canvas').boundingBox();
  expect(canvasBoxAfterDrag).not.toBeNull();
  expect(canvasBoxAfterDrag!.width).toBeGreaterThan(300);
  expect(canvasBoxAfterDrag!.height).toBeGreaterThan(300);
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
  await expect(palette.getByRole('button', { name: 'Color Key Mask' })).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Mask Combine' })).toBeVisible();

  await palette.getByLabel('Search shader nodes').fill('gradient');
  await expect(palette.getByRole('button', { name: 'Gradient Map' })).toBeVisible();

  await palette.getByLabel('Search shader nodes').fill('blend');
  await expect(palette.getByRole('button', { name: 'Blend Modes' })).toBeVisible();

  const nodesBeforeInsert = await page.locator('.react-flow__node').count();
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 320, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('blend modes');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^blend modes composite$/i })
    .click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 1);

  const compositionGraph = {
    type: 'feather.shader-graph',
    version: 2,
    exportedAt: new Date('2026-05-28T00:00:00.000Z').toISOString(),
    shaderName: 'composition-basics-flow',
    playgroundTarget: null,
    nodes: [
      {
        id: 'texture',
        type: 'shaderNode',
        position: { x: 0, y: 0 },
        data: { label: 'Sprite Texture', nodeType: 'TextureColor' },
      },
      {
        id: 'luma',
        type: 'shaderNode',
        position: { x: 280, y: 0 },
        data: { label: 'Brightness Mask', nodeType: 'LumaMask' },
      },
      {
        id: 'gradient',
        type: 'shaderNode',
        position: { x: 560, y: 0 },
        data: { label: 'Mapped Color', nodeType: 'GradientMap' },
      },
      {
        id: 'key',
        type: 'shaderNode',
        position: { x: 560, y: 220 },
        data: { label: 'Red Key Mask', nodeType: 'ColorKeyMask', values: { targetColor: [1, 0, 0, 1], tolerance: 0.18, softness: 0.04 } },
      },
      {
        id: 'mix',
        type: 'shaderNode',
        position: { x: 840, y: 0 },
        data: { label: 'Mix Into Sprite', nodeType: 'EffectMix' },
      },
      {
        id: 'out',
        type: 'shaderNode',
        position: { x: 1120, y: 0 },
        data: { label: 'Final Color', nodeType: 'FragmentOutput' },
      },
    ],
    edges: [
      { id: 'texture:out->luma:color', source: 'texture', sourceHandle: 'out', target: 'luma', targetHandle: 'color' },
      {
        id: 'luma:mask->gradient:value',
        source: 'luma',
        sourceHandle: 'mask',
        target: 'gradient',
        targetHandle: 'value',
      },
      { id: 'texture:out->mix:base', source: 'texture', sourceHandle: 'out', target: 'mix', targetHandle: 'base' },
      { id: 'texture:out->key:source', source: 'texture', sourceHandle: 'out', target: 'key', targetHandle: 'source' },
      {
        id: 'gradient:rgba->mix:effect',
        source: 'gradient',
        sourceHandle: 'rgba',
        target: 'mix',
        targetHandle: 'effect',
      },
      { id: 'key:mask->mix:mask', source: 'key', sourceHandle: 'mask', target: 'mix', targetHandle: 'mask' },
      { id: 'mix:out->out:color', source: 'mix', sourceHandle: 'out', target: 'out', targetHandle: 'color' },
    ],
    subgraphs: [],
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'composition-basics-flow.feathershgh',
    mimeType: 'application/json',
    // @ts-expect-error buffer time
    buffer: Buffer.from(JSON.stringify(compositionGraph)),
  });

  await openShaderOutput(page);
  await expect(page.getByTestId('shader-diagnostics')).toHaveCount(0);
  await expect(page.getByText(/float v_luma_mask = mix/i)).toBeVisible();
  await expect(page.getByText(/float v_key_mask = mix/i)).toBeVisible();
  await expect(page.getByText(/vec4 v_gradient_rgba/i)).toBeVisible();
  await expect(page.getByText(/vec4 v_mix_out/i)).toBeVisible();
});

test('shader graph presets load as template subgraphs with public controls', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());

  await page.getByRole('combobox', { name: 'Load preset' }).click();
  await page.getByRole('option', { name: /^outline$/i }).click();

  const templateControls = page.getByTestId('shader-template-controls');
  await expect(templateControls).toBeVisible();
  await expect(templateControls.getByText('Outline', { exact: true })).toBeVisible();
  await expect(templateControls.getByText('Thickness')).toBeVisible();
  await expect(templateControls.getByText('Outline Color', { exact: true })).toBeVisible();

  await expect(page.locator('.react-flow__node').filter({ hasText: 'Outline' })).toHaveCount(1);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Fragment Output' })).toHaveCount(1);

  await templateControls.getByRole('spinbutton').first().fill('7');
  await openShaderOutput(page);
  await expect(page.getByText(/,\s*7\.0,\s*vec4/i)).toBeVisible();
  await openShaderControls(page);

  await page.locator('.react-flow__node').filter({ hasText: 'Outline' }).dblclick();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Source Color' })).toBeVisible();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Thickness' })).toBeVisible();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'RGBA Output' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Load preset' }).click();
  await page.getByRole('option', { name: /^texture noise water$/i }).click();
  await openShaderControls(page);
  await expect(templateControls.getByText('Noise Texture')).toBeVisible();
  await expect(templateControls.getByText('No texture uploaded')).toBeVisible();
});

test('shader graph fake 3d nodes support sprite illusion flows', async ({ page }) => {
  await page.goto('/shader-graph');
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  const palette = page.getByTestId('shader-node-palette');
  await palette.getByLabel('Search shader nodes').fill('billboard');
  await expect(palette.getByRole('button', { name: 'Billboard UV' })).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Billboard Shadow' })).toBeVisible();

  await palette.getByLabel('Search shader nodes').fill('parallax');
  await expect(palette.getByRole('button', { name: 'Parallax UV' })).toBeVisible();

  await palette.getByLabel('Search shader nodes').fill('stack');
  await expect(palette.getByRole('button', { name: 'Stacked Sprite Sample' })).toBeVisible();

  const nodesBeforeInsert = await page.locator('.react-flow__node').count();
  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 320, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('billboard uv');
  await page
    .getByTestId('shader-node-picker')
    .getByRole('button', { name: /^billboard uv fake 3d$/i })
    .click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBeforeInsert + 1);

  const fake3dGraph = {
    type: 'feather.shader-graph',
    version: 2,
    exportedAt: new Date('2026-05-28T00:00:00.000Z').toISOString(),
    shaderName: 'fake-3d-billboard-flow',
    playgroundTarget: null,
    nodes: [
      {
        id: 'uv',
        type: 'shaderNode',
        position: { x: 0, y: 0 },
        data: { label: 'Source UVs', nodeType: 'TextureCoords' },
      },
      {
        id: 'billboard',
        type: 'shaderNode',
        position: { x: 280, y: 0 },
        data: {
          label: 'Tilt Sprite',
          nodeType: 'BillboardUV',
          values: { tilt: [0.28, -0.18], perspective: 0.45, scale: [0.92, 0.92], pivot: [0.5, 0.5] },
        },
      },
      {
        id: 'sample',
        type: 'shaderNode',
        position: { x: 560, y: 0 },
        data: { label: 'Sample Tilted Sprite', nodeType: 'SpriteTextureSample' },
      },
      {
        id: 'shade',
        type: 'shaderNode',
        position: { x: 840, y: 0 },
        data: {
          label: 'Light Tilt',
          nodeType: 'FakeDepthShade',
          values: { lightDir: [-0.45, -0.7], ambient: 0.82, lightStrength: 0.35, rimStrength: 0.2 },
        },
      },
      {
        id: 'shadow',
        type: 'shaderNode',
        position: { x: 560, y: 260 },
        data: {
          label: 'Card Shadow',
          nodeType: 'BillboardShadow',
          values: { offset: [0.06, 0.08], softness: 0.16, opacity: 0.36, color: [0, 0, 0, 1] },
        },
      },
      {
        id: 'composite',
        type: 'shaderNode',
        position: { x: 1120, y: 130 },
        data: { label: 'Composite Shadow', nodeType: 'CompositeAlpha', values: { mode: 0 } },
      },
      {
        id: 'out',
        type: 'shaderNode',
        position: { x: 1400, y: 150 },
        data: { label: 'Final Color', nodeType: 'FragmentOutput' },
      },
    ],
    edges: [
      { id: 'uv:out->billboard:uv', source: 'uv', sourceHandle: 'out', target: 'billboard', targetHandle: 'uv' },
      { id: 'billboard:uv->sample:uv', source: 'billboard', sourceHandle: 'uv', target: 'sample', targetHandle: 'uv' },
      {
        id: 'billboard:mask->sample:mask',
        source: 'billboard',
        sourceHandle: 'mask',
        target: 'sample',
        targetHandle: 'mask',
      },
      {
        id: 'sample:rgba->shade:color',
        source: 'sample',
        sourceHandle: 'rgba',
        target: 'shade',
        targetHandle: 'color',
      },
      {
        id: 'billboard:depth->shade:depth',
        source: 'billboard',
        sourceHandle: 'depth',
        target: 'shade',
        targetHandle: 'depth',
      },
      {
        id: 'billboard:mask->shade:mask',
        source: 'billboard',
        sourceHandle: 'mask',
        target: 'shade',
        targetHandle: 'mask',
      },
      { id: 'uv:out->shadow:uv', source: 'uv', sourceHandle: 'out', target: 'shadow', targetHandle: 'uv' },
      {
        id: 'billboard:mask->shadow:mask',
        source: 'billboard',
        sourceHandle: 'mask',
        target: 'shadow',
        targetHandle: 'mask',
      },
      {
        id: 'billboard:depth->shadow:depth',
        source: 'billboard',
        sourceHandle: 'depth',
        target: 'shadow',
        targetHandle: 'depth',
      },
      { id: 'shade:rgba->composite:a', source: 'shade', sourceHandle: 'rgba', target: 'composite', targetHandle: 'a' },
      {
        id: 'shadow:rgba->composite:b',
        source: 'shadow',
        sourceHandle: 'rgba',
        target: 'composite',
        targetHandle: 'b',
      },
      {
        id: 'composite:out->out:color',
        source: 'composite',
        sourceHandle: 'out',
        target: 'out',
        targetHandle: 'color',
      },
    ],
    subgraphs: [],
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'fake-3d-billboard-flow.feathershgh',
    mimeType: 'application/json',
    // @ts-expect-error buffer time
    buffer: Buffer.from(JSON.stringify(fake3dGraph)),
  });

  await openShaderOutput(page);
  await expect(page.getByTestId('shader-diagnostics')).toHaveCount(0);
  await expect(page.getByText(/vec2 v_billboard_uv =/i)).toBeVisible();
  await expect(page.getByText(/vec4 v_sample_rgba = Texel\(tex/i)).toBeVisible();
  await expect(page.getByText(/vec4 v_shade_rgba =/i)).toBeVisible();
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
    // @ts-expect-error buffer time
    buffer: Buffer.from(JSON.stringify(brokenGraph)),
  });

  await openShaderOutput(page);
  const diagnostics = page.getByTestId('shader-diagnostics');
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.getByText(/Upload a texture for Missing Noise Texture/i)).toBeVisible();
  await expect(diagnostics.getByText(/Remove stale connection/i)).toBeVisible();
  await expect(diagnostics.getByText(/Fix Broken Function/i)).toBeVisible();
  await expect(diagnostics.getByText(/cyclic subgraph reference/i)).toBeVisible();

  await diagnostics.getByRole('button', { name: /Upload a texture for Missing Noise Texture/i }).click();
  await page.getByRole('tab', { name: 'Selection' }).click();
  await expect(page.getByText('Texture File')).toBeVisible();
  await expect(page.getByText('Fallback texture until a file is loaded')).toBeVisible();
  await openShaderOutput(page);
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
      {
        id: 'tex',
        type: 'shaderNode',
        position: { x: 0, y: 0 },
        data: { label: 'Base Texture', nodeType: 'TextureColor' },
      },
      {
        id: 'probe-a',
        type: 'shaderNode',
        position: { x: 260, y: 0 },
        data: { label: 'Before Invert', nodeType: 'Preview' },
      },
      {
        id: 'amount',
        type: 'shaderNode',
        position: { x: 260, y: 170 },
        data: { label: 'Invert Amount', nodeType: 'FloatConstant', values: { val: 1 } },
      },
      {
        id: 'invert',
        type: 'shaderNode',
        position: { x: 520, y: 0 },
        data: { label: 'Invert Pass', nodeType: 'InvertColor' },
      },
      {
        id: 'probe-b',
        type: 'shaderNode',
        position: { x: 790, y: 0 },
        data: { label: 'After Invert', nodeType: 'Preview' },
      },
      {
        id: 'out',
        type: 'shaderNode',
        position: { x: 1060, y: 0 },
        data: { label: 'Final Color', nodeType: 'FragmentOutput' },
      },
      {
        id: 'probe-loose',
        type: 'shaderNode',
        position: { x: 520, y: 250 },
        data: { label: 'Loose Preview', nodeType: 'Preview' },
      },
    ],
    edges: [
      { id: 'tex:out->probe-a:color', source: 'tex', sourceHandle: 'out', target: 'probe-a', targetHandle: 'color' },
      {
        id: 'probe-a:out->invert:color',
        source: 'probe-a',
        sourceHandle: 'out',
        target: 'invert',
        targetHandle: 'color',
      },
      {
        id: 'amount:out->invert:amount',
        source: 'amount',
        sourceHandle: 'out',
        target: 'invert',
        targetHandle: 'amount',
      },
      {
        id: 'invert:out->probe-b:color',
        source: 'invert',
        sourceHandle: 'out',
        target: 'probe-b',
        targetHandle: 'color',
      },
      { id: 'probe-b:out->out:color', source: 'probe-b', sourceHandle: 'out', target: 'out', targetHandle: 'color' },
    ],
    subgraphs: [],
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'preview-probe-flow.feathershgh',
    mimeType: 'application/json',
    // @ts-expect-error buffer time
    buffer: Buffer.from(JSON.stringify(graph)),
  });

  await openShaderOutput(page);
  await expect(page.getByText(/vec4 v_probe_a_out/i)).toBeVisible();
  const beforeProbe = page.locator('.react-flow__node').filter({ hasText: 'Before Invert' });
  const afterProbe = page.locator('.react-flow__node').filter({ hasText: 'After Invert' });
  const looseProbe = page.locator('.react-flow__node').filter({ hasText: 'Loose Preview' });

  await expect(beforeProbe.getByTestId('shader-preview-probe')).toBeVisible();
  await expect(beforeProbe.getByTestId('shader-preview-probe').getByText(/select or pin this probe/i)).toBeVisible();
  await expect(beforeProbe.locator('iframe[title="Before Invert love.js preview"]')).toHaveCount(0);

  await beforeProbe.click();
  const beforePreviewFrame = beforeProbe.locator('iframe[title="Before Invert love.js preview"]');
  await expect(
    beforeProbe.frameLocator('iframe[title="Before Invert love.js preview"]').locator('canvas'),
  ).toBeVisible();
  const beforePreviewFrameBox = await beforePreviewFrame.boundingBox();
  expect(beforePreviewFrameBox).not.toBeNull();
  expect(Math.abs(beforePreviewFrameBox!.width / beforePreviewFrameBox!.height - 16 / 9)).toBeLessThan(0.08);
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
  await expect(
    beforeProbe.frameLocator('iframe[title="Before Invert love.js preview"]').locator('canvas'),
  ).toBeVisible();
  await expect(afterProbe.frameLocator('iframe[title="After Invert love.js preview"]').locator('canvas')).toBeVisible();
  await beforeProbe.getByTitle('Unpin this preview').click();

  await looseProbe.getByText('Loose Preview', { exact: true }).click({ force: true });
  await expect(beforeProbe.locator('iframe[title="Before Invert love.js preview"]')).toHaveCount(0);
  await expect(afterProbe.locator('iframe[title="After Invert love.js preview"]')).toHaveCount(0);
  await expect(looseProbe.getByTestId('shader-preview-probe').getByText(/connect an rgba input/i)).toBeVisible();
  await expect(looseProbe.locator('iframe[title="Loose Preview love.js preview"]')).toHaveCount(0);
});
