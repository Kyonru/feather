import { expect, test, type Page } from '@playwright/test';

async function seedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'session-storage',
      JSON.stringify({
        state: {
          sessions: {
            demo: {
              id: 'demo',
              name: 'Demo Session',
              os: 'Web',
              connected: true,
              connectedAt: Date.now(),
            },
          },
        },
        version: 0,
      }),
    );
  });
}

async function seedDebuggerSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'session-storage',
      JSON.stringify({
        state: {
          sessions: {
            demo: {
              id: 'demo',
              name: 'Demo Session',
              os: 'Web',
              connected: true,
              connectedAt: Date.now(),
            },
          },
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'feather-debugger',
      JSON.stringify({
        state: {
          breakpoints: [
            { file: 'main.lua', line: 12, enabled: true },
            { file: 'main.lua', line: 18, condition: 'player.health <', enabled: true },
          ],
          defaultEnabled: true,
          rootPaths: {},
          pausedState: {
            demo: {
              pauseId: 1,
              file: 'game/player.lua',
              line: 12,
              reason: 'breakpoint',
              stack: [
                { index: 0, file: 'game/player.lua', line: 12, name: 'love.update', what: 'Lua' },
                { index: 1, file: 'systems/player.lua', line: 44, name: 'player.step', what: 'Lua' },
              ],
              locals: {},
              upvalues: {},
            },
          },
          enabled: { demo: true },
          pauseOnError: { demo: true },
          status: {
            demo: {
              enabled: true,
              paused: true,
              pauseOnError: true,
              sourceRoot: '/tmp/feather-demo',
              breakpointCount: 2,
              rejectedBreakpoints: [],
              breakpointErrors: [
                {
                  file: 'main.lua',
                  line: 18,
                  condition: 'player.health <',
                  error: 'unexpected symbol near end of expression',
                },
              ],
            },
          },
          breakpointErrors: {
            demo: [
              {
                file: 'main.lua',
                line: 18,
                condition: 'player.health <',
                error: 'unexpected symbol near end of expression',
              },
            ],
          },
        },
        version: 0,
      }),
    );
  });
}

async function seedConsoleSession(page: Page) {
  await seedSession(page);
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem(
      'feather-console-history-v2',
      JSON.stringify({
        state: {
          historyBySession: {
            demo: ['return player.health', 'return love.timer.getFPS()'],
          },
          outputBySession: {
            demo: [
              {
                id: 'stored-console-1',
                input: 'return player.health',
                timestamp: now - 2000,
                completedAt: now - 1500,
                status: 'success',
                result: '100',
                prints: ['health check'],
              },
            ],
          },
          snippetsBySession: {
            demo: [
              {
                id: 'snippet-demo-health',
                name: 'Player health',
                code: 'return player.health',
                createdAt: now - 1000,
                updatedAt: now - 1000,
              },
            ],
          },
        },
        version: 0,
      }),
    );
  });
}

test('shows no-session empty state and opens settings', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('No session connected')).toBeVisible();
  await expect(page.getByText('Start a game with Feather enabled')).toBeVisible();

  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('WebSocket Port')).toHaveValue('4004');
  await expect(page.getByLabel('Connection Timeout (seconds)')).toHaveValue('15');
});

test('persists settings changes across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();

  await page.getByLabel('WebSocket Port').fill('4111');
  await page.getByLabel('Connection Timeout (seconds)').fill('22');

  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByLabel('Asset Source Directory').fill('/tmp/feather-assets');

  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();

  await page.reload();
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await expect(page.getByLabel('WebSocket Port')).toHaveValue('4111');
  await expect(page.getByLabel('Connection Timeout (seconds)')).toHaveValue('22');

  await page.getByRole('tab', { name: 'General' }).click();
  await expect(page.getByLabel('Asset Source Directory')).toHaveValue('/tmp/feather-assets');
});

test('keeps tool routes gated until a session is selected', async ({ page }) => {
  await page.goto('/assets');

  await expect(page.getByText('No session connected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assets' })).toBeDisabled();
});

test('activates a persisted session and renders core tools', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Demo Session/ })).toBeVisible();
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByPlaceholder('Search logs...')).toBeVisible();

  await page.getByRole('link', { name: /Performance/ }).click();
  await expect(page.getByText('Track disk usage')).toBeVisible();

  await page.getByRole('link', { name: /Assets/ }).click();
  await expect(page.getByText('No assets captured yet')).toBeVisible();
});

test('debugger renders stable single-row header and three panels', async ({ page }) => {
  await seedDebuggerSession(page);
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.goto('/debugger');

  await page.getByRole('button', { name: /Demo Session/ }).click();

  const header = page.getByTestId('debugger-header');
  const filesPanel = page.getByTestId('debugger-files-panel');
  const sourcePanel = page.getByTestId('debugger-source-panel');
  const inspectorPanel = page.getByTestId('debugger-inspector-panel');

  await expect(header).toBeVisible();
  await expect(filesPanel).toBeVisible();
  await expect(sourcePanel).toBeVisible();
  await expect(inspectorPanel).toBeVisible();
  await expect(page.getByText('Paused')).toBeVisible();
  await expect(page.getByText('2 synced')).toBeVisible();
  await expect(page.getByText('condition error')).toBeVisible();
  await expect(header.getByText('Hot Reload')).toBeVisible();
  await expect(header.getByText('game.player')).toBeVisible();
  await expect(header.getByText('Disabled')).toBeVisible();
  await expect(header.getByRole('button', { name: 'Reload' })).toHaveAttribute(
    'title',
    'Hot reload requires the desktop app so Feather can read the selected file.',
  );
  await expect(header.getByText('Clear')).toBeVisible();
  await expect(sourcePanel.getByText('Continue')).toBeVisible();
  await expect(sourcePanel.getByText('Over')).toBeVisible();
  await expect(sourcePanel.getByText('Into')).toBeVisible();
  await expect(sourcePanel.getByText('Out')).toBeVisible();
  await expect(page.getByText('Call Stack')).toBeVisible();
  await expect(page.getByText('Variables')).toBeVisible();
  await expect(page.getByText('No locals')).toBeVisible();
  await expect(page.getByText('No upvalues')).toBeVisible();

  const headerBox = await header.boundingBox();
  const sourceBox = await sourcePanel.boundingBox();
  const filesBox = await filesPanel.boundingBox();
  const inspectorBox = await inspectorPanel.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(sourceBox).not.toBeNull();
  expect(filesBox).not.toBeNull();
  expect(inspectorBox).not.toBeNull();
  expect(sourceBox!.y).toBeGreaterThan(headerBox!.y + headerBox!.height - 1);
  expect(filesBox!.height).toBeGreaterThan(300);
  expect(sourceBox!.height).toBeGreaterThan(300);
  expect(inspectorBox!.height).toBeGreaterThan(300);

  await page.screenshot({ path: 'test-results/debugger-layout-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 960, height: 760 });
  await expect(header).toBeVisible();
  await expect(sourcePanel).toBeVisible();
  const narrowHeaderBox = await header.boundingBox();
  const narrowSourceBox = await sourcePanel.boundingBox();
  expect(narrowHeaderBox).not.toBeNull();
  expect(narrowSourceBox).not.toBeNull();
  expect(narrowSourceBox!.y).toBeGreaterThan(narrowHeaderBox!.y + narrowHeaderBox!.height - 1);
  expect(narrowSourceBox!.height).toBeGreaterThan(250);

  await page.screenshot({ path: 'test-results/debugger-layout-narrow.png', fullPage: true });
});

test('console renders transcript actions, snippets, and history search', async ({ page }) => {
  await seedConsoleSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/console');

  await page.getByRole('button', { name: /Demo Session/ }).click();

  const header = page.getByTestId('console-header');
  await expect(header.getByText('Connected')).toBeVisible();
  await expect(header.getByText('Plugin disabled')).toBeVisible();
  await expect(header.getByText('API key missing')).toBeVisible();
  await expect(page.getByText('return player.health').first()).toBeVisible();
  await expect(page.getByText('health check')).toBeVisible();
  await expect(page.getByText('100')).toBeVisible();
  await expect(page.getByTitle('Copy command')).toBeVisible();
  await expect(page.getByTitle('Copy result')).toBeVisible();
  await expect(page.getByTitle('Use as input').first()).toBeVisible();
  await expect(page.getByTitle('Run again')).toBeVisible();
  await expect(page.getByText('Player health')).toBeVisible();
  await expect(page.getByText('History')).toBeVisible();
  await expect(page.getByText('return love.timer.getFPS()')).toBeVisible();

  const editor = page.locator('textarea').last();
  await editor.fill('return love.graphics.getStats()');
  page.once('dialog', (dialog) => dialog.accept('Graphics stats now'));
  await page.getByTitle('Save current input as a snippet').click();
  await expect(page.getByText('Graphics stats now')).toBeVisible();

  await page.getByTitle('Insert snippet').first().click();
  await expect(editor).toHaveValue(/return /);

  await page.getByTitle('Search command history').click();
  await page.getByPlaceholder('filter history...').fill('fps');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveValue('return love.timer.getFPS()');

  await editor.fill('pri');
  await expect(page.getByText('print').first()).toBeVisible();
  await editor.press('Tab');
  await expect(editor).toHaveValue('print');

  await editor.fill('love.graphics.getS');
  await expect(page.getByText('getStats').first()).toBeVisible();
  await editor.press('Tab');
  await expect(editor).toHaveValue('love.graphics.getStats');

  await editor.fill('_G.pr');
  await expect(page.getByText('print').first()).toBeVisible();
  await editor.press('Tab');
  await expect(editor).toHaveValue('_G.print');

  await page.setViewportSize({ width: 900, height: 720 });
  await expect(header).toBeVisible();
  await expect(page.locator('aside').getByText('Snippets')).toBeVisible();
  await expect(editor).toBeVisible();
});
