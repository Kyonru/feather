import { expect, test, type Page } from '@playwright/test';

async function seedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
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

async function seedTwoConnectedSessions(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
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
            other: {
              id: 'other',
              name: 'Second Session',
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

async function seedCommandCenterState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
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
            second: {
              id: 'second',
              name: 'Second Session',
              os: 'Web',
              connected: true,
              connectedAt: Date.now() - 1000,
            },
          },
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'settings-storage',
      JSON.stringify({
        state: {
          hiddenMainFeatures: ['assets'],
          hiddenPlugins: ['disabled-tool'],
          showHiddenMainFeaturesInCommandCenter: true,
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'feather-console-history-v2',
      JSON.stringify({
        state: {
          historyBySession: {},
          outputBySession: {},
          snippetsBySession: {
            demo: [
              {
                id: 'snippet-player-health',
                name: 'Player health',
                code: 'return player.health',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ],
          },
        },
        version: 0,
      }),
    );
  });
}

async function seedCommandCenterHiddenDefault(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
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
      'settings-storage',
      JSON.stringify({
        state: {
          hiddenMainFeatures: ['assets'],
        },
        version: 0,
      }),
    );
  });
}

async function pressCommandCenterShortcut(page: Page) {
  await page.getByTestId('command-center-trigger').focus();
  await page.keyboard.press('Control+K');
}

async function seedCommandCenterConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        profiler: {
          tabName: 'Profiler',
          icon: 'gauge',
        },
        'disabled-tool': {
          tabName: 'Disabled Tool',
          icon: 'plug',
          disabled: true,
        },
      },
      root_path: '/tmp/demo',
      version: '2.0.0',
      API: 0,
      sampleRate: 1,
      outfile: '',
      language: 'lua',
      captureScreenshot: false,
      location: '/tmp/demo',
      sourceDir: '/tmp/demo',
      sessionName: 'Demo Session',
      debugger: {
        hotReload: {
          enabled: false,
          active: false,
          persistToDisk: false,
          requireLocalNetwork: true,
          modifiedModules: [],
          persistedModules: [],
          failedModules: [],
          history: [],
        },
      },
    });
  });
}

async function seedHealthySessionConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        profiler: {
          tabName: 'Profiler',
          icon: 'gauge',
          capabilities: [],
        },
      },
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      version: '1.5.0',
      API: 5,
      sampleRate: 1,
      outfile: '',
      language: 'lua',
      captureScreenshot: false,
      location: '/tmp/demo',
      sessionName: 'Demo Session',
      capabilities: [],
      security: { appIdRequired: true },
      sysInfo: { os: 'Web', arch: 'arm64', cpuCount: 8, loveVersion: '11.5' },
      debugger: {
        enabled: false,
        hotReload: {
          enabled: false,
          active: false,
          persistToDisk: false,
          modifiedModules: [],
          persistedModules: [],
          failedModules: [],
        },
      },
    });
  });
}

async function seedSessionHubState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
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
              insecure: true,
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
          breakpoints: [{ file: 'main.lua', line: 12, enabled: true }],
          defaultEnabled: true,
          rootPaths: {},
          pausedState: {
            demo: {
              pauseId: 42,
              file: 'main.lua',
              line: 12,
              reason: 'breakpoint',
              stack: [{ index: 0, file: 'main.lua', line: 12, name: 'love.update', what: 'Lua' }],
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
              sourceRoot: '/tmp/demo',
              breakpointCount: 1,
              rejectedBreakpoints: [],
              breakpointErrors: [
                {
                  file: 'main.lua',
                  line: 12,
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
                line: 12,
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

async function seedNoisySessionHubConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        console: {
          tabName: 'Console',
          icon: 'terminal',
          capabilities: ['filesystem'],
        },
        'hot-reload': {
          tabName: 'Hot Reload',
          icon: 'refresh-cw',
          capabilities: ['filesystem'],
        },
        profiler: {
          tabName: 'Profiler',
          icon: 'gauge',
          disabled: true,
          capabilities: [],
        },
        'old-plugin': {
          tabName: 'Old Plugin',
          icon: 'plug-zap',
          incompatible: true,
          incompatibilityReason: 'Requires Feather plugin API 6-any; desktop API is 5.',
          capabilities: ['draw'],
        },
      },
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      version: '1.0.0',
      API: 4,
      sampleRate: 1,
      outfile: '',
      language: 'lua',
      captureScreenshot: false,
      location: '/tmp/demo',
      sessionName: 'Demo Session',
      capabilities: 'all',
      security: { appIdRequired: false },
      sysInfo: { os: 'Web', arch: 'arm64', cpuCount: 8, loveVersion: '11.5' },
      debugger: {
        enabled: true,
        hotReload: {
          enabled: true,
          active: true,
          persistToDisk: true,
          modifiedModules: ['game.player'],
          persistedModules: [],
          failedModules: ['game.enemy'],
        },
      },
    });
    client?.setQueryData(['demo', 'performance'], [
      {
        time: 1,
        gameTime: 1,
        vsyncEnabled: true,
        supported: {
          multicanvasformats: true,
          clampzero: true,
          lighten: true,
          fullnpot: true,
          pixelshaderhighp: true,
          shaderderivatives: true,
          glsl3: true,
          instancing: true,
        },
        fps: 24,
        frameTime: 0.04,
        frameTimeMin: 0.01,
        frameTimeMax: 0.05,
        frameTimeAvg: 0.035,
        memory: 300,
        peakMemory: 310,
        diskUsage: 0,
        sysInfo: { arch: 'arm64', cpuCount: 8, os: 'Web' },
        stats: {
          drawcallsbatched: 10,
          canvasswitches: 2,
          shaderswitches: 4,
          canvases: 2,
          images: 12,
          fonts: 2,
          texturememory: 160,
          drawcalls: 1400,
        },
      },
    ]);
  });
}

async function seedCompareData(page: Page) {
  await page.evaluate(() => {
    const basePerf = {
      time: 1,
      gameTime: 1,
      vsyncEnabled: true,
      supported: {
        multicanvasformats: true,
        clampzero: true,
        lighten: true,
        fullnpot: true,
        pixelshaderhighp: true,
        shaderderivatives: true,
        glsl3: true,
        instancing: true,
      },
      frameTimeMin: 0.01,
      frameTimeMax: 0.02,
      frameTimeAvg: 0.016,
      peakMemory: 75,
      diskUsage: 0,
      sysInfo: { arch: 'arm64', cpuCount: 8, os: 'Web' },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'observers'], [
      { key: 'player.health', value: '100', type: 'number' },
      { key: 'player.state', value: 'idle', type: 'string' },
      { key: 'enemy.count', value: '3', type: 'number' },
      { key: 'only.demo', value: 'left', type: 'string' },
    ]);
    client?.setQueryData(['other', 'observers'], [
      { key: 'player.health', value: '85', type: 'number' },
      { key: 'player.state', value: 'idle', type: 'string' },
      { key: 'enemy.count', value: '3', type: 'number' },
      { key: 'only.other', value: 'right', type: 'string' },
    ]);
    client?.setQueryData(['demo', 'performance'], [
      {
        ...basePerf,
        fps: 60,
        frameTime: 0.016,
        memory: 50,
        stats: {
          drawcallsbatched: 10,
          canvasswitches: 1,
          shaderswitches: 2,
          canvases: 1,
          images: 4,
          fonts: 1,
          texturememory: 20,
          drawcalls: 100,
        },
      },
    ]);
    client?.setQueryData(['other', 'performance'], [
      {
        ...basePerf,
        fps: 45,
        frameTime: 0.024,
        memory: 45,
        stats: {
          drawcallsbatched: 12,
          canvasswitches: 3,
          shaderswitches: 5,
          canvases: 2,
          images: 5,
          fonts: 1,
          texturememory: 18,
          drawcalls: 140,
        },
      },
    ]);
  });
}

async function seedPerformanceData(page: Page) {
  await page.evaluate(() => {
    const base = {
      gameTime: 1,
      vsyncEnabled: true,
      supported: {
        multicanvasformats: true,
        clampzero: true,
        lighten: true,
        fullnpot: true,
        pixelshaderhighp: true,
        shaderderivatives: true,
        glsl3: true,
        instancing: true,
      },
      diskUsage: 0,
      peakMemory: 80,
      sysInfo: { arch: 'arm64', cpuCount: 8, os: 'Web' },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'performance'], [
      {
        ...base,
        time: 1,
        fps: 60,
        frameTime: 0.016,
        frameTimeMin: 0.014,
        frameTimeMax: 0.017,
        frameTimeAvg: 0.016,
        memory: 40,
        stats: { drawcallsbatched: 20, canvasswitches: 0, shaderswitches: 0, canvases: 1, images: 4, fonts: 1, texturememory: 60, drawcalls: 220 },
      },
      {
        ...base,
        time: 2,
        fps: 52,
        frameTime: 0.019,
        frameTimeMin: 0.014,
        frameTimeMax: 0.021,
        frameTimeAvg: 0.018,
        memory: 50,
        stats: { drawcallsbatched: 25, canvasswitches: 2, shaderswitches: 1, canvases: 2, images: 5, fonts: 1, texturememory: 90, drawcalls: 500 },
      },
      {
        ...base,
        time: 3,
        fps: 28,
        frameTime: 0.04,
        frameTimeMin: 0.014,
        frameTimeMax: 0.045,
        frameTimeAvg: 0.032,
        memory: 75,
        peakMemory: 90,
        stats: { drawcallsbatched: 80, canvasswitches: 10, shaderswitches: 6, canvases: 4, images: 10, fonts: 2, texturememory: 180, drawcalls: 1600 },
      },
    ]);
  });
}

async function seedAssetCatalog(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(['demo', 'assets'], {
      enabled: true,
      textures: [
        {
          id: 1,
          name: 'assets/player.png',
          displayName: 'player.png',
          path: 'assets/player.png',
          width: 32,
          height: 32,
          format: 'rgba8',
          mipmaps: 1,
          loadCount: 3,
          firstSeen: 1779840000,
          lastSeen: 1779840300,
          filter: { min: 'linear', mag: 'nearest', anisotropy: 1 },
          wrap: { x: 'clamp', y: 'clamp' },
          memoryBytes: 4096,
        },
        {
          id: 2,
          name: 'ImageData: 16x16',
          displayName: 'ImageData: 16x16',
          width: 16,
          height: 16,
          format: 'rgba8',
          mipmaps: 1,
          loadCount: 1,
          firstSeen: 1779840100,
          lastSeen: 1779840100,
        },
      ],
      fonts: [
        {
          id: 3,
          name: 'ui.ttf',
          displayName: 'ui.ttf',
          path: 'assets/ui.ttf',
          height: 14,
          ascent: 11,
          descent: 3,
          loadCount: 1,
          firstSeen: 1779840100,
          lastSeen: 1779840120,
        },
      ],
      audio: [
        {
          id: 4,
          name: 'click.wav',
          displayName: 'click.wav',
          path: 'assets/click.wav',
          srcType: 'static',
          channels: 2,
          duration: 0.25,
          loadCount: 2,
          firstSeen: 1779840120,
          lastSeen: 1779840200,
        },
      ],
      preview: null,
    });
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
                values: [
                  {
                    type: 'table',
                    typeName: 'table',
                    summary: 'table (2 fields)',
                    preview: '{ health = 100, state = "idle" }',
                    expandable: true,
                    handle: 'r1',
                    path: [],
                    fields: [
                      { key: 'health', type: 'number', typeName: 'number', preview: '100', summary: '100', path: ['health'] },
                      { key: 'state', type: 'string', typeName: 'string', preview: '"idle"', summary: 'idle', path: ['state'] },
                    ],
                  },
                ],
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
  await page.getByLabel('Assets', { exact: true }).uncheck();
  await expect(page.getByLabel('Show hidden sidebar features in Command Center')).not.toBeChecked();
  await page.getByLabel('Show hidden sidebar features in Command Center').check();

  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Assets' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await expect(page.getByLabel('WebSocket Port')).toHaveValue('4111');
  await expect(page.getByLabel('Connection Timeout (seconds)')).toHaveValue('22');

  await page.getByRole('tab', { name: 'General' }).click();
  await expect(page.getByLabel('Asset Source Directory')).toHaveValue('/tmp/feather-assets');
  await expect(page.getByLabel('Assets', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Show hidden sidebar features in Command Center')).toBeChecked();
});

test('keeps tool routes gated until a session is selected', async ({ page }) => {
  await page.goto('/assets');

  await expect(page.getByText('No session connected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assets' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);
});

test('session health hub summarizes a healthy active session', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await seedHealthySessionConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByRole('link', { name: 'Session', exact: true }).click();

  const hub = page.getByTestId('session-health-hub');
  await expect(hub).toBeVisible();
  await expect(hub.getByText('Healthy')).toBeVisible();
  await expect(hub.getByText('Connection', { exact: true })).toBeVisible();
  await expect(hub.getByText('Live', { exact: true }).first()).toBeVisible();
  await expect(hub.getByText('Plugins', { exact: true })).toBeVisible();
  await expect(hub.getByText('1 on')).toBeVisible();
  await expect(page.getByText('No urgent session issues detected.', { exact: true })).toBeVisible();
  await expect(page.getByText('Keep debugging')).toBeVisible();
  await expect(page.getByTestId('session-plugin-profiler')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('NaN');
  await expect(page.locator('body')).not.toContainText('undefined');
});

test('session health hub surfaces security, debugger, plugin, hot reload, and performance actions', async ({ page }) => {
  await seedSessionHubState(page);
  await page.setViewportSize({ width: 1180, height: 780 });
  await page.goto('/');
  await seedNoisySessionHubConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByRole('link', { name: 'Session', exact: true }).click();

  const hub = page.getByTestId('session-health-hub');
  await expect(hub).toBeVisible();
  await expect(hub.getByText('Review security')).toBeVisible();
  await expect(page.getByText('Recommended Next Actions')).toBeVisible();
  await expect(page.getByText('Review security settings')).toBeVisible();
  await expect(page.getByText('Version or plugin mismatch')).toBeVisible();
  await expect(page.getByText('Debugger attention')).toBeVisible();
  await expect(page.getByText('Hot Reload needs review')).toBeVisible();
  await expect(page.getByText('Performance signal')).toBeVisible();
  await expect(page.getByText('Console needs an API key')).toBeVisible();
  await expect(page.getByText('Incompatible 1')).toBeVisible();
  await expect(page.getByText('Risky 2')).toBeVisible();
  await page.getByRole('button', { name: /Risky 2/ }).click();
  await expect(page.getByTestId('session-plugin-console')).toBeVisible();
  await expect(page.getByTestId('session-plugin-hot-reload')).toBeVisible();
  await expect(page.getByTestId('session-plugin-old-plugin')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('NaN');
  await expect(page.locator('body')).not.toContainText('undefined');

  await page.setViewportSize({ width: 900, height: 720 });
  await expect(hub).toBeVisible();
  await expect(page.getByText('Recommended Next Actions')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Packages' })).toBeVisible();
  await page.screenshot({ path: 'test-results/session-health-hub-narrow.png', fullPage: true });
});

test('shows compare only when two connected sessions are available', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);

  await page.goto('/compare');
  await expect(page.getByText('Compare needs at least two connected sessions')).toBeVisible();

  await seedTwoConnectedSessions(page);
  await page.reload();
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await seedCompareData(page);

  const sessionButton = page.getByRole('button', { name: 'Session', exact: true });
  const compareButton = page.getByRole('button', { name: 'Compare', exact: true });
  await expect(compareButton).toBeVisible();
  const sessionBox = await sessionButton.boundingBox();
  const compareBox = await compareButton.boundingBox();
  expect(sessionBox).not.toBeNull();
  expect(compareBox).not.toBeNull();
  expect(compareBox!.y).toBeGreaterThan(sessionBox!.y);

  await page.getByRole('link', { name: /Compare/ }).click();
  await expect(page.getByText('Demo Session').first()).toBeVisible();
  await expect(page.getByText('Second Session').first()).toBeVisible();
  await expect(page.getByText('Total 5')).toBeVisible();
  await expect(page.getByText('Changed 1')).toBeVisible();
  await expect(page.getByText('Only A 1')).toBeVisible();
  await expect(page.getByText('Only B 1')).toBeVisible();
  await expect(page.getByText('Equal 2')).toBeVisible();
  await expect(page.getByText('FPS -15')).toBeVisible();
  await expect(page.getByText('Frame +8.0 ms')).toBeVisible();
  await expect(page.getByText('Mem -5.00 MB')).toBeVisible();
  await expect(page.getByText('Texture -2.00 MB')).toBeVisible();
  await expect(page.getByText('player.health')).toBeVisible();
  await expect(page.getByText('85')).toBeVisible();

  await page.getByRole('combobox').first().click();
  await expect(page.getByRole('option', { name: /Demo Session/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Second Session/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Second Session/ })).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Only A' }).click();
  await expect(page.getByText('only.demo')).toBeVisible();
  await expect(page.getByText('player.health')).toHaveCount(0);

  await page.getByRole('button', { name: 'Only B' }).click();
  await expect(page.getByText('only.other')).toBeVisible();
  await expect(page.getByText('only.demo')).toHaveCount(0);

  await page.getByRole('button', { name: 'Equal' }).click();
  await expect(page.getByText('player.state')).toBeVisible();

  await page.getByRole('button', { name: 'All' }).click();
  await page.getByPlaceholder('Search key or value').fill('health');
  await expect(page.getByText('player.health')).toBeVisible();
  await expect(page.getByText('enemy.count')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/compare-layout-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.getByText('Showing 1')).toBeVisible();
  await page.screenshot({ path: 'test-results/compare-layout-narrow.png', fullPage: true });
});

test('performance health surfaces actionable verdicts and safe metrics', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/performance');
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await seedPerformanceData(page);

  await expect(page.getByTestId('performance-verdicts')).toBeVisible();
  await expect(page.getByText('Frame hitch')).toBeVisible();
  await expect(page.getByText('Low FPS')).toBeVisible();
  await expect(page.getByText('Draw-call pressure')).toBeVisible();
  await expect(page.getByText('Shader/canvas switching')).toBeVisible();
  await page.getByRole('button', { name: /Details/ }).click();
  await expect(page.getByText('Memory climbing')).toBeVisible();
  await expect(page.getByText('Texture-heavy')).toBeVisible();
  await expect(page.getByText('max 45.0 ms', { exact: true })).toBeVisible();
  await expect(page.getByText('1,600 draw calls', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('NaN');
  await expect(page.locator('body')).not.toContainText('undefined');

  await page.getByTitle('Chart draw calls').click();
  await expect(page.getByText('Draw Calls').first()).toBeVisible();

  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.getByTestId('performance-verdicts')).toBeVisible();
  await expect(page.getByText('Recent Spikes', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/performance-health-narrow.png', fullPage: true });
});

test('observability triage controls filter and open observer details', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/observability');
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(['demo', 'observers'], [
      {
        key: 'player.health',
        value: '100',
        previous: '85',
        type: 'number',
        group: 'player',
        changed: true,
        changeCount: 2,
        firstSeen: Date.now() - 10_000,
        lastSeen: Date.now(),
        lastChanged: Date.now(),
        history: ['85'],
        valueLength: 3,
      },
      {
        key: 'enemy.count',
        value: '3',
        type: 'number',
        group: 'enemy',
        changed: false,
        changeCount: 0,
        firstSeen: Date.now() - 10_000,
        lastSeen: Date.now(),
        history: [],
        valueLength: 1,
      },
    ]);
  });

  await expect(page.getByText('Observers 2')).toBeVisible();
  await expect(page.getByText('Changed 1')).toBeVisible();
  await page.getByPlaceholder('Search keys or values...').fill('health');
  await expect(page.getByText('player.health')).toBeVisible();
  await expect(page.getByText('enemy.count')).toHaveCount(0);
  await page.getByText('player.health').click();
  await expect(page.getByText('Changes from previous value')).toBeVisible();
  await page.getByRole('tab', { name: 'Current' }).click();
  await expect(page.getByText('Observer JSON')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByPlaceholder('Search keys or values...').fill('missing');
  await expect(page.getByText('No observers match the current filters.')).toBeVisible();
});

test('activates a persisted session and renders core tools', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Demo Session/ })).toBeVisible();
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByPlaceholder('Search logs...')).toBeVisible();

  await page.getByRole('link', { name: /Performance/ }).click();
  await expect(page.getByText('Track disk usage')).toBeVisible();

  await seedAssetCatalog(page);
  await page.getByRole('link', { name: /Assets/ }).click();
  await expect(page.getByText('Textures 2')).toBeVisible();
  await expect(page.getByText('Fonts 1')).toBeVisible();
  await expect(page.getByText('Audio 1')).toBeVisible();
  await expect(page.getByText('Visible 2')).toBeVisible();
  await expect(page.getByText('Repeated 2')).toBeVisible();
  await expect(page.getByText('player.png', { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'x3' })).toBeVisible();

  await page.getByRole('button', { name: 'Repeated' }).click();
  await expect(page.getByText('player.png', { exact: true })).toBeVisible();
  await expect(page.getByText('ImageData: 16x16')).toHaveCount(0);

  await page.getByRole('button', { name: 'Missing local file' }).click();
  await expect(page.getByText('assets/player.png')).toBeVisible();

  await page.getByText('player.png', { exact: true }).click();
  await expect(page.getByText('Texture memory')).toBeVisible();
  await expect(page.getByText('4.0 KB')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Constructor', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Loads/ }).click();
  await page.screenshot({ path: 'test-results/assets-layout-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.getByText('Preview on')).toBeVisible();
  await expect(page.getByText('Texture memory')).toBeVisible();
  await page.screenshot({ path: 'test-results/assets-layout-narrow.png', fullPage: true });
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
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'console-pins'], {
      ok: true,
      pins: [
        {
          id: 'pin-player-health',
          name: 'player_health',
          expression: 'player.health',
          enabled: true,
          status: 'ok',
          value: '100',
        },
      ],
    });
    client?.setQueryData(['demo', 'observers'], [
      { key: 'console.player_health', value: '100', type: 'number', changed: false, history: [], group: 'console' },
    ]);
  });

  const header = page.getByTestId('console-header');
  await expect(header.getByText('Connected')).toBeVisible();
  await expect(header.getByText('Plugin disabled')).toBeVisible();
  await expect(header.getByText('API key missing')).toBeVisible();
  await expect(page.getByText('return player.health').first()).toBeVisible();
  await expect(page.getByText('health check')).toBeVisible();
  await expect(page.getByText('100').first()).toBeVisible();
  await expect(page.getByTitle('Copy command')).toBeVisible();
  await expect(page.getByTitle('Copy result')).toBeVisible();
  await expect(page.getByTitle('Use as input').first()).toBeVisible();
  await expect(page.getByTitle('Run again')).toBeVisible();
  await expect(page.getByText('Player health')).toBeVisible();
  await expect(page.getByText('Console safety')).toBeVisible();
  await expect(page.getByText('table (2 fields)')).toBeVisible();
  await page.getByText('table (2 fields)').click();
  await expect(page.getByText('health', { exact: true })).toBeVisible();
  await expect(page.getByText('console.player_health')).toBeVisible();
  await page.getByLabel('Read-only').check();
  await expect(header.getByText('Read-only guardrails')).toBeVisible();
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
  await expect(page.getByTestId('console-snippets')).toBeHidden();
  await expect(editor).toBeVisible();
});

test('command center discovers hidden features, plugins, snippets, and safe actions', async ({ page }) => {
  await seedCommandCenterState(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await seedCommandCenterConfig(page);

  await pressCommandCenterShortcut(page);
  await expect(page.getByTestId('command-center')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-center')).toBeHidden();

  await pressCommandCenterShortcut(page);
  await page.getByLabel('Command Center search').fill('assets');
  const assetsRow = page.getByTestId('command-center-row').filter({ hasText: '/assets' }).first();
  await expect(assetsRow).toBeVisible();
  await expect(assetsRow.getByText('Hidden')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/assets$/);

  await pressCommandCenterShortcut(page);
  await page.getByLabel('Command Center search').fill('profiler');
  await expect(page.getByTestId('command-center-row').filter({ hasText: '/plugins/profiler' }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/plugins\/profiler$/);

  await pressCommandCenterShortcut(page);
  await page.getByLabel('Command Center search').fill('player health');
  await expect(page.getByTestId('command-center').getByText('Insert snippet: Player health')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.locator('textarea').last()).toHaveValue('return player.health');

  await pressCommandCenterShortcut(page);
  await page.getByLabel('Command Center search').fill('continue');
  const continueRow = page.getByTestId('command-center-row').filter({ hasText: 'Continue' }).first();
  await expect(continueRow).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('command-center')).toBeVisible();

  await page.getByLabel('Command Center search').fill('disabled tool');
  await expect(page.getByTestId('command-center-row').filter({ hasText: 'Disabled Tool' })).toHaveCount(0);

  await page.getByLabel('Command Center search').fill('second session');
  const secondSessionRow = page.getByTestId('command-center-row').filter({ hasText: 'Switch to Second Session' }).first();
  await expect(secondSessionRow).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('command-center')).toBeHidden();
  await expect(page.getByText('Second Session').first()).toBeVisible();

  await page.setViewportSize({ width: 430, height: 720 });
  await pressCommandCenterShortcut(page);
  await expect(page.getByTestId('command-center')).toBeVisible();
  await expect(page.getByLabel('Command Center search')).toBeVisible();
});

test('command center hides hidden sidebar features by default', async ({ page }) => {
  await seedCommandCenterHiddenDefault(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await pressCommandCenterShortcut(page);
  await page.getByLabel('Command Center search').fill('assets');

  await expect(page.getByRole('button', { name: /^Assets \/assets/ })).toHaveCount(0);
  await expect(page.getByTestId('command-center').getByText('Assets docs')).toBeVisible();
});
