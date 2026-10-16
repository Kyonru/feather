import { expect, test } from '@playwright/test';

/**
 * Feather Studio's shell.
 *
 * The tools themselves are covered by the Showcase suite, which renders the same
 * components. What is unique to Studio — and what these assert — is that it is a
 * *separate application*: it boots without an Inspector, treats the bridge as
 * optional, and never assumes a game is attached.
 *
 * These replaced four tests that asserted the Phase 05b placeholder — its
 * heading, its subtitle, its connect button. They passed for as long as Studio
 * rendered none of the tools it ships, which is exactly the failure mode V4.md
 * D43 describes: a test that asserts current behaviour locks in the thing you
 * are trying to change. They now assert the property instead — that each tool is
 * reachable and usable with nothing else running.
 */

const TOOLS = [
  { id: 'shader-graph', label: 'Shader Graph' },
  { id: 'particle-playground', label: 'Particles' },
  { id: 'texture-lab', label: 'Texture Lab' },
] as const;

/** Navigation overlays rather than occupying, so reaching a tool goes through it. */
async function chooseTool(page: import('@playwright/test').Page, id: string) {
  await page.getByTestId('studio-menu-trigger').click();
  await page.getByTestId(`studio-tool-${id}`).click();
  await expect(page.getByTestId('studio-menu')).toBeHidden();
}

test('Studio boots as a standalone application', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('studio-strip')).toBeVisible();
  await expect(page.getByTestId('studio-current-tool')).toBeVisible();

  await page.getByTestId('studio-menu-trigger').click();
  for (const tool of TOOLS) {
    await expect(page.getByTestId(`studio-tool-${tool.id}`)).toBeVisible();
  }
});

test('the menu overlays the work and closes after choosing', async ({ page }) => {
  // It is a menu rather than a rail because three tools do not justify taking
  // width from a node graph permanently. The cost of that is one extra click,
  // so it must not also cost a dismissal.
  await page.goto('/');
  await expect(page.getByTestId('studio-menu')).toHaveCount(0);

  await page.getByTestId('studio-menu-trigger').click();
  await expect(page.getByTestId('studio-menu')).toBeVisible();

  await page.getByTestId('studio-tool-texture-lab').click();
  await expect(page.getByTestId('studio-menu')).toBeHidden();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Texture Lab');
});

test('every tool is usable with no Inspector and no game', async ({ page }) => {
  // The whole point of Studio: local authoring is the default, not a degraded
  // mode. Particle Playground in particular used to report itself "not
  // available in this session" here, because it asked whether the session was
  // creative and Studio never creates one.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  const surface = page.getByTestId('studio-tool-surface');

  for (const tool of TOOLS) {
    await chooseTool(page, tool.id);
    await expect(surface).toBeVisible();
    await expect(surface).not.toContainText('not available in this session');
    await expect(surface).not.toContainText('No session');
    // Something substantial rendered, not just a frame.
    const text = await surface.innerText();
    expect(text.trim().length, `${tool.label} rendered almost nothing`).toBeGreaterThan(120);
  }

  expect(errors, `a tool threw:\n${errors.join('\n')}`).toEqual([]);
});

test('the tools are styled, not unstyled markup', async ({ page }) => {
  // The tools reference design tokens 394 times. Studio mounted no ThemeProvider
  // and registered no Tailwind colour utilities, so every one of them resolved
  // to nothing — the tools would have rendered as bare text had the shell ever
  // mounted them.
  await page.goto('/');

  // Two separate things, and it is worth keeping them apart: the `:root` block
  // in theme-tokens.css is a fallback so the first frame is not unstyled, while
  // ThemeProvider writes the *resolved* theme as an inline style on the root.
  // Only the inline value proves the provider is mounted — a computed value
  // would be satisfied by the fallback alone, which is how the first version of
  // this test passed with the provider removed.
  const inlineBackground = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--background').trim(),
  );
  expect(inlineBackground, 'ThemeProvider is not mounted').toMatch(/^#|rgb/);

  const cardColor = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'bg-card';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  });
  // An unregistered utility leaves the background transparent.
  expect(cardColor, 'bg-card is not a real utility').not.toBe('rgba(0, 0, 0, 0)');
});

test('the chosen tool survives a reload', async ({ page }) => {
  await page.goto('/');
  await chooseTool(page, 'texture-lab');
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Texture Lab');

  await page.reload();
  await expect(page.getByTestId('studio-current-tool')).toHaveText('Texture Lab');
});

test('named workspaces switch and survive a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace-name')).toHaveText('My workspace');

  await page.getByTestId('studio-workspace-trigger').click();
  await page.getByTestId('studio-workspace-new').click();
  await expect(page.getByTestId('studio-workspace-name')).toHaveText('Workspace 2');

  await page.getByTestId('studio-workspace-trigger').click();
  await page.getByTestId('studio-workspace-rename').click();
  await page.getByLabel('Workspace name').fill('Boss effect');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByTestId('studio-workspace-name')).toHaveText('Boss effect');

  // Mount every tool once so each tool materializes the active workspace under
  // the same application-owned id.
  for (const tool of TOOLS) await chooseTool(page, tool.id);

  const activeId = await page.evaluate(() => {
    const registry = JSON.parse(localStorage.getItem('feather-studio-workspaces') ?? '{}');
    return registry.state?.activeId as string | undefined;
  });
  expect(activeId).toBeTruthy();

  await expect.poll(() => page.evaluate((id) => {
    const shader = JSON.parse(localStorage.getItem('feather-shader-graph') ?? '{}');
    const texture = JSON.parse(localStorage.getItem('studio-preferences') ?? '{}');
    const particles = JSON.parse(localStorage.getItem('feather-local-particle-workspaces') ?? '{}');
    return {
      shader: shader.state?.activeWorkspaceId === id,
      texture: texture.state?.textureLabWorkspaceId === id,
      particles: Object.hasOwn(particles, String(id)),
    };
  }, activeId)).toEqual({ shader: true, texture: true, particles: true });

  await page.reload();
  await expect(page.getByTestId('studio-workspace-name')).toHaveText('Boss effect');
});

test('a successful Inspector pairing adds live preview and disconnecting keeps local work', async ({ page }) => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('requestfailed', (request) => browserErrors.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.route('**/bridge', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
      return;
    }
    const request = route.request().postDataJSON() as {
      id: string;
      method: string;
      params: Record<string, unknown>;
    };
    calls.push({ method: request.method, params: request.params });
    const result =
      request.method === 'handshake'
        ? {
            server: 'inspector',
            serverVersion: '4.0.0',
            bridgeVersion: 2,
            capability: 'test-capability',
            expiresAt: Date.now() + 60_000,
            grant: {
              pairingId: 'test-pairing',
              bridgeVersion: 2,
              methods: ['sessions.list', 'sessions.select', 'preview.send', 'preview.cancel', 'preferences.export', 'capability.release'],
              plugins: { 'shader-graph': ['preview-shader', 'clear-preview', 'compile-shader'] },
              sessionId: null,
              expiresAt: Date.now() + 60_000,
            },
          }
        : request.method === 'sessions.list'
          ? { sessions: [{ id: 'game-1', name: 'Demo game', connectedAt: Date.now() - 5_000 }], selectedSessionId: null }
          : request.method === 'sessions.select'
            ? { id: 'game-1', name: 'Demo game', connectedAt: Date.now() - 5_000 }
            : request.method === 'preferences.export'
              ? { version: 1 }
              : request.method === 'preview.send' || request.method === 'preview.cancel'
                ? { requestId: 'game-request-1' }
                : null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: request.id, bridgeVersion: 2, ok: true, result }),
    });
  });

  await page.goto('/');
  await page.getByTestId('studio-workspace-trigger').click();
  await page.getByTestId('studio-workspace-rename').click();
  await page.getByLabel('Workspace name').fill('Kept locally');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();

  await page.getByTestId('studio-menu-trigger').click();
  await page.getByRole('button', { name: /Connect Inspector/ }).click();
  await expect
    .poll(() => ({ methods: calls.map((call) => call.method), browserErrors }))
    .toEqual({ methods: expect.arrayContaining(['sessions.list']), browserErrors: [] });
  await expect(page.getByTestId('studio-inspector-status')).toContainText('Demo game');
  await expect(page.getByTestId('shader-graph-mode')).toContainText('Live preview');

  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Output' }).click();
  await page.getByRole('button', { name: 'Preview On' }).click();
  await expect.poll(() => calls.some((call) => call.method === 'preview.send')).toBe(true);
  await expect(page.getByTestId('shader-preview-freshness')).toHaveAttribute('data-state', 'current');

  await page.getByTestId('studio-menu-trigger').click();
  await page.getByRole('button', { name: /Disconnect Inspector/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('studio-inspector-status')).toContainText('Local only');
  await expect(page.getByTestId('studio-workspace-name')).toHaveText('Kept locally');
  await expect(page.getByTestId('studio-tool-surface')).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('no Inspector is a neutral fact, not an error', async ({ page }) => {
  await page.goto('/');

  // The strip says so without asking for anything: "Local only" is a state, not
  // a prompt. Connecting is offered in the menu, where a deliberate act belongs.
  await expect(page.getByTestId('studio-inspector-status')).toContainText('Local only');

  await page.getByTestId('studio-menu-trigger').click();
  const detail = page.getByTestId('studio-inspector-detail');
  await expect(detail).toContainText('Local only');
  await expect(detail.getByRole('button', { name: /Connect Inspector/ })).toBeVisible();
  await expect(detail).toContainText('Studio works as a local editor without it');
});

test('a failed Inspector connection leaves Studio working', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('studio-menu-trigger').click();
  // Nothing is listening on the bridge port in this suite, so connecting fails.
  await page.getByRole('button', { name: /Connect Inspector/ }).click();
  await page.keyboard.press('Escape');

  // The tool keeps working, which is the property that matters — a failed
  // optional connection must not take the application with it.
  await expect(page.getByTestId('studio-tool-surface')).toBeVisible();
  await expect(page.getByTestId('studio-inspector-status')).toContainText('Local only');
});

test('the three tools share one visual language', async ({ page }) => {
  await page.goto('/');

  for (const tool of ['shader-graph', 'particle-playground', 'texture-lab'] as const) {
    await page.getByTestId('studio-menu-trigger').click();
    await page.getByTestId(`studio-tool-${tool}`).click();
    await expect(page.getByTestId('studio-menu')).toBeHidden();
    await expect(page.getByTestId('studio-tool-surface')).toBeVisible();

    const harsh = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const el of document.querySelectorAll('*')) {
        const style = getComputedStyle(el);
        if (style.borderTopWidth === '0px' || style.borderTopStyle === 'none') continue;
        // sRGB forms only: an oklch() severity stripe has small numeric
        // components that would otherwise read as "near black".
        const color = style.borderTopColor;
        if (!color.startsWith('rgb')) continue;
        const parts = color.match(/[\d.]+/g);
        if (!parts) continue;
        const [r, g, b, a] = parts.map(Number);
        if (r < 90 && g < 90 && b < 90 && (a === undefined || a > 0.5)) {
          offenders.push(`${el.tagName.toLowerCase()}.${Array.from(el.classList).join(' ')}`);
        }
      }
      return offenders;
    });

    // Tailwind v4 defaults `border` to `currentColor`, so a missing
    // `border-border` base rule draws every container in the *text* colour.
    // Studio shipped that way once: 172 near-black outlines in Shader Graph
    // alone, which is what "strong border on every container" looked like.
    // See V4.md W2b.
    expect(harsh, `${tool} draws borders in the text colour`).toEqual([]);
  }
});

test('the love.js preview target is served, not the app itself', async ({ page }) => {
  await page.goto('/');

  // Both preview entry points Studio embeds: the node probe inside the shader
  // graph (webgl.html) and the floating preview (index.html).
  for (const entry of ['showcase-lovejs/webgl.html', 'showcase-lovejs/index.html']) {
    const response = await page.request.get(entry);
    expect(response.status(), `${entry} is not served`).toBe(200);

    const body = await response.text();

    // The failure this guards is silent: Vite has no such file, the SPA
    // fallback answers with index.html, and the iframe renders Studio inside
    // itself. It looks like a broken preview, not a missing asset.
    expect(body, `${entry} fell through to the SPA shell`).not.toContain('<div id="root">');
    expect(body.toLowerCase()).toContain('preview');
  }

  // The player and the game payload it loads must be there too — an entry page
  // that resolves while its assets 404 is the same defect one level down.
  for (const asset of ['showcase-lovejs/showcase.love', 'showcase-lovejs/webgl-player.js']) {
    const response = await page.request.get(asset);
    expect(response.status(), `${asset} is not served`).toBe(200);
    expect((await response.body()).byteLength, `${asset} is empty`).toBeGreaterThan(0);
  }
});

test('Particles keeps its full toolset in the resizable Context Lens workbench', async ({ page }) => {
  await page.goto('/');
  await chooseTool(page, 'particle-playground');

  await expect(page.getByTestId('studio-particle-workbench')).toBeVisible();
  await expect(page.getByTestId('particle-selection')).toBeVisible();
  await expect(page.getByTestId('particle-preview')).toBeVisible();
  await expect(page.getByTestId('particle-inspector')).toBeVisible();
  const previewFrame = await page.getByTestId('love-js-preview-frame').boundingBox();
  expect(previewFrame).not.toBeNull();
  expect(Math.abs(previewFrame!.width / previewFrame!.height - 16 / 9)).toBeLessThan(0.02);
  await expect(page.getByRole('button', { name: 'Add Emitter' })).toBeVisible();

  await page.getByRole('button', { name: 'Project' }).click();
  for (const action of ['Import Project', 'Save Project', 'Copy Lua Code', 'Save Runtime ZIP']) {
    await expect(page.getByRole('menuitem', { name: action })).toBeVisible();
  }
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Preview & Assets' }).click();
  await expect(page.getByRole('heading', { name: 'Composite Preview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Texture' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shader' })).toBeVisible();

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('particle-timeline-panel')).toBeVisible();
  await expect(page.getByTestId('love-js-preview-frame')).toBeVisible();

  await page.getByLabel('Light preview background').click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('feather-studio:preview-ground:particles')))
    .toBe('light');
});

test('Texture Lab keeps every editor behind its preview-priority workbench', async ({ page }) => {
  await page.goto('/');
  await chooseTool(page, 'texture-lab');

  await expect(page.getByTestId('studio-texture-workbench')).toBeVisible();
  await expect(page.getByTestId('texture-navigator')).toBeVisible();
  await expect(page.getByTestId('texture-preview')).toBeVisible();
  await expect(page.getByTestId('texture-inspector')).toBeVisible();
  await expect(page.getByTestId('texture-lab-navigator')).toContainText('Recipes & Generators');
  await expect(page.getByTestId('texture-lab-controls-panel')).toBeVisible();

  await page.getByLabel('Light preview background').click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('feather-studio:preview-ground:texture-lab')))
    .toBe('light');

  await page.getByRole('button', { name: 'Create Atlas' }).click();
  await expect(page.getByRole('tab', { name: /Atlas/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('texture-lab-atlas-panel')).toBeVisible();
  await page.getByRole('tab', { name: 'Parameters' }).click();
  await expect(page.getByLabel('Texture generator')).toBeVisible();
  await expect(page.getByTestId('texture-lab-saved-recipes')).toBeVisible();
});

test('creative workbench pane sizes persist independently', async ({ page }) => {
  await page.goto('/');
  await chooseTool(page, 'texture-lab');

  const workbench = page.getByTestId('studio-texture-workbench');
  const navigator = page.getByTestId('texture-navigator');
  const firstHandle = workbench.locator('[data-separator]').first();
  const before = await navigator.evaluate((element) => element.getBoundingClientRect().width);
  await firstHandle.focus();
  await page.keyboard.press('ArrowRight');
  const after = await navigator.evaluate((element) => element.getBoundingClientRect().width);
  expect(after).not.toBe(before);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('feather-studio:panel-layout:texture-lab')))
    .not.toBeNull();

  await page.reload();
  const restored = await page.getByTestId('texture-navigator').evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(restored - after)).toBeLessThan(3);
});
