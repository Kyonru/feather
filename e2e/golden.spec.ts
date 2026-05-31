import { expect, test, type Page } from '@playwright/test';

type TauriCommand = {
  sessionId: string;
  message: {
    type?: string;
    action?: string;
    plugin?: string;
    id?: string;
    code?: string;
    data?: {
      features?: Record<string, unknown>;
      probes?: unknown[];
    };
    params?: Record<string, unknown>;
  };
};

const GOLDEN_SESSION_ID = 'golden-session';

async function seedGoldenTauriSession(page: Page) {
  await page.addInitScript(() => {
    type EventCallback = (event: { id: number; event: string; payload: unknown }) => void;
    const GOLDEN_SESSION_ID = 'golden-session';

    localStorage.setItem('feather-e2e-query-client', '1');
    localStorage.setItem(
      'settings-storage',
      JSON.stringify({
        state: {
          apiKey: 'golden-api-key',
          connectionTimeout: 0.2,
        },
        version: 0,
      }),
    );
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
    localStorage.setItem(
      'feather-debugger',
      JSON.stringify({
        state: {
          breakpoints: [{ file: 'main.lua', line: 4, enabled: true }],
          profilerProbes: [{ file: 'main.lua', line: 5, kind: 'start', enabled: true }],
          defaultEnabled: true,
          rootPaths: {},
          pausedState: {
            [GOLDEN_SESSION_ID]: {
              pauseId: 11,
              file: 'main.lua',
              line: 4,
              reason: 'breakpoint',
              stack: [{ index: 0, file: 'main.lua', line: 4, name: 'love.update', what: 'Lua' }],
              locals: {},
              upvalues: {},
            },
          },
          enabled: { [GOLDEN_SESSION_ID]: true },
          pauseOnError: { [GOLDEN_SESSION_ID]: true },
          status: {
            [GOLDEN_SESSION_ID]: {
              enabled: true,
              paused: true,
              pauseOnError: true,
              sourceRoot: '/tmp/golden-game',
              breakpointCount: 1,
              profilerProbeCount: 1,
              rejectedBreakpoints: [],
              rejectedProfilerProbes: [],
              breakpointErrors: [],
            },
          },
          breakpointErrors: { [GOLDEN_SESSION_ID]: [] },
        },
        version: 0,
      }),
    );

    (globalThis as unknown as { isTauri?: boolean }).isTauri = true;
    (window as unknown as { __FEATHER_E2E_SOURCE_FILES__?: Record<string, string> }).__FEATHER_E2E_SOURCE_FILES__ = {
      '/tmp/golden-game/main.lua': [
        'local player = { health = 100 }',
        '',
        'function love.update(dt)',
        '  player.health = player.health - dt',
        '  if player.health < 0 then',
        '    player.health = 100',
        '  end',
        'end',
        '',
        'function love.draw()',
        '  love.graphics.print(player.health, 16, 16)',
        'end',
      ].join('\n'),
    };

    const activeSessions = [GOLDEN_SESSION_ID];
    const callbacks = new Map<number, EventCallback>();
    const listeners = new Map<string, Map<number, number>>();
    const commands: TauriCommand[] = [];
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
                console: {
                  tabName: 'Console',
                  icon: 'terminal',
                  capabilities: [],
                  sandbox: true,
                },
                'shader-graph': {
                  tabName: 'Shader Graph',
                  icon: 'blend',
                  capabilities: [],
                },
                'particle-system-playground': {
                  tabName: 'Particles Playground',
                  icon: 'sparkles',
                  capabilities: [],
                },
              },
              root_path: '/tmp/golden-game',
              sourceDir: '/tmp/golden-game',
              version: '2.0.0',
              API: 5,
              sampleRate: 1,
              outfile: '',
              language: 'lua',
              captureScreenshot: false,
              location: '/tmp/golden-game',
              sessionName: 'Golden Game',
              capabilities: [],
              security: { appIdRequired: true },
              sysInfo: { os: 'MacOS', arch: 'arm64', cpuCount: 8, loveVersion: '11.5' },
              debugger: {
                enabled: true,
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

    (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__?: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener(event: string, eventId: number) {
        listeners.get(event)?.delete(eventId);
      },
    };

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
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
        const sourceFiles = ((window as unknown as { __FEATHER_E2E_SOURCE_FILES__?: Record<string, string> })
          .__FEATHER_E2E_SOURCE_FILES__) ?? {};
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
          const message = JSON.parse(String(args.message ?? '{}')) as TauriCommand['message'];
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

    (window as unknown as {
      __FEATHER_GOLDEN_TAURI__?: {
        commands: TauriCommand[];
        emitMessage: (sessionId: string, message: Record<string, unknown>) => void;
      };
    }).__FEATHER_GOLDEN_TAURI__ = {
      commands,
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

async function emitGoldenMessage(page: Page, message: Record<string, unknown>) {
  await page.evaluate(
    ({ sessionId, payload }) => {
      (window as unknown as {
        __FEATHER_GOLDEN_TAURI__?: {
          emitMessage: (targetSessionId: string, targetMessage: Record<string, unknown>) => void;
        };
      }).__FEATHER_GOLDEN_TAURI__?.emitMessage(sessionId, payload);
    },
    { sessionId: GOLDEN_SESSION_ID, payload: message },
  );
}

async function getGoldenCommands(page: Page): Promise<TauriCommand[]> {
  return page.evaluate(() => {
    return ((window as unknown as { __FEATHER_GOLDEN_TAURI__?: { commands?: TauriCommand[] } })
      .__FEATHER_GOLDEN_TAURI__?.commands ?? []) as TauriCommand[];
  });
}

async function expectCommand(page: Page, predicate: (command: TauriCommand) => boolean) {
  await expect.poll(async () => (await getGoldenCommands(page)).some(predicate)).toBe(true);
}

async function expectNoBrokenText(page: Page) {
  const body = page.locator('body');
  await expect(body).not.toContainText('NaN');
  await expect(body).not.toContainText('undefined');
  await expect(body).not.toContainText('Infinity');
}

function performancePayload() {
  return {
    time: 3,
    gameTime: 3,
    vsyncEnabled: true,
    fps: 48,
    frameTime: 0.021,
    frameTimeMin: 0.015,
    frameTimeMax: 0.034,
    frameTimeAvg: 0.019,
    memory: 72,
    peakMemory: 78,
    diskUsage: 0,
    sysInfo: { os: 'MacOS', arch: 'arm64', cpuCount: 8 },
    stats: {
      drawcallsbatched: 32,
      canvasswitches: 1,
      shaderswitches: 1,
      canvases: 2,
      images: 6,
      fonts: 1,
      texturememory: 42,
      drawcalls: 420,
    },
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
    featherOverhead: {
      windowSeconds: 1,
      frameCount: 60,
      avgMsPerFrame: 0.22,
      messages: 6,
      serializedBytes: 8192,
      binaryBytes: 0,
      deferredTasks: 1,
      budgetMisses: { time: 0, bytes: 0 },
      budget: {
        maxFrameMs: 0.5,
        maxMessagesPerFrame: 20,
        maxSerializedBytesPerFrame: 32768,
      },
      plugins: [
        {
          id: 'observer',
          update: { totalMs: 0.18, avgMs: 0.03, maxMs: 0.05, count: 6 },
          payload: { totalMs: 0.4, avgMs: 0.4, maxMs: 0.4, count: 1 },
        },
      ],
    },
  };
}

test('golden connect and session health recover stale connecting sessions', async ({ page }) => {
  await seedGoldenTauriSession(page);
  await page.goto('/session');

  await expect(page.getByRole('button', { name: /Golden Game/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connecting game/ })).toHaveCount(0);
  await expectCommand(page, (command) => command.message.type === 'req:config');

  await page.getByRole('button', { name: 'Suspend Feather runtime' }).click();
  await expectCommand(page, (command) => command.message.type === 'cmd:runtime' && command.message.action === 'suspend');
  await emitGoldenMessage(page, { type: 'runtime:suspended', data: { suspended: true } });
  await expect(page.getByRole('button', { name: 'Resume Feather runtime' })).toBeVisible();

  await page.getByRole('button', { name: 'Resume Feather runtime' }).click();
  await expectCommand(page, (command) => command.message.type === 'cmd:runtime' && command.message.action === 'resume');
  await emitGoldenMessage(page, { type: 'runtime:suspended', data: { suspended: false } });
  await expect(page.getByRole('button', { name: 'Suspend Feather runtime' })).toBeVisible();
  await expectNoBrokenText(page);
});

test('golden logs and error history handle batches, follow tail, search, and clear', async ({ page }) => {
  await seedGoldenTauriSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Golden Game/ })).toBeVisible();
  await expect(page.getByPlaceholder('Search logs...')).toBeVisible();
  const now = Date.now() / 1000;
  await emitGoldenMessage(page, {
    type: 'logs',
    data: [
      {
        type: 'log',
        data: { id: 'golden-log-1', count: 1, time: now, type: 'output', str: 'Golden normal log', trace: '' },
      },
      {
        type: 'log',
        data: { id: 'golden-error-1', count: 1, time: now + 0.1, type: 'error', str: 'Golden immediate error', trace: 'main.lua:4' },
      },
      {
        type: 'log:update',
        data: { id: 'golden-log-1', count: 2, time: now + 0.2, lastTime: now + 0.2 },
      },
    ],
  });

  await expect(page.getByText('Golden normal log')).toBeVisible();
  await expect(page.getByText('Golden immediate error')).toBeVisible();
  await page.getByPlaceholder('Search logs...').fill('immediate');
  await expect(page.getByText('Golden immediate error')).toBeVisible();
  await expect(page.getByText('Golden normal log')).toHaveCount(0);
  await page.getByPlaceholder('Search logs...').fill('');

  await emitGoldenMessage(page, {
    type: 'logs',
    data: Array.from({ length: 40 }, (_, index) => ({
      type: 'log',
      data: {
        id: `golden-tail-${index}`,
        count: 1,
        time: now + index + 1,
        type: 'output',
        str: `Golden tail line ${index}`,
        trace: '',
      },
    })),
  });
  await expect(page.getByText('Golden tail line 39')).toBeVisible();

  await page.getByPlaceholder('Search logs...').fill('Golden normal log');
  await page.getByRole('button', { name: 'Clear visible logs' }).click();
  await expectCommand(page, (command) => command.message.type === 'cmd:log' && command.message.action === 'clear');
  await expect(page.getByText('Golden normal log')).toHaveCount(0);
  await expectNoBrokenText(page);
});

test('golden performance overhead and profiler capture refresh on demand', async ({ page }) => {
  await seedGoldenTauriSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/performance');

  await expect(page.getByRole('button', { name: /Golden Game/ })).toBeVisible();
  await emitGoldenMessage(page, { type: 'performance', data: performancePayload() });
  await expect(page.getByTestId('performance-verdicts')).toBeVisible();
  await page.getByRole('tab', { name: 'Overhead' }).click();
  await expect(page.getByTestId('feather-overhead-panel')).toBeVisible();
  await expect(page.getByText('Runtime Cost')).toBeVisible();
  await expect(page.getByText('observer')).toBeVisible();

  await page.getByRole('tab', { name: 'Profiler' }).click();
  await page.getByRole('button', { name: 'Record Capture' }).click();
  await expectCommand(page, (command) => command.message.type === 'cmd:profiler' && command.message.action === 'start');

  await emitGoldenMessage(page, {
    type: 'profiler',
    data: {
      type: 'profiler',
      recording: true,
      captureElapsed: 0.4,
      totalCapturedTime: 0,
      snapshots: [],
      data: [],
    },
  });
  await expect(page.getByRole('button', { name: 'Finish Capture' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish Capture' }).click();
  await expectCommand(page, (command) => command.message.type === 'cmd:profiler' && command.message.action === 'stop');

  await emitGoldenMessage(page, {
    type: 'profiler',
    data: {
      type: 'profiler',
      recording: false,
      captureElapsed: 1.2,
      totalCapturedTime: 0.006,
      snapshots: [],
      data: [
        {
          name: 'love.update',
          group: 'love',
          percent: 100,
          callsPerSecond: 60,
          calls: 3,
          totalTimeRaw: 0.006,
          totalTime: '6.000 ms',
          avgTimeRaw: 0.002,
          avgTime: '2.000 ms',
          minTimeRaw: 0.001,
          minTime: '1.000 ms',
          maxTimeRaw: 0.003,
          maxTime: '3.000 ms',
          samples: [
            { id: 1, index: 1, startedAt: 0, endedAt: 0.001, durationRaw: 0.001 },
            { id: 2, index: 2, startedAt: 0.1, endedAt: 0.103, durationRaw: 0.003 },
          ],
        },
      ],
    },
  });
  await expect(page.getByTestId('profiler-hotspot-love.update')).toBeVisible();
  await page.getByTestId('profiler-hotspot-love.update').click();
  await expect(page.getByTestId('profiler-run-comparison-drawer')).toBeVisible();
  await expect(page.getByTestId('profiler-run-comparison-summary')).toContainText('Run 1 -> Run 2');
  await expectNoBrokenText(page);
});

test('golden debugger breakpoints and profiler probes sync from source gutter', async ({ page }) => {
  await seedGoldenTauriSession(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/debugger');

  await expect(page.getByRole('button', { name: /Golden Game/ })).toBeVisible();
  await expect(page.getByTestId('debugger-source-panel')).toBeVisible();
  await expect(page.getByTestId('debugger-source-panel').getByText('1 probe')).toBeVisible();
  await expectCommand(
    page,
    (command) =>
      command.message.type === 'cmd:debugger:set_profiler_probes'
      && Array.isArray(command.message.data?.probes)
      && command.message.data.probes.length === 1,
  );

  await page.getByTestId('debugger-profiler-probe-button-3').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Profile function here' }).click();
  await expect(page.getByTestId('debugger-profiler-probe-button-3')).toHaveAttribute('title', 'Profile function here');
  await expectCommand(
    page,
    (command) =>
      command.message.type === 'cmd:debugger:set_profiler_probes'
      && Array.isArray(command.message.data?.probes)
      && command.message.data.probes.some((probe) => {
        const value = probe as { kind?: string; target?: string };
        return value.kind === 'wrap' && value.target === 'love.update';
      }),
  );

  await page.getByLabel('Add breakpoint on line 6').click();
  await expectCommand(
    page,
    (command) =>
      command.message.type === 'cmd:debugger:set_breakpoints'
      && Array.isArray(command.message.data?.probes) === false,
  );
  await expectNoBrokenText(page);
});

test('golden runtime inspection refreshes observers assets and console only when panels ask', async ({ page }) => {
  await seedGoldenTauriSession(page);
  await page.setViewportSize({ width: 1180, height: 760 });

  await page.goto('/observability');
  await expect(page.getByRole('button', { name: /Golden Game/ })).toBeVisible();
  await expectCommand(
    page,
    (command) => command.message.type === 'cmd:runtime:interest' && command.message.data?.features?.observers === true,
  );
  await emitGoldenMessage(page, {
    type: 'observe',
    data: [
      { key: 'player.health', value: '100', type: 'number' },
      { key: 'player.state', value: 'idle', type: 'string' },
    ],
  });
  await expect(page.getByText('Observers 2')).toBeVisible();
  await page.getByText('player.health').click();
  await expect(page.getByText('Observer JSON')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();

  await page.getByTestId('sidebar-tool-assets').getByRole('link', { name: 'Assets' }).click();
  await expectCommand(
    page,
    (command) => command.message.type === 'cmd:runtime:interest' && command.message.data?.features?.assets === true,
  );
  await expectCommand(page, (command) => command.message.type === 'req:assets');
  await emitGoldenMessage(page, {
    type: 'assets',
    data: {
      enabled: false,
      textures: [
        {
          id: 1,
          name: 'runtime-texture',
          displayName: 'runtime-texture',
          width: 16,
          height: 16,
          format: 'rgba8',
          mipmaps: 1,
          loadCount: 1,
        },
      ],
      fonts: [],
      audio: [],
      preview: null,
    },
  });
  await expect(page.getByText('Textures 1')).toBeVisible();
  await expect(page.getByText('runtime-texture', { exact: true })).toBeVisible();

  await page.getByTestId('sidebar-tool-console').getByRole('link', { name: 'Console' }).click();
  await expect(page.getByTestId('console-header').getByText('Connected')).toBeVisible();
  await expect(page.getByTestId('console-header').getByText('Plugin enabled')).toBeVisible();
  await page.locator('textarea').last().fill('return player.health');
  await page.getByTitle('Execute Lua').click();
  const findEvalId = async () => {
    const commands = await getGoldenCommands(page);
    return commands.find((command) => command.message.type === 'cmd:eval' && command.message.code === 'return player.health')
      ?.message.id;
  };
  await expect.poll(findEvalId).not.toBeUndefined();
  const evalId = await findEvalId();
  expect(evalId).toBeTruthy();
  await emitGoldenMessage(page, {
    type: 'eval:response',
    id: evalId,
    status: 'success',
    result: '100',
    prints: ['golden console print'],
    values: [],
  });
  await expect(page.getByText('golden console print')).toBeVisible();
  await expectNoBrokenText(page);
});
