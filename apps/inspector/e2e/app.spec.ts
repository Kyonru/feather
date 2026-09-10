import { expect, test, type Page } from '@playwright/test';

const NARROW_VIEWPORT = { width: 900, height: 720 };















async function seedNoSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
    localStorage.setItem(
      'session-storage',
      JSON.stringify({
        state: {
          sessions: {},
        },
        version: 0,
      }),
    );
  });
}

async function seedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
    localStorage.setItem(
      'session-storage',
      JSON.stringify({
        state: {
          __e2eLiveSessions: true,
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
          __e2eLiveSessions: true,
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

async function seedTauriConnectedGame(page: Page) {
  await page.addInitScript(() => {
    type EventCallback = (event: { id: number; event: string; payload: unknown }) => void;

    localStorage.setItem('feather-e2e-query-client', '1');
    localStorage.setItem(
      'session-storage',
      JSON.stringify({
        state: {
          sessionId: 'stale-connecting',
          sessions: {
            'stale-connecting': {
              id: 'stale-connecting',
              name: 'Connecting game',
              os: 'MacOS',
              connected: true,
              connectedAt: Date.now() - 10_000,
            },
          },
        },
        version: 0,
      }),
    );

    const activeSessions = ['live-game-session'];
    const callbacks = new Map<number, EventCallback>();
    const listeners = new Map<string, Map<number, number>>();
    const commands: Array<{ sessionId: string; message: Record<string, unknown> }> = [];
    let nextCallbackId = 1;
    let nextEventId = 1;

    const emitTauriEvent = (event: string, payload: unknown) => {
      const eventListeners = listeners.get(event);
      if (!eventListeners) return;
      for (const [eventId, callbackId] of eventListeners.entries()) {
        callbacks.get(callbackId)?.({ id: eventId, event, payload });
      }
    };

    const sendHello = (sessionId: string) => {
      setTimeout(() => {
        emitTauriEvent(
          'feather://message',
          JSON.stringify({
            _session: sessionId,
            type: 'feather:hello',
            data: {
              plugins: {
                'particle-system-playground': {
                  tabName: 'Particles Playground',
                  icon: 'sparkles',
                  capabilities: [],
                },
              },
              root_path: '/tmp/cli-example',
              sourceDir: '/tmp/cli-example',
              version: '2.0.0',
              API: 5,
              sampleRate: 1,
              outfile: '',
              language: 'lua',
              captureScreenshot: false,
              location: '/tmp/cli-example',
              sessionName: 'CLI Example',
              capabilities: [],
              security: { appIdRequired: true },
              sysInfo: { os: 'MacOS', arch: 'arm64', cpuCount: 8, loveVersion: '11.5' },
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
            },
          }),
        );
      }, 0);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener(event: string, eventId: number) {
        listeners.get(event)?.delete(eventId);
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {
      transformCallback(callback: EventCallback) {
        const id = nextCallbackId;
        nextCallbackId += 1;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
      invoke(cmd: string, args: Record<string, unknown> = {}) {
        const sourceFiles =
          (window as unknown as { __FEATHER_E2E_SOURCE_FILES__?: Record<string, string> })
            .__FEATHER_E2E_SOURCE_FILES__ ?? {};
        if (cmd === 'plugin:fs|read_text_file' || cmd === 'read_text_file') {
          const path = String(args.path ?? '');
          const source = sourceFiles[path];
          return Promise.resolve(source === undefined ? null : Array.from(new TextEncoder().encode(source)));
        }
        if (cmd === 'plugin:fs|read_dir' || cmd === 'read_dir') {
          const path = String(args.path ?? '').replace(/\/$/, '');
          const children = new Map<string, { name: string; isFile: boolean; isDirectory: boolean }>();
          for (const filePath of Object.keys(sourceFiles)) {
            const normalized = filePath.replace(/\/$/, '');
            const relative = normalized.startsWith(`${path}/`) ? normalized.slice(path.length + 1) : '';
            if (!relative || relative.includes('/')) {
              const directory = relative.split('/')[0];
              if (directory) children.set(directory, { name: directory, isFile: false, isDirectory: true });
              continue;
            }
            children.set(relative, { name: relative, isFile: true, isDirectory: false });
          }
          return Promise.resolve([...children.values()]);
        }
        if (cmd === 'set_app_id') return Promise.resolve();
        if (cmd === 'get_active_sessions') return Promise.resolve([...activeSessions]);
        if (cmd === 'send_command') {
          const sessionId = String(args.sessionId ?? '');
          const message = JSON.parse(String(args.message ?? '{}')) as Record<string, unknown>;
          commands.push({ sessionId, message });
          if (message.type === 'req:config') {
            sendHello(sessionId);
          }
          return Promise.resolve();
        }
        if (cmd === 'plugin:event|listen') {
          const event = String(args.event ?? '');
          const handler = Number(args.handler);
          const eventId = nextEventId;
          nextEventId += 1;
          const eventListeners = listeners.get(event) ?? new Map<number, number>();
          eventListeners.set(eventId, handler);
          listeners.set(event, eventListeners);
          return Promise.resolve(eventId);
        }
        if (cmd === 'plugin:event|unlisten') {
          const event = String(args.event ?? '');
          const eventId = Number(args.eventId);
          listeners.get(event)?.delete(eventId);
          return Promise.resolve();
        }
        return Promise.resolve(null);
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_E2E_TAURI__ = {
      commands,
      emitSessionStart: () => emitTauriEvent('feather://session-start', activeSessions[0]),
      emitMessage: (sessionId: string, message: Record<string, unknown>) =>
        emitTauriEvent(
          'feather://message',
          JSON.stringify({
            _session: sessionId,
            ...message,
          }),
        ),
    };

    setTimeout(() => emitTauriEvent('feather://session-start', activeSessions[0]), 0);
  });
}

async function seedCommandCenterState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
    localStorage.setItem(
      'session-storage',
      JSON.stringify({
        state: {
          __e2eLiveSessions: true,
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
          __e2eLiveSessions: true,
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

async function expectNoBrokenText(page: Page) {
  const body = page.locator('body');
  await expect(body).not.toContainText('NaN');
  await expect(body).not.toContainText('undefined');
  await expect(body).not.toContainText('Infinity');
}

async function expectPrimarySurfaceVisible(page: Page, labels: string[]) {
  for (const label of labels) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
}

async function expectNarrowStable(page: Page, screenshotName: string, labels: string[] = []) {
  await page.setViewportSize(NARROW_VIEWPORT);
  await expectNoBrokenText(page);
  for (const label of labels) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await page.screenshot({ path: `test-results/${screenshotName}`, fullPage: true });
}

async function seedCommandCenterConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        console: {
          tabName: 'Console',
          icon: 'terminal',
        },
        'feel-inspector': {
          tabName: 'Feel Inspector',
          icon: 'activity',
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

async function seedPartialSessionConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        console: {
          tabName: 'Console',
          icon: 'terminal',
          disabled: true,
        },
        'old-plugin': {
          tabName: 'Old Plugin',
          icon: 'plug-zap',
          incompatible: true,
          incompatibilityReason: 'Requires a newer Feather runtime.',
        },
      },
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      sessionName: 'Demo Session',
      debugger: {
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

async function seedHealthySessionConfig(page: Page, overrides: Record<string, unknown> = {}) {
  await page.evaluate((extra) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        'shader-graph': {
          tabName: 'Shader Graph',
          icon: 'sparkles',
          capabilities: [],
        },
      },
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      // Deliberately NOT the desktop app version. Under v2 the Lua runtime and
      // the desktop app ship on separate release trains (V4.md section 6), so
      // they are expected to differ. Keeping them different here asserts that
      // runtime/desktop version drift alone does not degrade session health —
      // API is the compatibility signal, not string equality.
      version: '3.9.0',
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
      ...extra,
    });
  }, overrides);
}



async function seedMissingProfilerConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {},
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      sessionName: 'Demo Session',
    });
  });
}

async function seedDisabledProfilerConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        console: {
          tabName: 'Console',
          icon: 'terminal',
          disabled: true,
        },
      },
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      sessionName: 'Demo Session',
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
          __e2eLiveSessions: true,
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
        screenshots: {
          tabName: 'Screenshots',
          icon: 'camera',
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
    client?.setQueryData(
      ['demo', 'performance'],
      [
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
      ],
    );
  });
}

async function seedPartialCompareData(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'observers'], [{ key: 'player.health', value: '100', type: 'number' }]);
    client?.setQueryData(
      ['other', 'observers'],
      [
        { key: 'player.health', value: '100', type: 'number' },
        { key: 'only.other', value: 'right' },
      ],
    );
    client?.setQueryData(['demo', 'performance'], [{ time: 1, fps: 60, frameTime: 0.016 }]);
    client?.setQueryData(['other', 'performance'], [{ time: 2 }]);
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
    client?.setQueryData(
      ['demo', 'observers'],
      [
        { key: 'player.health', value: '100', type: 'number' },
        { key: 'player.state', value: 'idle', type: 'string' },
        { key: 'enemy.count', value: '3', type: 'number' },
        { key: 'only.demo', value: 'left', type: 'string' },
      ],
    );
    client?.setQueryData(
      ['other', 'observers'],
      [
        { key: 'player.health', value: '85', type: 'number' },
        { key: 'player.state', value: 'idle', type: 'string' },
        { key: 'enemy.count', value: '3', type: 'number' },
        { key: 'only.other', value: 'right', type: 'string' },
      ],
    );
    client?.setQueryData(
      ['demo', 'performance'],
      [
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
      ],
    );
    client?.setQueryData(
      ['other', 'performance'],
      [
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
      ],
    );
  });
}

async function seedPartialPerformanceData(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(
      ['demo', 'performance'],
      [
        {
          time: 1,
          fps: 58,
        },
        {
          time: 2,
          frameTime: 0.018,
          stats: {
            drawcalls: 180,
          },
        },
      ],
    );
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
    client?.setQueryData(
      ['demo', 'performance'],
      [
        {
          ...base,
          time: 1,
          fps: 60,
          frameTime: 0.016,
          frameTimeMin: 0.014,
          frameTimeMax: 0.017,
          frameTimeAvg: 0.016,
          memory: 40,
          stats: {
            drawcallsbatched: 20,
            canvasswitches: 0,
            shaderswitches: 0,
            canvases: 1,
            images: 4,
            fonts: 1,
            texturememory: 60,
            drawcalls: 220,
          },
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
          stats: {
            drawcallsbatched: 25,
            canvasswitches: 2,
            shaderswitches: 1,
            canvases: 2,
            images: 5,
            fonts: 1,
            texturememory: 90,
            drawcalls: 500,
          },
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
          stats: {
            drawcallsbatched: 80,
            canvasswitches: 10,
            shaderswitches: 6,
            canvases: 4,
            images: 10,
            fonts: 2,
            texturememory: 180,
            drawcalls: 1600,
          },
          featherOverhead: {
            windowSeconds: 1,
            frameCount: 60,
            avgMsPerFrame: 0.18,
            messages: 5,
            serializedBytes: 4096,
            binaryBytes: 512,
            deferredTasks: 2,
            budgetMisses: { time: 1, bytes: 1 },
            budget: {
              maxFrameMs: 0.5,
              maxMessagesPerFrame: 20,
              maxSerializedBytesPerFrame: 32768,
            },
            plugins: [
              {
                id: 'runtime-snapshot',
                update: { totalMs: 0.25, avgMs: 0.05, maxMs: 0.1, count: 5 },
                payload: { totalMs: 0.75, avgMs: 0.75, maxMs: 0.75, count: 1 },
              },
            ],
          },
        },
      ],
    );
  });
}

async function seedPartialAssetCatalog(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(['demo', 'assets'], {
      enabled: false,
      textures: [
        {
          id: 11,
          name: 'runtime-texture',
          displayName: 'runtime-texture',
          width: 8,
          height: 8,
          format: 'rgba8',
          mipmaps: 1,
          loadCount: 1,
        },
      ],
      fonts: [],
      audio: [],
      preview: null,
    });
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
          __e2eLiveSessions: true,
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

async function seedDebuggerProbeSession(page: Page) {
  await seedTauriConnectedGame(page);
  await page.addInitScript(() => {
    (globalThis as unknown as { isTauri?: boolean }).isTauri = true;
    (window as unknown as { __FEATHER_E2E_SOURCE_FILES__?: Record<string, string> }).__FEATHER_E2E_SOURCE_FILES__ = {
      '/tmp/cli-example/main.lua': [
        'local player = { x = 0 }',
        '',
        'function love.update(dt)',
        '  player.x = player.x + dt',
        '  if player.x > 10 then',
        '    player.x = 0',
        '  end',
        'end',
      ].join('\n'),
    };
    if (!localStorage.getItem('feather-debugger')) {
      localStorage.setItem(
        'feather-debugger',
        JSON.stringify({
          state: {
            breakpoints: [],
            profilerProbes: [{ file: 'main.lua', line: 4, kind: 'start', enabled: true }],
            defaultEnabled: true,
            rootPaths: {},
            pausedState: {
              'live-game-session': {
                pauseId: 9,
                file: 'main.lua',
                line: 4,
                reason: 'breakpoint',
                stack: [{ index: 0, file: 'main.lua', line: 4, name: 'love.update', what: 'Lua' }],
                locals: {},
                upvalues: {},
              },
            },
            enabled: { 'live-game-session': true },
            pauseOnError: { 'live-game-session': false },
            status: {
              'live-game-session': {
                enabled: true,
                paused: true,
                pauseOnError: false,
                sourceRoot: '/tmp/cli-example',
                breakpointCount: 0,
                profilerProbeCount: 1,
                rejectedBreakpoints: [],
                rejectedProfilerProbes: [],
                breakpointErrors: [],
              },
            },
            breakpointErrors: { 'live-game-session': [] },
          },
          version: 0,
        }),
      );
    }
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
                      {
                        key: 'health',
                        type: 'number',
                        typeName: 'number',
                        preview: '100',
                        summary: '100',
                        path: ['health'],
                      },
                      {
                        key: 'state',
                        type: 'string',
                        typeName: 'string',
                        preview: '"idle"',
                        summary: 'idle',
                        path: ['state'],
                      },
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
  await seedNoSession(page);
  await page.goto('/');

  await expect(page.getByText('No session connected')).toBeVisible();
  await expect(page.getByText('Start a game with Feather enabled')).toBeVisible();
  await expectNoBrokenText(page);

  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Connection' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();
  await expect(page.getByText('Ports, session timing, and mobile pairing.')).toBeVisible();
  await expect(page.getByLabel('WebSocket Port')).toHaveValue('4004');
  await expect(page.getByLabel('Connection Timeout (seconds)')).toHaveValue('15');
});




test('opens redesigned about modal from the sidebar', async ({ page }) => {
  await seedNoSession(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'About' }).click();

  const dialog = page.getByRole('dialog', { name: 'About Feather' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Built for LÖVE development')).toBeVisible();
  await expect(dialog.getByText('What Feather Covers')).toBeVisible();
  await expect(dialog.getByText('Project Links')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Open Docs' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Star on GitHub' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('sidebar groups pinned defaults without duplicating tools', async ({ page }) => {
  await seedTwoConnectedSessions(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  const favorites = page.getByTestId('sidebar-group-favorites');
  const core = page.getByTestId('sidebar-group-core');

  await expect(favorites.getByText('Favorites')).toBeVisible();
  await expect(favorites.getByTestId('sidebar-tool-logs')).toBeVisible();
  await expect(favorites.getByTestId('sidebar-tool-performance')).toBeVisible();
  await expect(favorites.getByTestId('sidebar-tool-session')).toBeVisible();
  await expect(core.getByText('Core')).toBeVisible();
  await expect(core.getByTestId('sidebar-tool-compare')).toBeVisible();
  await expect(page.getByTestId('sidebar-group-inspect').getByText('Inspect')).toBeVisible();
  await expect(page.getByTestId('sidebar-group-history').getByText('History')).toBeVisible();
  await expect(page.getByTestId('sidebar-tool-logs')).toHaveCount(1);
  await expect(page.getByTestId('sidebar-tool-performance')).toHaveCount(1);
  await expect(page.getByTestId('sidebar-tool-session')).toHaveCount(1);
});

test('typing in the log search survives a log the runtime sent without a message', async ({ page }) => {
  // Reported crash: TypeError: undefined is not an object (evaluating
  // 'log.str.toLowerCase') on the first keystroke. Logs are cast rather than
  // parsed on the WebSocket path, so a runtime that omits `str` reaches the
  // filter intact.
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await seedSession(page);
  await page.addInitScript(() => {
    const logs = [
      { id: 'ok', count: 1, time: Date.now(), type: 'output', str: 'player spawned', trace: '' },
      // The malformed one: no `str` at all.
      { id: 'broken', count: 1, time: Date.now(), type: 'error', trace: '' },
    ];
    localStorage.setItem(
      'feather-log-history-v1',
      JSON.stringify({
        state: {
          logsBySession: { demo: { logs, label: 'Demo Session', updatedAt: Date.now() } },
          logsByHistoryKey: { 'session:demo': { logs, label: 'Demo Session', updatedAt: Date.now() } },
          sessionHistoryKeys: { demo: ['session:demo'] },
        },
        version: 0,
      }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  // The malformed log has to actually be on screen, or this test proves nothing.
  await expect(page.getByText('player spawned')).toBeVisible();

  await page.getByTestId('logs-toolbar-search').getByRole('textbox').fill('player');
  await page.waitForTimeout(300);

  expect(pageErrors, `page threw while searching:\n${pageErrors.join('\n')}`).toEqual([]);
  await expect(page.getByText('player spawned')).toBeVisible();
});

test('settings are findable from the command palette', async ({ page }) => {
  // The palette advertised pages, plugins, snippets, sessions and docs, and
  // could not find a single setting — 1,789 lines of them, reachable only by
  // opening the dialog and hunting. V4-ENHANCED 6.12.
  await seedSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await pressCommandCenterShortcut(page);
  await expect(page.getByTestId('command-center')).toBeVisible();
  await page.getByRole('textbox', { name: 'Command Center search' }).fill('api key');

  // Searching for what a setting *is about* finds the section holding it.
  const security = page.getByText('Settings — Security').first();
  await expect(security).toBeVisible();
  await security.click();

  // And it lands on that section, not merely on the dialog's first tab. Asserted
  // through the UI rather than storage: the section is navigation for this app
  // run, deliberately not persisted.
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Security' })).toHaveAttribute('data-state', 'active');
  await expect(dialog.getByLabel('API Key').first()).toBeVisible();
});

test('an empty panel caused by a stale filter offers a way out', async ({ page }) => {
  // C1 made filters outlive the visit that set them, which created this: you can
  // arrive at an empty panel because of a filter you set days ago. The state
  // that reports it has to be the one that undoes it.
  await seedSession(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'feather-panel-state',
      JSON.stringify({ state: { values: { 'observability.search': 'zzz-nothing-matches-this' } }, version: 1 }),
    );
  });
  await page.goto('/observability');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  const clear = page.getByTestId('observability-clear-filters');
  await expect(clear).toBeVisible();
  await clear.click();

  // The filter is actually gone, not merely the message hiding it. Reading the
  // persisted store rather than the input, because with no observers attached
  // the panel drops to a different empty state and the toolbar goes with it.
  await expect(clear).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('feather-panel-state');
        return raw ? (JSON.parse(raw).state.values['observability.search'] ?? '') : null;
      }),
    )
    .toBe('');
});

test('panel filters survive leaving the panel and coming back', async ({ page }) => {
  // The most frequent cost this tool imposed: filter the log, step away to check
  // a number, come back to unfiltered output and type it again. V4-ENHANCED C1.
  await seedSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  const search = page.getByTestId('logs-toolbar-search').getByRole('textbox');
  await search.fill('collision');
  await expect(search).toHaveValue('collision');

  await page.getByTestId('sidebar-tool-assets').getByRole('link', { name: 'Assets' }).click();
  await expect(page).toHaveURL(/\/assets$/);

  await page.getByTestId('sidebar-tool-logs').getByRole('link', { name: 'Logs' }).click();
  await expect(page.getByTestId('logs-toolbar-search').getByRole('textbox')).toHaveValue('collision');
});

test('panel filters survive a full reload, the way a game restart leaves them', async ({ page }) => {
  // A restart mints a new session id, which is why this state is global rather
  // than keyed to the session — keying it would clear filters on exactly the
  // event they most need to survive.
  await seedSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await page.getByTestId('logs-toolbar-search').getByRole('textbox').fill('nil value');
  await expect(page.getByTestId('logs-toolbar-search').getByRole('textbox')).toHaveValue('nil value');

  await page.reload();
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await expect(page.getByTestId('logs-toolbar-search').getByRole('textbox')).toHaveValue('nil value');
});

test('the creative tools are gone from Inspector, not merely unreachable', async ({ page }) => {
  // They live in Feather Studio as of v4. Inspector kept advertising them after
  // the move, so every one of these navigated to a route that no longer exists
  // and rendered an empty page. Assert the absence, not just the routing.
  await seedSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByTestId('sidebar-group-creative')).toHaveCount(0);
  for (const id of ['shader-graph', 'particle-system-playground', 'texture-lab']) {
    await expect(page.getByTestId(`sidebar-tool-${id}`)).toHaveCount(0);
  }

  // The command palette advertised them too.
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('textbox', { name: 'Command Center search' }).fill('shader');
  await expect(page.getByText('Shader Graph', { exact: false })).toHaveCount(0);
});

test('sidebar pin actions persist and settings can clear and restore pins', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await page.getByTestId('sidebar-tool-assets').hover();
  await page.getByRole('button', { name: 'Pin Assets to favorites' }).click();
  await expect(page.getByTestId('sidebar-group-favorites').getByTestId('sidebar-tool-assets')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await expect(page.getByTestId('sidebar-group-favorites').getByTestId('sidebar-tool-assets')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByTestId('pinned-sidebar-tools-editor').getByRole('button', { name: 'Clear pins' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByTestId('sidebar-group-favorites')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByTestId('pinned-sidebar-tools-editor').getByRole('button', { name: 'Restore defaults' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByTestId('sidebar-group-favorites').getByTestId('sidebar-tool-logs')).toBeVisible();
  await expect(page.getByTestId('sidebar-group-favorites').getByTestId('sidebar-tool-performance')).toBeVisible();
  await expect(page.getByTestId('sidebar-group-favorites').getByTestId('sidebar-tool-session')).toBeVisible();
});

test('hidden pinned sidebar tools stay hidden until re-enabled', async ({ page }) => {
  await seedSession(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'settings-storage',
      JSON.stringify({
        state: {
          pinnedSidebarTools: ['assets', 'missing-tool'],
          hiddenMainFeatures: ['assets'],
        },
        version: 0,
      }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByTestId('sidebar-tool-assets')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-group-favorites')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  await expect(page.getByTestId('pinned-sidebar-tools-editor').getByLabel(/^Assets/)).toBeChecked();
  await page.getByTestId('sidebar-features-editor').getByLabel('Assets', { exact: true }).check();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();

  await expect(page.getByTestId('sidebar-group-favorites').getByTestId('sidebar-tool-assets')).toBeVisible();
  await expect(page.getByTestId('sidebar-tool-assets')).toHaveCount(1);
});

test('persists settings changes across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();

  await page.getByLabel('WebSocket Port').fill('4111');
  await page.getByLabel('Connection Timeout (seconds)').fill('22');

  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByLabel('Asset Source Directory').fill('/tmp/feather-assets');
  await page.getByTestId('sidebar-features-editor').getByLabel('Assets', { exact: true }).uncheck();
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
  await expect(page.getByTestId('sidebar-features-editor').getByLabel('Assets', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Show hidden sidebar features in Command Center')).toBeChecked();
});

test('settings exposes MCP access controls with browser fallback state', async ({ page }) => {
  await seedNoSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await page.getByRole('tab', { name: 'Security' }).click();

  await expect(page.getByText('Expose live Feather sessions to local MCP clients with token-protected full-control tools.')).toBeVisible();
  await expect(page.getByText('Sessions, runtime state, and plugin catalog/live state')).toBeVisible();
  // The creative tools are Studio's half of the one MCP server, not Inspector's.
  await expect(page.getByText('served by Feather Studio through the same')).toBeVisible();
  await expect(page.getByLabel('Enable MCP access')).toBeDisabled();
  await expect(page.getByText('Unavailable')).toBeVisible();
});

test('settings CLI project actions use the Tauri job bridge with previews, confirmation, failures, and cancellation', async ({
  page,
}) => {
  await seedNoSession(page);
  await page.addInitScript(() => {
    type EventCallback = (event: { id: number; event: string; payload: unknown }) => void;
    type CliJob = {
      id: string;
      kind: string;
      status: string;
      commandPreview: string;
      projectDir: string;
      startedAt: string;
      endedAt?: string;
      exitCode?: number;
      stdoutTail: string;
      stderrTail: string;
      json?: unknown;
      error?: string;
    };

    localStorage.setItem(
      'settings-storage',
      JSON.stringify({
        state: {
          cliProjectDir: '/tmp/feather-cli-project',
        },
        version: 0,
      }),
    );

    const callbacks = new Map<number, EventCallback>();
    const listeners = new Map<string, Map<number, number>>();
    const requests: Array<Record<string, unknown>> = [];
    const jobs = new Map<string, CliJob>();
    let nextCallbackId = 1;
    let nextEventId = 1;
    let nextJobId = 1;

    window.confirm = () => true;

    const cli = {
      installed: true,
      path: '/Applications/Feather.app/Contents/MacOS/feather-cli',
      version: '3.3.1',
      source: 'bundled',
      nodeVersion: 'v24.0.0',
      npmVersion: '11.0.0',
      error: null,
      installDocsUrl: 'https://kyonru.github.io/feather/installation/',
      cliDocsUrl: 'https://kyonru.github.io/feather/cli/',
    };

    const emitTauriEvent = (event: string, payload: unknown) => {
      const eventListeners = listeners.get(event);
      if (!eventListeners) return;
      for (const [eventId, callbackId] of eventListeners.entries()) {
        callbacks.get(callbackId)?.({ id: eventId, event, payload });
      }
    };

    const updateJob = (job: CliJob) => {
      jobs.set(job.id, job);
      emitTauriEvent('feather://cli-job', job);
    };

    const makeJob = (request: Record<string, unknown>): CliJob => {
      const kind = String(request.kind ?? 'doctor');
      const projectDir = String(request.projectDir ?? '/tmp/feather-cli-project');
      const id = `job-${nextJobId++}`;
      return {
        id,
        kind,
        status: 'running',
        commandPreview: `feather ${kind} --json`,
        projectDir,
        startedAt: String(Date.now()),
        stdoutTail: '',
        stderrTail: '',
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener(event: string, eventId: number) {
        listeners.get(event)?.delete(eventId);
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {
      transformCallback(callback: EventCallback) {
        const id = nextCallbackId;
        nextCallbackId += 1;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
      invoke(cmd: string, args: Record<string, unknown> = {}) {
        if (cmd === 'plugin:event|listen') {
          const event = String(args.event ?? '');
          const handler = Number(args.handler);
          const eventId = nextEventId;
          nextEventId += 1;
          const eventListeners = listeners.get(event) ?? new Map<number, number>();
          eventListeners.set(eventId, handler);
          listeners.set(event, eventListeners);
          return Promise.resolve(eventId);
        }
        if (cmd === 'plugin:event|unlisten') {
          const event = String(args.event ?? '');
          const eventId = Number(args.eventId);
          listeners.get(event)?.delete(eventId);
          return Promise.resolve();
        }
        if (cmd === 'get_cli_status') return Promise.resolve(cli);
        if (cmd === 'get_local_ips') return Promise.resolve([]);
        if (cmd === 'get_cli_project_status') {
          return Promise.resolve({
            cli,
            projectDir: '/tmp/feather-cli-project',
            doctor: { warnings: 1, failures: 0, checks: [{ severity: 'warn', group: 'Runtime', label: 'Config', detail: 'Needs review' }] },
            buildDoctor: { warnings: 0, failures: 0, checks: [] },
            vendors: { vendors: [{ target: 'web', valid: false, exists: false }] },
            errors: [],
          });
        }
        if (cmd === 'start_cli_job') {
          const request = (args.request ?? {}) as Record<string, unknown>;
          requests.push(request);
          const job = makeJob(request);
          jobs.set(job.id, job);
          if (request.kind === 'packageInstall') {
            setTimeout(() => {
              updateJob({
                ...job,
                status: 'succeeded',
                endedAt: String(Date.now()),
                exitCode: 0,
                json: { dryRun: request.dryRun === true, installed: request.dryRun ? [] : [{ id: 'anim8' }] },
              });
            }, 0);
          } else if (request.kind === 'doctor') {
            setTimeout(() => {
              updateJob({
                ...job,
                status: 'failed',
                endedAt: String(Date.now()),
                exitCode: 1,
                stderrTail: 'doctor failed',
                error: 'Doctor failed',
              });
            }, 0);
          }
          return Promise.resolve(job);
        }
        if (cmd === 'cancel_cli_job') {
          const jobId = String(args.jobId ?? '');
          const job = jobs.get(jobId);
          const cancelled: CliJob = {
            ...(job ?? makeJob({ kind: 'skillsInstall' })),
            id: jobId,
            status: 'cancelled',
            endedAt: String(Date.now()),
            error: 'CLI job cancelled.',
          };
          updateJob(cancelled);
          return Promise.resolve(cancelled);
        }
        return Promise.resolve(null);
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_CLI_ACTION_E2E__ = { requests };
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await page.getByRole('tab', { name: 'CLI' }).click();

  await expect(page.getByRole('heading', { name: 'CLI Backend' })).toBeVisible();
  await expect(page.getByText('CLI installed')).toBeVisible();
  await expect(page.getByText('bundled')).toBeVisible();
  await expect(page.getByLabel('Project Directory')).toHaveValue('/tmp/feather-cli-project');
  await expect(page.getByText('Build Vendors', { exact: true })).toBeVisible();
  await expect(page.getByText('web')).toBeVisible();

  const packages = page.getByTestId('cli-action-card-packages');
  const jobsPanel = page.getByTestId('cli-jobs-panel');
  await packages.locator('input').first().fill('anim8');
  await packages.getByRole('button', { name: 'Plan' }).click();
  await expect(jobsPanel.getByText('succeeded')).toBeVisible();
  await jobsPanel.locator('details').first().evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
  await expect(jobsPanel.locator('pre').first()).toContainText('"dryRun": true');

  await packages.getByRole('button', { name: 'Install' }).click();
  await jobsPanel.locator('details').first().evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
  await expect(jobsPanel.locator('pre').first()).toContainText('"id": "anim8"');

  await page.getByTestId('cli-action-card-health').getByRole('button', { name: 'Doctor' }).click();
  await expect(jobsPanel.getByText('Doctor failed', { exact: true })).toBeVisible();

  await page.getByTestId('cli-action-card-plugins-skills').getByRole('button', { name: 'Skill Plan' }).click();
  await expect(jobsPanel.getByText('running', { exact: true })).toBeVisible();
  await jobsPanel.getByRole('button', { name: 'Cancel' }).click();
  await expect(jobsPanel.getByText('cancelled', { exact: true })).toBeVisible();

  const requests = await page.evaluate(
    () => (window as unknown as { __FEATHER_CLI_ACTION_E2E__?: { requests: Array<Record<string, unknown>> } }).__FEATHER_CLI_ACTION_E2E__?.requests ?? [],
  );
  expect(requests).toContainEqual(
    expect.objectContaining({ kind: 'packageInstall', projectDir: '/tmp/feather-cli-project', dryRun: true }),
  );
  expect(requests).toContainEqual(
    expect.objectContaining({ kind: 'packageInstall', projectDir: '/tmp/feather-cli-project', confirmed: true }),
  );
});

test('persists expanded theme variants and can return to system mode', async ({ page }) => {
  await seedNoSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await page.getByRole('tab', { name: 'General' }).click();

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Noctis Uva' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'noctis-uva');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#292640');

  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'noctis-uva');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#292640');

  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: '2017 Light (Visual Studio - C/C++)' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'vs-cpp-2017-light');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#ffffff');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Tokyo Night Light' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'tokyo-night-light');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#e6e7ed');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Absent Light (Rainglow)' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rainglow-absent-light');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()))
    .toBe('#228a96');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Codecourse Contrast (Rainglow)' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rainglow-codecourse-contrast');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()))
    .toBe('#1ea8fc');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'GitHub Light High Contrast' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'github-light-high-contrast');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()))
    .toBe('#0349b4');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'GitHub Dark Dimmed' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'github-dark-dimmed');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#22272e');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'System' }).click();

  const expectedSystemTheme = await page.evaluate(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedSystemTheme);
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${expectedSystemTheme}\\b`));
});

test('keeps tool routes gated until a session is selected', async ({ page }) => {
  await page.goto('/assets');

  await expect(page.getByText('No session connected')).toBeVisible();
  await expect(
    page.getByTestId('sidebar-tool-assets').getByRole('button', { name: 'Assets', exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId('sidebar-tool-compare')).toHaveCount(0);
  await expectNoBrokenText(page);
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
  await expect(page.getByTestId('session-plugin-shader-graph')).toBeVisible();
  await expectNoBrokenText(page);
});

test('session health flags a runtime speaking an unsupported wire protocol', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  // A runtime newer than this desktop build can parse.
  await seedHealthySessionConfig(page, { protocolVersion: 99 });
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByRole('link', { name: 'Session', exact: true }).click();

  const hub = page.getByTestId('session-health-hub');
  await expect(hub).toBeVisible();
  // The verdict and the protocol chip live in the hub; warnings render below it.
  await expect(hub.getByText('Needs attention')).toBeVisible();
  await expect(hub.getByText('v99', { exact: true })).toBeVisible();
  await expect(page.getByText('Protocol mismatch', { exact: true })).toBeVisible();
  // The warning has to say what to actually do about it.
  await expect(page.getByText(/Update the Feather desktop app/)).toBeVisible();
  await expectNoBrokenText(page);
});

test('session health tolerates a runtime that predates protocol negotiation', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  // No protocolVersion at all. Every runtime shipped before negotiation existed
  // looks like this, so it must stay Healthy rather than degrade the verdict.
  await seedHealthySessionConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByRole('link', { name: 'Session', exact: true }).click();

  const hub = page.getByTestId('session-health-hub');
  await expect(hub).toBeVisible();
  await expect(hub.getByText('Healthy')).toBeVisible();
  await expect(page.getByText('Protocol mismatch', { exact: true })).toHaveCount(0);
  await expect(hub.getByText('legacy', { exact: true })).toBeVisible();
  await expect(page.getByText('No urgent session issues detected.', { exact: true })).toBeVisible();
  await expectNoBrokenText(page);
});

test('session health hub tolerates partial config and degraded plugin state', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await seedPartialSessionConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByRole('link', { name: 'Session', exact: true }).click();

  await expect(page.getByTestId('session-health-hub')).toBeVisible();
  await expect(page.getByText('Recommended Next Actions')).toBeVisible();
  await expect(page.getByText('Disabled 1')).toBeVisible();
  await expect(page.getByText('Incompatible 1')).toBeVisible();
  await expect(page.getByTestId('session-plugin-console')).toBeVisible();
  await expectNoBrokenText(page);
  await expectNarrowStable(page, 'session-health-partial-narrow.png', ['Recommended Next Actions', 'Plugins']);
});

test('session health hub surfaces security, debugger, plugin, hot reload, and performance actions', async ({
  page,
}) => {
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
  await expectNoBrokenText(page);

  await page.setViewportSize(NARROW_VIEWPORT);
  await expect(hub).toBeVisible();
  await expect(page.getByText('Recommended Next Actions')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Packages' })).toBeVisible();
  await page.screenshot({ path: 'test-results/session-health-hub-narrow.png', fullPage: true });
});

test('shows compare only when two connected sessions are available', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByTestId('sidebar-tool-compare')).toHaveCount(0);

  await page.goto('/compare');
  await expect(page.getByText('Compare needs at least two connected sessions')).toBeVisible();

  await seedTwoConnectedSessions(page);
  await page.reload();
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await seedCompareData(page);

  const sessionTool = page.getByTestId('sidebar-tool-session');
  const compareTool = page.getByTestId('sidebar-tool-compare');
  await expect(compareTool.getByRole('link', { name: 'Compare', exact: true })).toBeVisible();
  const sessionBox = await sessionTool.boundingBox();
  const compareBox = await compareTool.boundingBox();
  expect(sessionBox).not.toBeNull();
  expect(compareBox).not.toBeNull();
  expect(compareBox!.y).toBeGreaterThan(sessionBox!.y);

  await compareTool.getByRole('link', { name: 'Compare', exact: true }).click();
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
  await expectNoBrokenText(page);
  await page.screenshot({ path: 'test-results/compare-layout-desktop.png', fullPage: true });

  await page.setViewportSize(NARROW_VIEWPORT);
  await expect(page.getByText('Showing 1')).toBeVisible();
  await page.screenshot({ path: 'test-results/compare-layout-narrow.png', fullPage: true });
});

test('compare degraded matrix renders partial payloads without broken deltas', async ({ page }) => {
  await seedTwoConnectedSessions(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await seedPartialCompareData(page);

  await page.getByRole('link', { name: /Compare/ }).click();
  await expectPrimarySurfaceVisible(page, ['Total 2', 'Equal 1', 'Only B 1', 'FPS —', 'Mem —', 'Texture —']);
  await expect(page.getByText('only.other')).toBeVisible();
  await expectNoBrokenText(page);
  await expectNarrowStable(page, 'compare-partial-payload-narrow.png', ['Total 2', 'FPS —']);
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
  await expectNoBrokenText(page);

  await page.getByTitle('Chart draw calls').click();
  await expect(page.getByText('Draw Calls').first()).toBeVisible();

  await page.setViewportSize(NARROW_VIEWPORT);
  await expect(page.getByTestId('performance-verdicts')).toBeVisible();
  await expect(page.getByText('Recent Spikes', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/performance-health-narrow.png', fullPage: true });

  await page.setViewportSize({ width: 1180, height: 760 });
  await page.getByRole('tab', { name: 'Overhead' }).click();
  await expect(page.getByTestId('feather-overhead-panel')).toBeVisible();
  await expect(page.getByText('Runtime Cost')).toBeVisible();
  await expect(page.getByText('runtime-snapshot')).toBeVisible();
});

test('performance and core profiler degraded matrix handles partial samples', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/performance');
  await seedMissingProfilerConfig(page);
  await seedPartialPerformanceData(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByTestId('performance-verdicts')).toBeVisible();
  await expect(page.getByText('Recent Spikes', { exact: true })).toBeVisible();
  await expectNoBrokenText(page);

  await page.getByRole('tab', { name: 'Profiler' }).click();
  await expect(page.getByRole('button', { name: 'Record Capture' })).toBeVisible();
  await expect(page.getByText('No profiler samples collected yet')).toBeVisible();
  await expect(page.getByText('No hotspots yet')).toBeVisible();
  await expectNoBrokenText(page);
  await expectNarrowStable(page, 'performance-profiler-empty-narrow.png', ['No profiler samples collected yet']);
});

test('core profiler ignores legacy disabled plugin config', async ({ page }) => {
  await seedSession(page);
  await page.goto('/performance');
  await seedDisabledProfilerConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByRole('tab', { name: 'Profiler' }).click();

  await expect(page.getByRole('button', { name: 'Record Capture' })).toBeVisible();
  await expect(page.getByText('No profiler samples collected yet')).toBeVisible();
  await expectNoBrokenText(page);
});

test('profiler filters wrap without horizontal overflow', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('/performance');
  await seedHealthySessionConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    const frameRow = {
      name: 'game.update',
      group: 'game',
      percent: 68.5,
      callsPerSecond: 60,
      calls: 120,
      totalTimeRaw: 0.034,
      totalTime: '34.0 ms',
      avgTimeRaw: 0.00028,
      avgTime: '0.3 ms',
      minTimeRaw: 0.0001,
      minTime: '0.1 ms',
      maxTimeRaw: 0.0011,
      maxTime: '1.1 ms',
    };
    client?.setQueryData(['demo', 'profiler'], {
      type: 'profiler',
      data: [
        frameRow,
        {
          ...frameRow,
          name: 'effects.shader.pass',
          group: 'render',
          percent: 31.5,
          calls: 44,
        },
      ],
      recording: true,
      captureElapsed: 3.2,
      totalCapturedTime: 0.054,
      snapshots: [{ label: 'Before', rows: { 'game.update': frameRow } }],
    });
  });

  await page.getByRole('tab', { name: 'Profiler' }).click();
  const filters = page.locator('#filters-container-row');

  await expect(page.getByTestId('profiler-capture-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish Capture' })).toBeVisible();
  await expect(page.getByTestId('profiler-hotspots')).toBeVisible();
  await expect(page.getByTestId('profiler-hotspot-game.update')).toBeVisible();
  await page.getByTestId('profiler-hotspot-effects.shader.pass').click();
  await expect(page.getByTestId('profiler-run-comparison-drawer')).toBeVisible();
  await expect(page.getByPlaceholder('Search functions...')).toHaveValue('effects.shader.pass');
  await expect(page.getByRole('cell', { name: 'game.update' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Search functions...').fill('');
  await expect(filters).toBeVisible();
  await expect(page.getByPlaceholder('Search functions...')).toBeVisible();
  await expect(page.getByLabel('Profiler group filter')).toBeVisible();
  await expect(page.getByLabel('Profiler diff snapshot')).toBeVisible();
  await expect(page.getByLabel('Hide one-call entries')).toBeVisible();
  await expect.poll(() => filters.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const controlMetrics = await filters.evaluate((element) => {
    const selectors = [
      'input[placeholder="Search functions..."]',
      '#profiler-group-filter',
      '#profiler-sort',
      '#profiler-diff-snapshot',
      '#profiler-min-total',
      '#profiler-min-avg',
      '[data-testid="profiler-hide-one-call-control"]',
    ];

    return selectors.map((selector) => {
      const target = element.querySelector(selector);
      if (!(target instanceof HTMLElement)) {
        return { top: -1, height: -1 };
      }
      const rect = target.getBoundingClientRect();
      return { top: Math.round(rect.top), height: Math.round(rect.height) };
    });
  });
  expect(controlMetrics.every(({ top }) => top >= 0)).toBe(true);
  const controlHeights = controlMetrics.map(({ height }) => height);
  expect(Math.max(...controlHeights) - Math.min(...controlHeights)).toBeLessThanOrEqual(2);
  expect(controlMetrics[0].top).toBeLessThan(controlMetrics[1].top);
  const secondRowTops = controlMetrics.slice(1, 5).map(({ top }) => top);
  const thirdRowTops = controlMetrics.slice(5).map(({ top }) => top);
  expect(Math.max(...secondRowTops) - Math.min(...secondRowTops)).toBeLessThanOrEqual(1);
  expect(Math.max(...thirdRowTops) - Math.min(...thirdRowTops)).toBeLessThanOrEqual(1);
  await expectNoBrokenText(page);
});

test('profiler run comparison drawer compares exact function executions', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/performance');
  await seedHealthySessionConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    const samples = [
      { id: 1, index: 1, startedAt: 0, endedAt: 0.0018, durationRaw: 0.0018 },
      { id: 2, index: 2, startedAt: 0.01, endedAt: 0.0111, durationRaw: 0.0011 },
      { id: 3, index: 3, startedAt: 0.02, endedAt: 0.0242, durationRaw: 0.0042 },
      ...Array.from({ length: 45 }, (_, index) => {
        const run = index + 4;
        const startedAt = run * 0.01;
        const durationRaw = 0.0015 + run * 0.00001;
        return { id: run, index: run, startedAt, endedAt: startedAt + durationRaw, durationRaw };
      }),
    ];
    const row = {
      name: 'love.keypressed',
      group: 'love',
      percent: 72,
      callsPerSecond: 12,
      calls: 3,
      totalTimeRaw: 0.0071,
      totalTime: '7.100 ms',
      avgTimeRaw: 0.002366,
      avgTime: '2.366 ms',
      minTimeRaw: 0.0011,
      minTime: '1.100 ms',
      maxTimeRaw: 0.0042,
      maxTime: '4.200 ms',
      samples,
    };
    client?.setQueryData(['demo', 'profiler'], {
      type: 'profiler',
      data: [
        row,
        {
          name: 'aggregate.only',
          group: 'debug',
          percent: 28,
          callsPerSecond: 4,
          calls: 2,
          totalTimeRaw: 0.002,
          totalTime: '2.000 ms',
          avgTimeRaw: 0.001,
          avgTime: '1.000 ms',
          minTimeRaw: 0.0008,
          minTime: '0.800 ms',
          maxTimeRaw: 0.0012,
          maxTime: '1.200 ms',
        },
      ],
      recording: false,
      captureElapsed: 1.5,
      totalCapturedTime: 0.0091,
      snapshots: [],
    });
  });

  await page.getByRole('tab', { name: 'Profiler' }).click();
  await page.getByTestId('profiler-hotspot-love.keypressed').click();
  await expect(page.getByTestId('profiler-run-comparison-drawer')).toBeVisible();
  await expect(
    page.getByTestId('profiler-run-comparison-drawer').getByRole('heading', { name: 'love.keypressed' }),
  ).toBeVisible();
  const runStrip = page.getByTestId('profiler-run-strip-scroll');
  await expect(runStrip).toBeVisible();
  await expect.poll(() => runStrip.evaluate((element) => element.scrollWidth > element.clientWidth + 20)).toBe(true);
  const initialRunStripWidth = await runStrip.evaluate((element) => element.scrollWidth);
  await page.getByLabel('Zoom in run strip').click();
  await expect.poll(() => runStrip.evaluate((element) => element.scrollWidth)).toBeGreaterThan(initialRunStripWidth);
  await expect
    .poll(async () =>
      runStrip.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollLeft;
      }),
    )
    .toBeGreaterThan(0);
  await page.getByTestId('profiler-run-sample-1').click();
  await page.getByTestId('profiler-run-sample-3').click();
  await expect(page.getByTestId('profiler-run-comparison-summary')).toContainText('Run 1 -> Run 3');
  await expect(page.getByTestId('profiler-run-comparison-summary')).toContainText('Delta +2.400 ms');
  await expect(page.getByTestId('profiler-run-comparison-summary')).toContainText('+133.3%');
  await expect(page.getByTestId('profiler-run-comparison-summary')).toContainText('2.33x slower');

  await page.getByLabel('Profiler run baseline').click();
  await page.getByRole('option', { name: 'Median' }).click();
  await expect(page.getByTestId('profiler-run-comparison-summary')).toContainText('Median -> Run 3');
  await page.getByLabel('Profiler run baseline').click();
  await page.getByRole('option', { name: 'Best' }).click();
  await expect(page.getByTestId('profiler-run-comparison-summary')).toContainText('Run 2 -> Run 3');
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Search functions...').fill('');

  await page.getByTestId('profiler-row-aggregate.only').click();
  await expect(page.getByTestId('profiler-run-comparison-drawer')).toBeVisible();
  await expect(page.getByText('Aggregate-only profiler row')).toBeVisible();
});

test('profiler action responses refresh visible capture data', async ({ page }) => {
  await seedTauriConnectedGame(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/performance');
  await expect(page.getByRole('button', { name: /CLI Example/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Profiler' }).click();
  await page.getByRole('button', { name: 'Record Capture' }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
          (item: { message?: { type?: string; action?: string } }) =>
            item.message?.type === 'cmd:profiler' && item.message.action === 'start',
        ).length;
      }),
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_E2E_TAURI__.emitMessage('live-game-session', {
      type: 'profiler',
      data: {
        type: 'profiler',
        data: [],
        recording: true,
        captureElapsed: 0.3,
        totalCapturedTime: 0,
        snapshots: [],
      },
    });
  });
  await page.getByRole('button', { name: 'Finish Capture' }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
          (item: { message?: { type?: string; action?: string } }) =>
            item.message?.type === 'cmd:profiler' && item.message.action === 'stop',
        ).length;
      }),
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_E2E_TAURI__.emitMessage('live-game-session', {
      type: 'profiler',
      data: {
        type: 'profiler',
        data: [
          {
            name: 'game.update',
            group: 'game',
            percent: 100,
            callsPerSecond: 60,
            calls: 120,
            totalTimeRaw: 0.004,
            totalTime: '4.000 ms',
            avgTimeRaw: 0.000033,
            avgTime: '0.033 ms',
            minTimeRaw: 0.00002,
            minTime: '0.020 ms',
            maxTimeRaw: 0.00009,
            maxTime: '0.090 ms',
          },
        ],
        recording: false,
        captureElapsed: 1.2,
        totalCapturedTime: 0.004,
        snapshots: [],
      },
    });
  });

  await page.getByRole('button', { name: 'Save Snapshot' }).click();
  await expect(page.getByRole('dialog', { name: 'Save Profiler Snapshot' })).toBeVisible();
  await page.getByLabel('Snapshot label').fill('Regression capture');
  await page
    .getByRole('dialog', { name: 'Save Profiler Snapshot' })
    .getByRole('button', { name: 'Save Snapshot' })
    .click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? [])
          .filter(
            (item: { message?: { type?: string; action?: string; params?: { label?: string } } }) =>
              item.message?.type === 'cmd:profiler' && item.message.action === 'snapshot',
          )
          .at(-1)?.message?.params?.label;
      }),
    )
    .toBe('Regression capture');

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_E2E_TAURI__.emitMessage('live-game-session', {
      type: 'profiler',
      data: {
        type: 'profiler',
        data: [
          {
            name: 'game.update',
            group: 'game',
            percent: 100,
            callsPerSecond: 60,
            calls: 120,
            totalTimeRaw: 0.004,
            totalTime: '4.000 ms',
            avgTimeRaw: 0.000033,
            avgTime: '0.033 ms',
            minTimeRaw: 0.00002,
            minTime: '0.020 ms',
            maxTimeRaw: 0.00009,
            maxTime: '0.090 ms',
          },
        ],
        recording: false,
        captureElapsed: 1.2,
        totalCapturedTime: 0.004,
        snapshots: [],
      },
    });
  });

  await expect(page.getByText('Capture stopped')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'game.update' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '4.000 ms' })).toBeVisible();
  await expectNoBrokenText(page);
});

test('observability triage controls filter and open observer details', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/observability');
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(
      ['demo', 'observers'],
      [
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
      ],
    );
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
  await expectNoBrokenText(page);
});

test('observability degraded matrix handles empty and partial observers', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/observability');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByText('No observers yet')).toBeVisible();
  await expectNoBrokenText(page);

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(
      ['demo', 'observers'],
      [
        {
          key: 'partial.value',
          value: 'ready',
          type: 'string',
        },
      ],
    );
  });
  await expect(page.getByText('Observers 1')).toBeVisible();
  await expect(page.getByText('partial.value')).toBeVisible();
  await page.getByText('partial.value').click();
  await expect(page.getByText('Observer JSON')).toBeVisible();
  await expectNoBrokenText(page);
  await expectNarrowStable(page, 'observability-partial-narrow.png', ['partial.value']);
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

test('log type badges keep readable foreground colors in dark themes', async ({ page }) => {
  await seedSession(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'settings-storage',
      JSON.stringify({
        state: {
          theme: 'dark',
        },
        version: 0,
      }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(
      ['demo', 'logs'],
      [
        {
          id: 'feather-start-contrast',
          count: 1,
          time: Date.now() / 1000,
          type: 'feather:start',
          str: 'Feather started',
          trace: '',
        },
      ],
    );
  });

  const badge = page.locator('[data-slot="badge"]').filter({ hasText: 'feather:start' }).first();
  await expect(badge).toBeVisible();
  const colors = await badge.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
    };
  });

  expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.color).not.toBe('rgb(255, 255, 255)');
});

test('logs toolbar puts search on its own row when space is tight', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 900, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  const toolbar = page.getByTestId('logs-toolbar');
  const controls = page.getByTestId('logs-toolbar-controls');

  await expect(toolbar).toBeVisible();
  await expect(page.getByPlaceholder('Search logs...')).toBeVisible();
  await expect(controls.getByRole('button', { name: 'All' })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Errors' })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Pause logs' })).toBeVisible();

  const layout = await toolbar.evaluate((element) => {
    const searchElement = element.querySelector('[data-testid="logs-toolbar-search"]');
    const controlsElement = element.querySelector('[data-testid="logs-toolbar-controls"]');
    if (!(searchElement instanceof HTMLElement) || !(controlsElement instanceof HTMLElement)) {
      return null;
    }
    const toolbarRect = element.getBoundingClientRect();
    const searchRect = searchElement.getBoundingClientRect();
    const controlsRect = controlsElement.getBoundingClientRect();
    return {
      searchTop: Math.round(searchRect.top),
      controlsTop: Math.round(controlsRect.top),
      toolbarWidth: Math.round(toolbarRect.width),
      searchWidth: Math.round(searchRect.width),
    };
  });

  expect(layout).not.toBeNull();
  expect(layout!.controlsTop).toBeGreaterThan(layout!.searchTop);
  expect(layout!.searchWidth).toBeGreaterThanOrEqual(layout!.toolbarWidth - 2);
  await expectNoBrokenText(page);
});

test('logs follow tail scrolls to newly appended visible rows', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await page.evaluate(() => {
    const now = Date.now() / 1000;
    const logs = Array.from({ length: 8 }, (_, index) => ({
      id: `tail-${index}`,
      count: 1,
      time: now + index,
      type: 'output',
      str: `Follow tail line ${index}`,
      trace: '',
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(['demo', 'logs'], logs);
  });
  await expect(page.getByText('Follow tail line 7')).toBeVisible();

  await page.evaluate(() => {
    const now = Date.now() / 1000;
    const logs = Array.from({ length: 80 }, (_, index) => ({
      id: `tail-${index}`,
      count: 1,
      time: now + index,
      type: 'output',
      str: `Follow tail line ${index}`,
      trace: '',
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(['demo', 'logs'], logs);
  });

  await expect(page.getByText('Follow tail line 79')).toBeVisible();
});

test('logs restore from persisted history when reopening a saved session', async ({ page }) => {
  await seedSession(page);
  await page.addInitScript(() => {
    const now = Date.now() / 1000;
    const logs = [
      {
        id: '1',
        count: 1,
        time: now,
        firstTime: now,
        lastTime: now,
        type: 'output',
        str: 'Restored after app restart',
        trace: '',
      },
    ];
    localStorage.setItem(
      'feather-log-history-v1',
      JSON.stringify({
        state: {
          logsBySession: {
            demo: {
              logs,
              label: 'Demo Session',
              updatedAt: Date.now(),
            },
          },
          logsByHistoryKey: {
            'root:/tmp/demo': {
              logs,
              label: 'Demo Session',
              updatedAt: Date.now(),
            },
          },
          sessionHistoryKeys: {
            demo: ['root:/tmp/demo', 'session:demo'],
          },
        },
        version: 0,
      }),
    );
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  const restoredLog = page.getByText('Restored after app restart').first();
  await expect(restoredLog).toBeVisible();
  await restoredLog.click();
  await expect(page.getByText('Log Details')).toBeVisible();
  await expect(page.getByRole('code').getByText('Restored after app restart')).toBeVisible();
});

test('live game reconnect promotes stale connecting sessions to the real game session', async ({ page }) => {
  await seedTauriConnectedGame(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /CLI Example/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connecting game/ })).toHaveCount(0);
  await expect(page.getByPlaceholder('Search logs...')).toBeVisible();

  const requestConfigCount = () =>
    page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
        (item: { message?: { type?: string } }) => item.message?.type === 'req:config',
      ).length;
    });

  await expect.poll(requestConfigCount).toBeGreaterThan(0);

  await page.waitForTimeout(2400);
  const stableCount = await requestConfigCount();
  await page.waitForTimeout(2400);
  expect(await requestConfigCount()).toBe(stableCount);
});

test('live game runtime can be suspended and resumed from the session tabs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'settings-storage',
      JSON.stringify({
        state: {
          connectionTimeout: 0.2,
        },
        version: 0,
      }),
    );
  });
  await seedTauriConnectedGame(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /CLI Example/ })).toBeVisible();
  await page.getByRole('button', { name: 'Suspend Feather runtime' }).click();
  await expect(page.getByRole('button', { name: 'Resume Feather runtime' })).toBeVisible();
  await page.waitForTimeout(1300);
  await expect(page.getByRole('button', { name: /CLI Example/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume Feather runtime' })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? [])
          .filter((item: { message?: { type?: string; action?: string } }) => item.message?.type === 'cmd:runtime')
          .map((item: { message?: { action?: string } }) => item.message?.action);
      }),
    )
    .toEqual(expect.arrayContaining(['suspend']));

  await page.getByRole('button', { name: 'Resume Feather runtime' }).click();
  await expect(page.getByRole('button', { name: 'Suspend Feather runtime' })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? [])
          .filter((item: { message?: { type?: string; action?: string } }) => item.message?.type === 'cmd:runtime')
          .map((item: { message?: { action?: string } }) => item.message?.action);
      }),
    )
    .toEqual(expect.arrayContaining(['suspend', 'resume']));
});

test('runtime interest follows active app panels', async ({ page }) => {
  await seedTauriConnectedGame(page);
  await page.goto('/performance');
  await expect(page.getByRole('button', { name: /CLI Example/ })).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
        return commands.some(
          (item: { message?: { type?: string; data?: { features?: Record<string, unknown> } } }) =>
            item.message?.type === 'cmd:runtime:interest' && item.message.data?.features?.profiler === true,
        );
      }),
    )
    .toBe(true);

  await page.getByTestId('sidebar-tool-assets').getByRole('link', { name: 'Assets' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
        const lastInterest = [...commands]
          .reverse()
          .find(
            (item: { message?: { type?: string; data?: { features?: Record<string, unknown> } } }) =>
              item.message?.type === 'cmd:runtime:interest',
          );
        return lastInterest?.message?.data?.features;
      }),
    )
    .toMatchObject({ assets: true, observers: false });
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
        return commands.some((item: { message?: { type?: string } }) => item.message?.type === 'req:assets');
      }),
    )
    .toBe(true);

  // Previously reached through the Particles Playground page. That tool moved to
  // Feather Studio, so this now covers plugin interest through the route that
  // actually still exists.
  await page.goto('/plugins/console');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
        const lastInterest = [...commands]
          .reverse()
          .find(
            (item: { message?: { type?: string; data?: { features?: Record<string, unknown> } } }) =>
              item.message?.type === 'cmd:runtime:interest',
          );
        return lastInterest?.message?.data?.features;
      }),
    )
    .toMatchObject({
      plugins: true,
      pluginIds: expect.arrayContaining(['console']),
    });
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
        return commands.some((item: { message?: { type?: string } }) => item.message?.type === 'req:plugins');
      }),
    )
    .toBe(true);
});









test('assets degraded matrix handles empty and partial catalogs', async ({ page }) => {
  await seedSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/assets');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  await expect(page.getByText('No assets captured yet')).toBeVisible();
  await expectNoBrokenText(page);

  await seedPartialAssetCatalog(page);
  await expect(page.getByText('Textures 1')).toBeVisible();
  await expect(page.getByText('Preview on')).toBeVisible();
  await expect(page.getByText('runtime-texture', { exact: true })).toBeVisible();
  await page.getByText('runtime-texture', { exact: true }).click();
  await expect(page.getByText('Click preview to inspect this asset.')).toBeVisible();
  await expectNoBrokenText(page);
  await expectNarrowStable(page, 'assets-partial-catalog-narrow.png', ['Preview on', 'runtime-texture']);
});

test('a breakpoint problem count can be opened to see which breakpoints', async ({ page }) => {
  // It was a bare badge reading "1 condition error" — a number with no route to
  // which breakpoint, in which file, or why. V4-ENHANCED C3 at the panel level.
  await seedDebuggerSession(page);
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.goto('/debugger');
  await page.getByRole('button', { name: /Demo Session/ }).click();

  const badge = page.getByTestId('breakpoint-issues');
  await expect(badge).toBeVisible();
  await badge.click();

  // The file and line, and the runtime's own reason — not just a count.
  await expect(page.getByText('main.lua:18')).toBeVisible();
  await expect(page.getByText('unexpected symbol near end of expression')).toBeVisible();
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

test('the debugger can be driven from the keyboard while paused', async ({ page }) => {
  // Half of V4-ENHANCED 6.4's acceptance line: hit a breakpoint, inspect, and
  // step out mostly from the keyboard. Bindings that exist but do not fire are
  // worse than none, because the tooltip promises them.
  await seedDebuggerProbeSession(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/debugger');
  await expect(page.getByText('Paused')).toBeVisible();

  const sent = async () =>
    page.evaluate(() => {
      const commands =
        (window as unknown as { __FEATHER_E2E_TAURI__?: { commands?: Array<{ message?: { type?: string } }> } })
          .__FEATHER_E2E_TAURI__?.commands ?? [];
      return commands.map((item) => item.message?.type).filter(Boolean);
    });

  await page.keyboard.press('F10');
  await expect.poll(sent).toContain('cmd:debugger:step_over');

  await page.keyboard.press('F11');
  await expect.poll(sent).toContain('cmd:debugger:step_into');

  await page.keyboard.press('Shift+F11');
  await expect.poll(sent).toContain('cmd:debugger:step_out');

  await page.keyboard.press('F8');
  await expect.poll(sent).toContain('cmd:debugger:continue');
});

test('a breakpoint and its condition can be set from the keyboard while paused', async ({ page }) => {
  // Completes 6.4's acceptance line. The gutter is one button per line, so
  // reaching line 1,847 of a real main.lua by tabbing is not a path anyone
  // takes — F9 and Shift+F9 act on the line you are already paused at.
  await seedDebuggerProbeSession(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/debugger');
  await expect(page.getByText('Paused')).toBeVisible();

  const breakpointCount = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('feather-debugger');
      return raw ? (JSON.parse(raw).state.breakpoints ?? []).length : 0;
    });

  const before = await breakpointCount();

  // A toggle, not a one-way add.
  await page.keyboard.press('F9');
  await expect.poll(breakpointCount).toBe(before + 1);
  await page.keyboard.press('F9');
  await expect.poll(breakpointCount).toBe(before);

  // Shift+F9 opens the condition editor for the paused line.
  await page.keyboard.press('Shift+F9');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/condition/i).first()).toBeVisible();
});

test('debugger shortcuts stay out of the way while typing', async ({ page }) => {
  // A stepping key that fires while you are writing a breakpoint condition
  // would be its own bug, so the guard is worth pinning.
  await seedDebuggerProbeSession(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/debugger');
  await expect(page.getByText('Paused')).toBeVisible();

  const before = await page.evaluate(
    () =>
      ((window as unknown as { __FEATHER_E2E_TAURI__?: { commands?: unknown[] } }).__FEATHER_E2E_TAURI__?.commands ?? [])
        .length,
  );

  // The variable filter in the inspector panel: a plain text field that is
  // always present while paused.
  const filter = page.getByPlaceholder('filter…').first();
  await filter.fill('player');
  await expect(filter).toBeFocused();
  await page.keyboard.press('F10');
  await page.waitForTimeout(250);

  const after = await page.evaluate(
    () =>
      ((window as unknown as { __FEATHER_E2E_TAURI__?: { commands?: unknown[] } }).__FEATHER_E2E_TAURI__?.commands ?? [])
        .length,
  );
  expect(after, 'a stepping key fired while typing in a text field').toBe(before);
});

test('debugger profiler probes sync and cycle from the gutter', async ({ page }) => {
  await seedDebuggerProbeSession(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/debugger');

  await page.getByRole('button', { name: /CLI Example/ }).click();
  const sourcePanel = page.getByTestId('debugger-source-panel');
  await expect(sourcePanel.getByText('1 probe')).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const commands =
          (
            window as unknown as {
              __FEATHER_E2E_TAURI__?: {
                commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }>;
              };
            }
          ).__FEATHER_E2E_TAURI__?.commands ?? [];
        const command = commands.find((item) => item.message?.type === 'cmd:debugger:set_profiler_probes');
        return command?.message?.data?.probes;
      }),
    )
    .toEqual([{ file: 'main.lua', line: 4, kind: 'start' }]);

  const lineThreeProbe = page.getByTestId('debugger-profiler-probe-button-3');
  await lineThreeProbe.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Profile function here' }).click();
  await expect(lineThreeProbe).toHaveAttribute('title', 'Profile function here');
  await expect(sourcePanel.getByText('2 probes')).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const commands =
          (
            window as unknown as {
              __FEATHER_E2E_TAURI__?: {
                commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }>;
              };
            }
          ).__FEATHER_E2E_TAURI__?.commands ?? [];
        const probeCommands = commands.filter((item) => item.message?.type === 'cmd:debugger:set_profiler_probes');
        return probeCommands.at(-1)?.message?.data?.probes;
      }),
    )
    .toEqual([
      { file: 'main.lua', line: 4, kind: 'start' },
      { file: 'main.lua', line: 3, kind: 'wrap', label: 'love.update', target: 'love.update' },
    ]);

  await page.getByTestId('debugger-profiler-probe-button-1').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Profile function here' }).click();
  await expect(page.getByText('Only global/table functions can be profiled automatically.')).toBeVisible();

  const lineFiveProbe = page.getByTestId('debugger-profiler-probe-button-5');
  await lineFiveProbe.click();
  await expect(lineFiveProbe).toHaveAttribute('title', 'Start profiling here');
  await expect(sourcePanel.getByText('3 probes')).toBeVisible();

  await lineFiveProbe.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Snapshot here' }).click();
  await expect(lineFiveProbe).toHaveAttribute('title', 'Snapshot here');

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const commands =
          (
            window as unknown as {
              __FEATHER_E2E_TAURI__?: {
                commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }>;
              };
            }
          ).__FEATHER_E2E_TAURI__?.commands ?? [];
        const probeCommands = commands.filter((item) => item.message?.type === 'cmd:debugger:set_profiler_probes');
        return probeCommands.at(-1)?.message?.data?.probes;
      }),
    )
    .toEqual([
      { file: 'main.lua', line: 4, kind: 'start' },
      { file: 'main.lua', line: 3, kind: 'wrap', label: 'love.update', target: 'love.update' },
      { file: 'main.lua', line: 5, kind: 'snapshot' },
    ]);

  await lineFiveProbe.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove probe' }).click();
  await expect(lineFiveProbe).toHaveAttribute('title', 'Add profiler probe');
  await expect(sourcePanel.getByText('2 probes')).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const commands =
          (
            window as unknown as {
              __FEATHER_E2E_TAURI__?: {
                commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }>;
              };
            }
          ).__FEATHER_E2E_TAURI__?.commands ?? [];
        const probeCommands = commands.filter((item) => item.message?.type === 'cmd:debugger:set_profiler_probes');
        return probeCommands.at(-1)?.message?.data?.probes;
      }),
    )
    .toEqual([
      { file: 'main.lua', line: 4, kind: 'start' },
      { file: 'main.lua', line: 3, kind: 'wrap', label: 'love.update', target: 'love.update' },
    ]);

  await lineFiveProbe.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Snapshot here' }).click();
  await expect(lineFiveProbe).toHaveAttribute('title', 'Snapshot here');

  await page.reload();
  await page.getByRole('button', { name: /CLI Example/ }).click();
  await page.getByRole('button', { name: 'main.lua' }).click();
  await expect(page.getByTestId('debugger-profiler-probe-button-5')).toHaveAttribute('title', 'Snapshot here');
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
    client?.setQueryData(
      ['demo', 'observers'],
      [{ key: 'console.player_health', value: '100', type: 'number', changed: false, history: [], group: 'console' }],
    );
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
  await page.getByLabel('Command Center search').fill('feel inspector');
  await expect(
    page.getByTestId('command-center-row').filter({ hasText: '/plugins/feel-inspector' }).first(),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/plugins\/feel-inspector$/);

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
  const secondSessionRow = page
    .getByTestId('command-center-row')
    .filter({ hasText: 'Switch to Second Session' })
    .first();
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
