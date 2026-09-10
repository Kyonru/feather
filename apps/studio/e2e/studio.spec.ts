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

test('Studio boots as a standalone application', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('studio-rail')).toBeVisible();
  for (const tool of TOOLS) {
    await expect(page.getByTestId(`studio-tool-${tool.id}`)).toBeVisible();
  }
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
    await page.getByTestId(`studio-tool-${tool.id}`).click();
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
  await page.getByTestId('studio-tool-texture-lab').click();
  await expect(page.getByTestId('studio-tool-texture-lab')).toHaveAttribute('aria-current', 'page');

  await page.reload();
  await expect(page.getByTestId('studio-tool-texture-lab')).toHaveAttribute('aria-current', 'page');
});

test('no Inspector is a neutral fact, not an error', async ({ page }) => {
  await page.goto('/');
  const status = page.getByTestId('studio-inspector-status');

  await expect(status).toContainText('Local only');
  await expect(status.getByRole('button', { name: /Connect Inspector/ })).toBeVisible();
});

test('a failed Inspector connection leaves Studio working', async ({ page }) => {
  await page.goto('/');
  // Nothing is listening on the bridge port in this suite, so connecting fails.
  await page.getByRole('button', { name: /Connect Inspector/ }).click();

  // The tool keeps working, which is the property that matters — a failed
  // optional connection must not take the application with it.
  await expect(page.getByTestId('studio-tool-surface')).toBeVisible();
  await expect(page.getByTestId('studio-inspector-status')).toContainText('Local only');
});
