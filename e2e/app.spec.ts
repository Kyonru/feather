import { expect, test, type Locator, type Page } from '@playwright/test';
import { shaderPreviewTextureFiles, textureHeavyPreviewGraph } from './helpers/shader-preview-fixture';

const NARROW_VIEWPORT = { width: 900, height: 720 };

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

function multiSelectModifier(): 'Control' | 'Meta' {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

async function uploadShaderPreviewTexture(page: Page, trigger: Locator, file: { name: string; mimeType: string; buffer: Buffer }) {
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 1000 }).catch(() => null);
  await trigger.click({ force: true });
  const fileChooser = await fileChooserPromise;
  if (fileChooser) {
    await fileChooser.setFiles(file);
  } else {
    if ((await page.getByTestId('shader-texture-upload-input').count()) === 0) {
      await trigger.evaluate((element) => (element as HTMLElement).click());
    }
    await page.getByTestId('shader-texture-upload-input').last().setInputFiles(file);
  }
}

async function particlePreviewFrame(page: Page) {
  const iframe = page.locator('iframe[title="Particle Preview"]').first();
  await expect(page.frameLocator('iframe[title="Particle Preview"]').locator('canvas')).toBeVisible();
  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();
  expect(frame).not.toBeNull();
  return frame!;
}

async function particlePreviewStatus(page: Page) {
  const frame = await particlePreviewFrame(page);
  return frame.evaluate(() => {
    type StatusLike = { time?: number; playing?: boolean; mode?: string; particleCount?: number; lastBurstCount?: number };
    type PayloadLike = { composite?: { timelineState?: { time?: number; playing?: boolean }; timeline?: { mode?: string } } };
    const status = (window as Window & { _featherParticlePreviewStatus?: StatusLike })._featherParticlePreviewStatus;
    const payload = (window as Window & { _featherPayload?: PayloadLike })._featherPayload;
    return {
      time: status?.time ?? payload?.composite?.timelineState?.time,
      playing: status?.playing ?? payload?.composite?.timelineState?.playing,
      mode: status?.mode ?? payload?.composite?.timeline?.mode,
      particleCount: status?.particleCount ?? 0,
      lastBurstCount: status?.lastBurstCount ?? 0,
    };
  });
}

async function expectTextureProbePayload(page: Page) {
  const probe = page.locator('.react-flow__node').filter({ hasText: 'Texture Probe' });
  const iframe = probe.locator('iframe[title="Texture Probe love.js preview"]');
  await expect(probe.frameLocator('iframe[title="Texture Probe love.js preview"]').locator('canvas')).toBeVisible();
  const frameHandle = await iframe.elementHandle();
  const frame = await frameHandle?.contentFrame();
  expect(frame).not.toBeNull();
  await expect.poll(async () => frame!.evaluate(() => {
    type UploadLike = { dataBase64?: string; dataKey?: string };
    type PayloadLike = {
      tool?: unknown;
      pixel?: string;
      baseTexture?: UploadLike;
      textures?: UploadLike[];
      textureUniforms?: unknown[];
    };
    type StatusLike = { textureCount?: number; error?: string };
    const payload = (window as Window & { _featherPayload?: PayloadLike })._featherPayload;
    const status = (window as Window & { _featherShaderPreviewStatus?: StatusLike })._featherShaderPreviewStatus;
    return {
      tool: payload?.tool,
      hasPixel: typeof payload?.pixel === 'string' && payload.pixel.includes('noiseTexture') && payload.pixel.includes('maskTexture'),
      hasBaseTexture: Boolean(payload?.baseTexture?.dataBase64 || payload?.baseTexture?.dataKey),
      baseTextureBytes: payload?.baseTexture?.dataBase64?.length
        || (payload?.baseTexture?.dataKey && (window as Window & { _featherUploadCache?: Record<string, string> })._featherUploadCache?.[payload.baseTexture.dataKey]?.length)
        || (payload?.baseTexture?.dataKey && (window.parent as Window & { __featherPreviewUploadCache?: Record<string, string> }).__featherPreviewUploadCache?.[payload.baseTexture.dataKey]?.length)
        || 0,
      textureCount: Array.isArray(payload?.textures)
        ? payload.textures.filter((texture) => texture?.dataBase64 || texture?.dataKey).length
        : 0,
      textureBytes: Array.isArray(payload?.textures)
        ? payload.textures.map((texture) => texture?.dataBase64?.length
          || (texture?.dataKey && (window as Window & { _featherUploadCache?: Record<string, string> })._featherUploadCache?.[texture.dataKey]?.length)
          || (texture?.dataKey && (window.parent as Window & { __featherPreviewUploadCache?: Record<string, string> }).__featherPreviewUploadCache?.[texture.dataKey]?.length)
          || 0)
        : [],
      uniformCount: Array.isArray(payload?.textureUniforms) ? payload.textureUniforms.length : 0,
      runtimeTextureCount: typeof status?.textureCount === 'number' ? status.textureCount : 2,
      runtimeError: status?.error ?? '',
    };
  }), { timeout: 10_000 }).toMatchObject({
    tool: 'shader-graph',
    hasPixel: true,
    hasBaseTexture: true,
    baseTextureBytes: expect.any(Number),
    textureCount: 2,
    textureBytes: [expect.any(Number), expect.any(Number)],
    uniformCount: 2,
    runtimeTextureCount: 2,
    runtimeError: '',
  });
  const payloadStats = await frame!.evaluate(() => {
    type UploadLike = { dataBase64?: string; dataKey?: string };
    type PayloadLike = { baseTexture?: UploadLike; textures?: UploadLike[] };
    const payload = (window as Window & { _featherPayload?: PayloadLike })._featherPayload;
    const iframeCache = (window as Window & { _featherUploadCache?: Record<string, string> })._featherUploadCache;
    const parentCache = (window.parent as Window & { __featherPreviewUploadCache?: Record<string, string> }).__featherPreviewUploadCache;
    return {
      baseTextureBytes: payload?.baseTexture?.dataBase64?.length
        || (payload?.baseTexture?.dataKey && iframeCache?.[payload.baseTexture.dataKey]?.length)
        || (payload?.baseTexture?.dataKey && parentCache?.[payload.baseTexture.dataKey]?.length)
        || 0,
      textureBytes: Array.isArray(payload?.textures)
        ? payload.textures.map((texture) => texture?.dataBase64?.length || (texture?.dataKey && iframeCache?.[texture.dataKey]?.length) || (texture?.dataKey && parentCache?.[texture.dataKey]?.length) || 0)
        : [],
    };
  });
  expect(payloadStats.baseTextureBytes).toBeGreaterThan(0);
  expect(payloadStats.textureBytes.every((length) => length > 0)).toBe(true);
  await expect.poll(async () => frame!.evaluate(async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return { colorBuckets: 0, texturedBuckets: 0 };
    const image = new Image();
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = reject;
    });
    image.src = canvas.toDataURL('image/png');
    await loaded;
    const sampleCanvas = document.createElement('canvas');
    const width = Math.min(canvas.width, 96);
    const height = Math.min(canvas.height, 96);
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    const context = sampleCanvas.getContext('2d');
    if (!context) return { colorBuckets: 0, texturedBuckets: 0 };
    context.drawImage(image, Math.max(0, Math.floor((canvas.width - width) / 2)), Math.max(0, Math.floor((canvas.height - height) / 2)), width, height, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const buckets = new Set<string>();
    const textured = new Set<string>();
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      if (r + g + b < 48) continue;
      const bucket = `${r >> 4}:${g >> 4}:${b >> 4}`;
      buckets.add(bucket);
      if (Math.abs(r - g) > 16 || Math.abs(g - b) > 16 || Math.abs(r - b) > 16) textured.add(bucket);
    }
    return {
      colorBuckets: buckets.size,
      texturedBuckets: textured.size,
      textureVisible: buckets.size > 6 && textured.size > 4,
    };
  }), { timeout: 10_000 }).toMatchObject({
    colorBuckets: expect.any(Number),
    texturedBuckets: expect.any(Number),
    textureVisible: true,
  });
}

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

async function seedHealthySessionConfig(page: Page) {
  await page.evaluate(() => {
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
      version: '3.0.0',
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

async function seedShaderGraphConfig(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'config'], {
      plugins: {
        'shader-graph': {
          tabName: 'Shader Graph',
          icon: 'blend',
          capabilities: [],
        },
      },
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      version: '2.0.0',
      API: 5,
      sampleRate: 1,
      outfile: '',
      language: 'lua',
      captureScreenshot: false,
      location: '/tmp/demo',
      sessionName: 'Demo Session',
    });
  });
}

async function seedParticlePlaygroundConfig(page: Page, sessionId = 'demo') {
  await page.evaluate((targetSession) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData([targetSession, 'config'], {
      plugins: {
        'particle-system-playground': {
          tabName: 'Particles Playground',
          icon: 'sparkles',
          capabilities: [],
        },
      },
      root_path: '/tmp/demo',
      sourceDir: '/tmp/demo',
      version: '2.0.0',
      API: 5,
      sampleRate: 1,
      outfile: '',
      language: 'lua',
      captureScreenshot: false,
      location: '/tmp/demo',
      sessionName: 'Demo Session',
    });
    client?.setQueryData([targetSession, 'plugin', 'particle-system-playground'], {
      type: 'particle-system-playground',
      composites: ['Demo Particles'],
      activeComposite: 'Demo Particles',
      activeSystem: 1,
      data: {
        compositeType: 'scratch',
        x: 400,
        y: 300,
        previewEnabled: true,
        movement: { pattern: 'none', radius: 80, radiusX: 120, radiusY: 60, speed: 1, scale: 1 },
        systems: [
          {
            index: 1,
            title: 'Fire',
            blendMode: 'add',
            enabled: true,
            x: 0,
            y: 0,
            kickStartSteps: 0,
            kickStartDt: 1 / 60,
            emitAtStart: 24,
            texturePath: '',
            texturePreset: 'circle',
            textureFilename: 'circle.png',
            shaderPath: '',
            shaderFilename: '',
            shaderSource: '',
            exportReady: true,
            properties: {
              emissionRate: 100,
              emitterLifetime: 0.8,
              particleLifetimeMin: 0.35,
              particleLifetimeMax: 1.3,
              direction: -Math.PI / 2,
              spread: Math.PI / 3,
              speedMin: 40,
              speedMax: 140,
              sizes: '1, 0',
              offsetX: 0,
              offsetY: 0,
              count: 0,
              bufferSize: 1000,
            },
          },
          {
            index: 2,
            title: 'Smoke',
            blendMode: 'alpha',
            enabled: true,
            x: 0,
            y: 0,
            kickStartSteps: 0,
            kickStartDt: 1 / 60,
            emitAtStart: 12,
            texturePath: '',
            texturePreset: 'light',
            textureFilename: 'light.png',
            shaderPath: '',
            shaderFilename: '',
            shaderSource: '',
            exportReady: true,
            properties: {
              emissionRate: 60,
              emitterLifetime: -1,
              particleLifetimeMin: 0.5,
              particleLifetimeMax: 1.6,
              direction: -Math.PI / 2,
              spread: Math.PI / 2,
              speedMin: 20,
              speedMax: 90,
              sizes: '1, 0',
              offsetX: 0,
              offsetY: 0,
              count: 0,
              bufferSize: 1000,
            },
          },
        ],
        timeline: {
          duration: 3,
          loop: true,
          tracks: [
            {
              systemIndex: 1,
              clips: [{ id: 'clip-1', start: 0, end: 3, emit: 24 }],
              lanes: {},
            },
            {
              systemIndex: 2,
              clips: [{ id: 'clip-2', start: 0, end: 3, emit: 12 }],
              lanes: {},
            },
          ],
        },
        timelineState: { time: 0, playing: false, scrubVersion: 0 },
      },
    });
  }, sessionId);
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

async function seedPartialCompareData(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'observers'], [{ key: 'player.health', value: '100', type: 'number' }]);
    client?.setQueryData(['other', 'observers'], [
      { key: 'player.health', value: '100', type: 'number' },
      { key: 'only.other', value: 'right' },
    ]);
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

async function seedPartialPerformanceData(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    client?.setQueryData(['demo', 'performance'], [
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
    ]);
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

test('texture lab is available without a connected session in the app', async ({ page }) => {
  await seedNoSession(page);
  await page.goto('/texture-lab');

  await expect(page.getByRole('heading', { name: 'Texture Lab' })).toBeVisible();
  await expect(page.getByTestId('texture-lab-page')).toHaveCSS('overflow', 'hidden');
  await expect(page.getByTestId('texture-lab-controls-panel')).toHaveCSS('overflow-y', 'auto');
  await expect(page.getByTestId('texture-lab-main-panel')).toHaveCSS('overflow-y', 'auto');
  const textureHeader = page.getByTestId('texture-lab-page').locator('header');
  await expect(textureHeader.getByRole('button', { name: /reset values/i })).toBeVisible();
  await expect(textureHeader.getByRole('button', { name: /regenerate/i })).toBeVisible();
  await expect(textureHeader.getByRole('button', { name: /export png/i })).toBeVisible();
  await expect(textureHeader.getByRole('button', { name: /use as shader preview/i })).toBeVisible();
  await expect(page.getByLabel('Texture background color')).toHaveValue('#000000');
  await expect(page.getByLabel('Texture background alpha')).toHaveValue('0');
  const preview = page.getByTestId('texture-lab-preview');
  await expect(preview).toBeVisible();
  await page.getByLabel('Texture color ramp').click();
  await page.getByRole('option', { name: 'Solid Color' }).click();
  await expect(page.getByLabel('Texture solid color')).toHaveValue('#ffffff');
  const solidBefore = await preview.getAttribute('src');
  await page.getByLabel('Texture solid color').fill('#ff3366');
  await expect(page.getByLabel('Texture solid color')).toHaveValue('#ff3366');
  await expect.poll(() => preview.getAttribute('src')).not.toBe(solidBefore);
  await page.getByLabel('Saved recipe name').fill('Blue Spark');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('button', { name: 'Load saved recipe Blue Spark' })).toBeVisible();
  await page.getByLabel('Texture generator').click();
  await page.getByRole('option', { name: 'Cloud Noise' }).click();
  await expect(page.getByLabel('Texture generator')).toHaveText(/Cloud Noise/);
  await page.getByRole('button', { name: 'Load saved recipe Blue Spark' }).click();
  await expect(page.getByLabel('Texture generator')).toHaveText(/Soft Circle/);
  await expect(page.getByLabel('Texture solid color')).toHaveValue('#ff3366');
  await textureHeader.getByRole('button', { name: /create atlas/i }).click();
  const atlasPanel = page.getByTestId('texture-lab-atlas-panel');
  await expect(atlasPanel).toBeVisible();
  await expect(page.getByTestId('texture-lab-atlas-sheet')).toBeVisible();
  await expect(page.getByTestId('texture-lab-atlas-frame-grid')).toBeVisible();
  await expect(textureHeader.getByRole('button', { name: /export atlas zip/i })).toBeVisible();
  await page.getByLabel('Seeded fill preset').click();
  await page.getByRole('option', { name: 'Smoke Variants' }).click();
  await page.getByRole('button', { name: /fill frames/i }).click();
  await expect(page.getByLabel('Texture generator')).toHaveText(/Smoke Puff/);
  await expect(page.getByLabel('Atlas particle playback')).toHaveText(/Variants/);
  await expect(page.getByRole('button', { name: /replace frame/i })).toBeVisible();
  await page.getByRole('button', { name: 'Select atlas frame 2' }).click();
  await expect(page.getByTestId('texture-lab-onion-past')).toBeVisible();
  await expect(page.getByTestId('texture-lab-onion-future')).toBeVisible();
  const selectedAtlasFramePreview = page.locator('img[alt="Selected atlas frame"]');
  const atlasFrameBeforeEdit = await selectedAtlasFramePreview.getAttribute('src');
  await page.getByLabel('Texture softness').fill('0.12');
  await expect.poll(() => selectedAtlasFramePreview.getAttribute('src')).not.toBe(atlasFrameBeforeEdit);
  await page.getByTestId('texture-lab-custom-frame-input').setInputFiles(shaderPreviewTextureFiles().water);
  await expect(page.getByText(/water\.png/)).toBeVisible();
  await expect(page.getByTestId('texture-lab-uploaded-frame-readonly')).toContainText(/replace-only/i);
  await page.getByRole('button', { name: /copy selected to all/i }).click();
  const copyFramesDialog = page.getByRole('dialog', { name: /copy selected frame to all/i });
  await expect(copyFramesDialog).toBeVisible();
  await copyFramesDialog.getByRole('button', { name: /cancel/i }).click();
  await page.getByRole('button', { name: /empty all frames/i }).click();
  const emptyFramesDialog = page.getByRole('dialog', { name: /empty all atlas frames/i });
  await expect(emptyFramesDialog).toBeVisible();
  await emptyFramesDialog.getByRole('button', { name: /cancel/i }).click();
  await atlasPanel.getByLabel('Onion skin').click();
  await expect(page.getByTestId('texture-lab-onion-past')).toHaveCount(0);
  await textureHeader.getByRole('button', { name: /exit atlas/i }).click();
  await expect(page.getByTestId('texture-lab-preview')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Texture Lab' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load saved recipe Blue Spark' })).toBeVisible();
  const before = await preview.getAttribute('src');
  await page.getByTitle('Randomize seed').click();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(before);
  await page.getByLabel('Texture generator').click();
  await page.getByRole('option', { name: 'Spline Trail' }).click();
  await expect(page.getByLabel('Texture seed')).toHaveValue('1337');
  await expect(page.getByTestId('texture-lab-spline-editor')).toBeVisible();
  await expect(page.getByLabel('Spline overlap resolution')).toHaveText(/Merge/);
  const firstPointStyle = await page.getByTestId('texture-lab-spline-point-1').evaluate((point) => ({
    fill: point.getAttribute('fill'),
    stroke: point.getAttribute('stroke'),
    strokeWidth: point.getAttribute('stroke-width'),
  }));
  const secondPointStyle = await page.getByTestId('texture-lab-spline-point-2').evaluate((point) => ({
    fill: point.getAttribute('fill'),
    stroke: point.getAttribute('stroke'),
    strokeWidth: point.getAttribute('stroke-width'),
  }));
  expect(firstPointStyle).toEqual(secondPointStyle);
  expect(firstPointStyle.stroke).toBeTruthy();
  expect(Number(firstPointStyle.strokeWidth)).toBeGreaterThan(0);
  await page.getByTestId('texture-lab-spline-point-1').click();
  await expect.poll(() =>
    page.getByTestId('texture-lab-spline-point-1').evaluate((point) => ({
      fill: point.getAttribute('fill'),
      stroke: point.getAttribute('stroke'),
      strokeWidth: point.getAttribute('stroke-width'),
    })),
  ).toEqual({ fill: '#facc15', stroke: '#111827', strokeWidth: '3' });
  const splineBefore = await preview.getAttribute('src');
  const splinePoint = await page.getByTestId('texture-lab-spline-point-1').boundingBox();
  expect(splinePoint).not.toBeNull();
  await page.mouse.move(splinePoint!.x + splinePoint!.width / 2, splinePoint!.y + splinePoint!.height / 2);
  await page.mouse.down();
  await page.mouse.move(splinePoint!.x + splinePoint!.width / 2 + 28, splinePoint!.y + splinePoint!.height / 2 + 16);
  await page.mouse.up();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(splineBefore);
  await page.getByTitle('Randomize seed').click();
  await page.getByRole('button', { name: 'Comet Tail' }).click();
  await expect(page.getByLabel('Texture seed')).toHaveValue('1337');
  await page.getByLabel('Texture generator').click();
  await page.getByRole('option', { name: 'Shapes & Polygons' }).click();
  await expect(page.getByTestId('texture-lab-shape-editor')).toBeVisible();
  await expect(page.getByTestId('texture-lab-shape-layer-stack')).toBeVisible();
  await expect(page.getByTestId('texture-lab-shape-move-handle')).toBeVisible();
  await expect(page.getByTestId('texture-lab-shape-size-handle')).toBeVisible();
  const shapeBeforePointEdit = await preview.getAttribute('src');
  const shapePoint = await page.getByTestId('texture-lab-shape-point-0').boundingBox();
  expect(shapePoint).not.toBeNull();
  await page.mouse.move(shapePoint!.x + shapePoint!.width / 2, shapePoint!.y + shapePoint!.height / 2);
  await page.mouse.down();
  await page.mouse.move(shapePoint!.x + shapePoint!.width / 2 + 18, shapePoint!.y + shapePoint!.height / 2 + 12);
  await page.mouse.up();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(shapeBeforePointEdit);
  await page.getByRole('button', { name: 'Rect' }).click();
  await expect(page.getByTitle('Disable Rect')).toBeVisible();
  const withRect = await preview.getAttribute('src');
  await page.getByTitle('Disable Rect').click();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(withRect);
  const beforeSplineLayer = await preview.getAttribute('src');
  await page.getByTestId('texture-lab-shape-layer-stack').getByRole('button', { name: 'Spline', exact: true }).click();
  await expect(page.getByTitle('Disable Spline')).toBeVisible();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(beforeSplineLayer);
  const shapeSplinePointLocator = page.getByTestId('texture-lab-shape-point-1');
  const shapeSplinePointBefore = await shapeSplinePointLocator.getAttribute('data-point');
  const shapeSplinePoint = await shapeSplinePointLocator.boundingBox();
  expect(shapeSplinePoint).not.toBeNull();
  await shapeSplinePointLocator.hover();
  await page.mouse.down();
  await page.mouse.move(shapeSplinePoint!.x + shapeSplinePoint!.width / 2 + 40, shapeSplinePoint!.y + shapeSplinePoint!.height / 2 + 30, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(() => shapeSplinePointLocator.getAttribute('data-point')).not.toBe(shapeSplinePointBefore);
  await page.getByRole('button', { name: 'Scatter Dots' }).click();
  await expect(page.getByLabel('Shape repeat mode')).toHaveText(/Scatter/);
  await textureHeader.getByRole('button', { name: /reset values/i }).click();
  await expect(page.getByLabel('Texture seed')).toHaveValue('1337');
  await page.getByRole('button', { name: /expand texture presets/i }).click();
  await expect(page.getByRole('button', { name: /smoke puff/i })).toBeVisible();
  await expect(textureHeader.getByRole('button', { name: /export png/i })).toBeVisible();
});

test('creative sessions unlock local creative tools and persist as workspace tabs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('feather-e2e-query-client', '1');
  });
  await page.goto('/');

  await page.getByTitle('Add session or workspace').click();
  await page.getByRole('menuitem', { name: 'New creative workspace' }).click();
  const dialog = page.getByRole('dialog', { name: 'New creative workspace' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill('Local FX');
  await dialog.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('button', { name: /Local FX/ })).toBeVisible();
  await expect(page).toHaveURL(/\/shader-graph$/);
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  await expect(page.getByText('Local workspace')).toBeVisible();
  await expect(page.getByText('Shader Graph is disabled')).toHaveCount(0);

  await page.getByTestId('sidebar-tool-particle-system-playground').getByRole('link', { name: 'Particles Playground' }).click();
  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await expect(page.getByTestId('love-js-preview-floating')).toBeVisible();
  await particlePreviewFrame(page);
  await expect(page.getByRole('button', { name: /show in game/i })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.getByTitle('Play timeline').click();
  await expect.poll(async () => (await particlePreviewStatus(page)).time ?? 0, { timeout: 2500 }).toBeGreaterThan(0.05);
  await expect.poll(async () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
      (item: { message?: { action?: string } }) =>
        item.message?.action === 'timeline-control' || item.message?.action === 'runtime-preview',
    ).length;
  })).toBe(0);
  await page.getByTitle('Pause timeline').click();

  await page.goto('/');
  await expect(page.getByText('Select a session')).toBeVisible();
  await expect(page.getByText('Choose a game session from the header before opening Feather tools.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /Local FX/ })).toBeVisible();
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
  await expect(page.getByTestId('sidebar-group-creative').getByText('Creative')).toBeVisible();
  await expect(page.getByTestId('sidebar-group-history').getByText('History')).toBeVisible();
  await expect(page.getByTestId('sidebar-tool-logs')).toHaveCount(1);
  await expect(page.getByTestId('sidebar-tool-performance')).toHaveCount(1);
  await expect(page.getByTestId('sidebar-tool-session')).toHaveCount(1);
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

test('persists expanded theme variants and can return to system mode', async ({ page }) => {
  await seedNoSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await page.getByRole('tab', { name: 'General' }).click();

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Noctis Uva' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'noctis-uva');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#292640');

  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).first().click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'noctis-uva');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#292640');

  await page.getByRole('button', { name: 'Connect a LÖVE project' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: '2017 Light (Visual Studio - C/C++)' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'vs-cpp-2017-light');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#ffffff');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Tokyo Night Light' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'tokyo-night-light');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
    .toBe('#e6e7ed');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Absent Light (Rainglow)' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rainglow-absent-light');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()))
    .toBe('#228a96');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'Codecourse Contrast (Rainglow)' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rainglow-codecourse-contrast');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()))
    .toBe('#1ea8fc');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'GitHub Light High Contrast' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'github-light-high-contrast');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()))
    .toBe('#0349b4');

  await page.getByRole('combobox', { name: 'App Theme' }).click();
  await page.getByRole('option', { name: 'GitHub Dark Dimmed' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'github-dark-dimmed');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()))
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
  await expect(page.getByTestId('sidebar-tool-assets').getByRole('button', { name: 'Assets', exact: true })).toBeDisabled();
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
  await expect(page.getByTestId('profiler-run-comparison-drawer').getByRole('heading', { name: 'love.keypressed' })).toBeVisible();
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
  await page.getByRole('dialog', { name: 'Save Profiler Snapshot' }).getByRole('button', { name: 'Save Snapshot' }).click();

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
    (window as any).__FEATHER_QUERY_CLIENT__?.setQueryData(['demo', 'observers'], [
      {
        key: 'partial.value',
        value: 'ready',
        type: 'string',
      },
    ]);
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
    client?.setQueryData(['demo', 'logs'], [
      {
        id: 'feather-start-contrast',
        count: 1,
        time: Date.now() / 1000,
        type: 'feather:start',
        str: 'Feather started',
        trace: '',
      },
    ]);
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

  await expect
    .poll(requestConfigCount)
    .toBeGreaterThan(0);

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

  await expect.poll(async () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
    return commands.some((item: { message?: { type?: string; data?: { features?: Record<string, unknown> } } }) =>
      item.message?.type === 'cmd:runtime:interest' && item.message.data?.features?.profiler === true,
    );
  })).toBe(true);

  await page.getByTestId('sidebar-tool-assets').getByRole('link', { name: 'Assets' }).click();
  await expect.poll(async () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
    const lastInterest = [...commands]
      .reverse()
      .find((item: { message?: { type?: string; data?: { features?: Record<string, unknown> } } }) =>
        item.message?.type === 'cmd:runtime:interest',
      );
    return lastInterest?.message?.data?.features;
  })).toMatchObject({ assets: true, observers: false });
  await expect.poll(async () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
    return commands.some((item: { message?: { type?: string } }) => item.message?.type === 'req:assets');
  })).toBe(true);

  await page
    .getByTestId('sidebar-tool-particle-system-playground')
    .getByRole('link', { name: 'Particles Playground' })
    .click();
  await expect.poll(async () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
    const lastInterest = [...commands]
      .reverse()
      .find((item: { message?: { type?: string; data?: { features?: Record<string, unknown> } } }) =>
        item.message?.type === 'cmd:runtime:interest',
      );
    return lastInterest?.message?.data?.features;
  })).toMatchObject({
    particlePlayground: true,
    pluginIds: expect.arrayContaining(['particle-system-playground']),
  });
  await expect.poll(async () => page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commands = (window as any).__FEATHER_E2E_TAURI__?.commands ?? [];
    return commands.some((item: { message?: { type?: string } }) => item.message?.type === 'req:plugins');
  })).toBe(true);
});

test('particle playground uses connected-game preview on demand in the app', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 420 });
  await seedTauriConnectedGame(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /CLI Example/ })).toBeVisible();
  await seedParticlePlaygroundConfig(page, 'live-game-session');
  await page
    .getByTestId('sidebar-tool-particle-system-playground')
    .getByRole('link', { name: 'Particles Playground' })
    .click();

  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Emit$/ })).toHaveCount(0);
  const mainViewport = page.getByTestId('particle-playground-main').locator('[data-slot="scroll-area-viewport"]');
  await expect.poll(async () => mainViewport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect
    .poll(async () =>
      mainViewport.evaluate((element) => {
        element.scrollTop = 120;
        return element.scrollTop;
      }),
    )
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  await expect(page.getByTestId('particle-preview-monitor')).toBeVisible();
  await expect(page.getByText('game runtime')).toBeVisible();
  await expect(page.locator('iframe[title="Particle Preview"]')).toHaveCount(0);
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
        (item: { message?: { action?: string; params?: { active?: boolean } } }) =>
          item.message?.action === 'runtime-preview' && item.message.params?.active === true,
      ).length;
    }),
  ).toBe(0);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.getByTitle('Play timeline').click();
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
        (item: { message?: { action?: string } }) => item.message?.action === 'timeline-control',
      ).length;
    }),
  ).toBe(0);
  await page.getByTitle('Pause timeline').click();

  await page.getByRole('button', { name: 'Show in Game' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
          (item: { message?: { action?: string; params?: { active?: boolean } } }) =>
            item.message?.action === 'runtime-preview' && item.message.params?.active === true,
        ).length;
      }),
    )
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Hide in Game' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
          (item: { message?: { action?: string; params?: { active?: boolean } } }) =>
            item.message?.action === 'runtime-preview' && item.message.params?.active === false,
        ).length;
      }),
    )
    .toBeGreaterThan(0);

  const clearsBeforeLeave = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
      (item: { message?: { action?: string; params?: { active?: boolean } } }) =>
        item.message?.action === 'runtime-preview' && item.message.params?.active === false,
    ).length;
  });
  await page.getByTestId('sidebar-tool-logs').getByRole('link', { name: 'Logs' }).click();
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
        (item: { message?: { action?: string; params?: { active?: boolean } } }) =>
          item.message?.action === 'runtime-preview' && item.message.params?.active === false,
      ).length;
    }),
  ).toBe(clearsBeforeLeave);
});

test('particle playground timeline mode control updates in the app', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await seedParticlePlaygroundConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page
    .getByTestId('sidebar-tool-particle-system-playground')
    .getByRole('link', { name: 'Particles Playground' })
    .click();

  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();

  const mode = page.getByTestId('particle-timeline-mode');
  await expect(mode.getByRole('button', { name: 'Loop' })).toHaveAttribute('aria-pressed', 'true');

  await mode.getByRole('button', { name: 'Ambient' }).click();
  await expect(mode.getByRole('button', { name: 'Ambient' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Ambient starts once/)).toBeVisible();

  await mode.getByRole('button', { name: 'One-shot' }).click();
  await expect(mode.getByRole('button', { name: 'One-shot' })).toHaveAttribute('aria-pressed', 'true');
});

test('particle playground undo redo history works in the app', async ({ page }) => {
  await seedTauriConnectedGame(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /CLI Example/ })).toBeVisible();
  await seedParticlePlaygroundConfig(page, 'live-game-session');
  await page
    .getByTestId('sidebar-tool-particle-system-playground')
    .getByRole('link', { name: 'Particles Playground' })
    .click();

  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  const undoButton = page.getByLabel('Undo particle edit');
  const redoButton = page.getByLabel('Redo particle edit');
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();

  const restoreCommandCount = () =>
    page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((window as any).__FEATHER_E2E_TAURI__?.commands ?? []).filter(
        (item: { message?: { action?: string } }) => item.message?.action === 'restore-composite',
      ).length;
    });

  const restoresBeforeEdit = await restoreCommandCount();
  const rate = page.getByText('Rate', { exact: true }).locator('..').getByRole('spinbutton');
  await expect(rate).toHaveValue('100');
  await rate.fill('150');
  await expect(rate).toHaveValue('150');
  await expect(undoButton).toBeEnabled();
  await expect(redoButton).toBeDisabled();
  await expect.poll(restoreCommandCount).toBe(restoresBeforeEdit);

  await page.getByRole('heading', { name: 'Particles Playground' }).click();
  await page.keyboard.press(`${multiSelectModifier()}+Z`);
  await expect(rate).toHaveValue('100');
  await expect(redoButton).toBeEnabled();
  await expect.poll(restoreCommandCount).toBe(restoresBeforeEdit + 1);

  await page.keyboard.press(`${multiSelectModifier()}+Shift+Z`);
  await expect(rate).toHaveValue('150');
  await expect(undoButton).toBeEnabled();
  await expect.poll(restoreCommandCount).toBe(restoresBeforeEdit + 2);

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.getByTestId('particle-timeline-track-1').click();
  const strip = await page.getByTestId('particle-timeline-track-strip-1').boundingBox();
  expect(strip).not.toBeNull();
  await page.getByLabel('Stop at').first().fill('2.2');
  await expect(page.getByLabel('Stop at').first()).toHaveValue('2.2');
  await dragLocatorBy(page, page.getByTestId('particle-timeline-clip-1').first(), strip!.width * (0.2 / 3));
  await expect(page.getByLabel('Emit at').first()).toHaveValue('0.2');
  await undoButton.click();
  await expect(page.getByLabel('Emit at').first()).toHaveValue('0');

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window as any).__FEATHER_QUERY_CLIENT__;
    const current = client?.getQueryData(['live-game-session', 'plugin', 'particle-system-playground']);
    if (!current?.data) return;
    client.setQueryData(['live-game-session', 'plugin', 'particle-system-playground'], {
      ...current,
      data: { ...current.data, compositeType: 'game' },
    });
  });
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();
});

test('particle playground timeline toggles emitters and moves grouped items in the app', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await seedParticlePlaygroundConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page
    .getByTestId('sidebar-tool-particle-system-playground')
    .getByRole('link', { name: 'Particles Playground' })
    .click();

  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();

  await page.getByTestId('particle-timeline-track-1').getByRole('button', { name: 'Disable emitter Fire' }).click();
  await expect(page.getByTestId('particle-timeline-track-1').getByText('muted')).toBeVisible();
  await page.getByTestId('particle-timeline-track-1').getByRole('button', { name: 'Enable emitter Fire' }).click();
  await expect(page.getByTestId('particle-timeline-track-1').getByText('muted')).toHaveCount(0);

  await page.getByTestId('particle-timeline-track-1').click();
  const strip1 = await page.getByTestId('particle-timeline-track-strip-1').boundingBox();
  expect(strip1).not.toBeNull();
  await page.getByLabel('Stop at').first().fill('0.7');
  await expect(page.getByLabel('Stop at').first()).toHaveValue('0.7');
  await page.getByTestId('particle-timeline-playhead').fill('1.2');
  await page.getByTestId('particle-timeline-playhead').dispatchEvent('change');
  await page.getByTestId('particle-timeline-inspector').getByRole('button', { name: /add clip at playhead/i }).click();
  await expect(page.getByTestId('particle-timeline-clip-1')).toHaveCount(2);

  const firstClip = page.getByTestId('particle-timeline-clip-1').nth(0);
  const secondClip = page.getByTestId('particle-timeline-clip-1').nth(1);
  await firstClip.click({ force: true, position: { x: 4, y: 10 } });
  await secondClip.click({ force: true, modifiers: [multiSelectModifier()] });
  await dragLocatorBy(page, secondClip, strip1!.width * (0.4 / 3));
  await expect(page.locator('[title="Fire: 0.40s to 1.10s"]').first()).toBeVisible();
  await expect(page.locator('[title="Fire: 1.60s to 2.40s"]').first()).toBeVisible();

  await firstClip.click({ force: true, position: { x: 4, y: 10 } });
  await secondClip.click({ force: true, modifiers: [multiSelectModifier()] });
  await dragLocatorBy(page, secondClip, strip1!.width);
  await expect(page.locator('[title="Fire: 1.00s to 1.70s"]').first()).toBeVisible();
  await expect(page.locator('[title="Fire: 2.20s to 3.00s"]').first()).toBeVisible();
});

test('shader graph template presets expose public controls in the app', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await seedShaderGraphConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByTestId('sidebar-tool-shader-graph').getByRole('link', { name: 'Shader Graph' }).click();
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());

  await page.getByRole('combobox', { name: 'Load preset' }).click();
  await page.getByRole('option', { name: /^outline$/i }).click();

  const templateControls = page.getByTestId('shader-template-controls');
  await expect(templateControls).toBeVisible();
  await expect(templateControls.getByText('Outline', { exact: true })).toBeVisible();
  await expect(templateControls.getByText('Thickness')).toBeVisible();
  await expect(templateControls.getByText('Outline Color', { exact: true })).toBeVisible();

  await templateControls.getByRole('spinbutton').first().fill('6');
  await openShaderOutput(page);
  await expect(page.getByText(/,\s*6\.0,\s*vec4/i)).toBeVisible();

  await page.locator('.react-flow__node').filter({ hasText: 'Outline' }).dblclick();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Source Color' })).toBeVisible();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'RGBA Output' })).toBeVisible();
});

test('shader graph right panel exposes root shader controls in the app', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await seedShaderGraphConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByTestId('sidebar-tool-shader-graph').getByRole('link', { name: 'Shader Graph' }).click();
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();

  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 260, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('float parameter');
  await page.getByTestId('shader-node-picker').getByRole('button', { name: /^float parameter input$/i }).click();

  await page.getByTestId('shader-canvas').click({ button: 'right', position: { x: 420, y: 260 } });
  await page.getByTestId('shader-node-picker').getByPlaceholder('Search nodes').fill('color parameter');
  await page.getByTestId('shader-node-picker').getByRole('button', { name: /^color parameter input$/i }).click();

  const controls = page.getByTestId('shader-controls-panel');
  await expect(controls).toBeVisible();
  await expect(controls.getByText('float', { exact: true })).toBeVisible();
  await expect(controls.getByText('color', { exact: true })).toBeVisible();

  await controls.getByLabel('Float Parameter label').fill('Strength');
  await controls.getByLabel('Strength value').fill('0.5');
  await controls.getByLabel('Color Parameter label').fill('Tint');
  await controls.getByLabel('Tint alpha').fill('0.6');

  await expect.poll(async () => {
    return page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('feather-shader-graph') || '{}')?.state;
      const strength = state?.nodes?.find((node: { data?: { label?: string } }) => node.data?.label === 'Strength');
      const tint = state?.nodes?.find((node: { data?: { label?: string } }) => node.data?.label === 'Tint');
      return {
        strength: strength?.data?.values?.val,
        tintAlpha: tint?.data?.values?.val?.[3],
      };
    });
  }).toEqual({ strength: 0.5, tintAlpha: 0.6 });

  await openShaderOutput(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Strength' }).first().click();
  await expect(page.getByTestId('shader-right-panel-selection')).toBeVisible();
  await openShaderControls(page);
  await page.getByTestId('shader-canvas').click({ position: { x: 24, y: 96 } });
  await expect(page.getByLabel('Select canvas mode')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Pan canvas mode')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Select canvas mode')).toHaveAttribute('aria-pressed', 'true');

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

test('shader graph preview probes render texture-heavy uploads in the app', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await seedShaderGraphConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page.getByTestId('sidebar-tool-shader-graph').getByRole('link', { name: 'Shader Graph' }).click();
  await expect(page.getByRole('heading', { name: 'Shader Graph' })).toBeVisible();
  const files = shaderPreviewTextureFiles();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'texture-heavy-preview.feathershgh',
    mimeType: 'application/json',
    // @ts-expect-error buffer time
    buffer: Buffer.from(JSON.stringify(textureHeavyPreviewGraph())),
  });

  await uploadShaderPreviewTexture(page, page.getByTitle('Upload preview texture'), files.water);

  const noiseNode = page.locator('.react-flow__node').filter({ hasText: 'Noise Texture' });
  await noiseNode.click();
  await page.getByRole('tab', { name: 'Selection' }).click();
  await uploadShaderPreviewTexture(page, page.getByTestId('shader-right-panel-selection').getByTitle('Upload texture file'), files.noise);
  await expect(page.getByTestId('shader-right-panel-selection').getByText('simplex-noise-64.png')).toBeVisible();

  const maskNode = page.locator('.react-flow__node').filter({ hasText: 'Mask Texture' });
  await maskNode.click();
  await page.getByRole('tab', { name: 'Selection' }).click();
  await uploadShaderPreviewTexture(page, page.getByTestId('shader-right-panel-selection').getByTitle('Upload texture file'), files.mask);
  await expect(page.getByTestId('shader-right-panel-selection').getByText('3-mask.png')).toBeVisible();

  const probe = page.locator('.react-flow__node').filter({ hasText: 'Texture Probe' });
  await probe.click();
  await expectTextureProbePayload(page);
});

test('particle playground timeline is editable in the app', async ({ page }) => {
  await seedSession(page);
  await page.goto('/');
  await seedParticlePlaygroundConfig(page);
  await page.getByRole('button', { name: /Demo Session/ }).click();
  await page
    .getByTestId('sidebar-tool-particle-system-playground')
    .getByRole('link', { name: 'Particles Playground' })
    .click();

  await expect(page.getByRole('heading', { name: 'Particles Playground' })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByTestId('particle-timeline-panel')).toBeVisible();
  const mode = page.getByTestId('particle-timeline-mode');
  await expect(mode.getByRole('button', { name: 'Loop' })).toHaveAttribute('aria-pressed', 'true');
  const mainWidth = await page.getByTestId('particle-playground-main').evaluate((element) => element.getBoundingClientRect().width);
  const panelWidth = await page.getByTestId('particle-timeline-panel').evaluate((element) => element.getBoundingClientRect().width);
  expect(panelWidth).toBeGreaterThan(mainWidth * 0.85);

  const timelineScroll = page.getByTestId('particle-timeline-scroll');
  const defaultOverflow = await timelineScroll.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(defaultOverflow).toBeLessThanOrEqual(2);

  const playhead = page.getByTestId('particle-timeline-playhead');
  await page.getByTitle('Play timeline').click();
  await expect
    .poll(async () => Number(await playhead.inputValue()), { timeout: 1500 })
    .toBeGreaterThan(0.05);
  const animatedTime = Number(await playhead.inputValue());
  expect(animatedTime).toBeLessThan(1);
  await page.getByTitle('Pause timeline').click();
  await page.getByTitle('Reset playhead').click();

  await page.getByTestId('particle-timeline-track-1').click();
  const clipBox = await page.getByTestId('particle-timeline-clip-1').first().boundingBox();
  const trackStripBox = await page.getByTestId('particle-timeline-track-strip-1').boundingBox();
  expect(clipBox).not.toBeNull();
  expect(trackStripBox).not.toBeNull();
  expect(clipBox!.x).toBeGreaterThanOrEqual(trackStripBox!.x - 1);
  expect(clipBox!.x + clipBox!.width).toBeLessThanOrEqual(trackStripBox!.x + trackStripBox!.width + 1);

  await dragLocatorToX(
    page,
    page.getByTestId('particle-timeline-clip-end-handle-1').first(),
    trackStripBox!.x + trackStripBox!.width * (2.2 / 3),
  );
  await expect(page.getByLabel('Stop at').first()).toHaveValue('2.2');
  await dragLocatorBy(page, page.getByTestId('particle-timeline-clip-1').first(), trackStripBox!.width * (0.2 / 3));
  await expect(page.getByLabel('Emit at').first()).toHaveValue('0.2');
  await expect(page.getByLabel('Stop at').first()).toHaveValue('2.4');
  const emissionWindow = page.getByTestId('particle-timeline-emission-window-1').first();
  await expect(emissionWindow).toBeVisible();
  const resizedClipBox = await page.getByTestId('particle-timeline-clip-1').first().boundingBox();
  const emissionBox = await emissionWindow.boundingBox();
  expect(resizedClipBox).not.toBeNull();
  expect(emissionBox).not.toBeNull();
  expect(emissionBox!.width).toBeLessThan(resizedClipBox!.width * 0.65);
  await expect(page.getByTestId('particle-timeline-emission-window-2')).toHaveCount(0);
  const tail = page.getByTestId('particle-timeline-tail-1').first();
  await expect(tail).toBeVisible();
  const tailBox = await tail.boundingBox();
  expect(tailBox).not.toBeNull();
  expect(tailBox!.x).toBeGreaterThanOrEqual(trackStripBox!.x - 1);
  expect(tailBox!.x + tailBox!.width).toBeLessThanOrEqual(trackStripBox!.x + trackStripBox!.width + 1);

  await page.getByRole('button', { name: /duplicate clip/i }).click();
  await expect(page.getByTestId('particle-timeline-clip-1')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('particle-timeline-clip-1')).toHaveCount(1);

  await page.getByText('Opacity').click();
  await page.getByRole('button', { name: /add key at playhead/i }).click();
  await page.getByLabel('Opacity key value').first().fill('0.4');
  await expect(page.getByTestId('particle-timeline-inspector').getByLabel('Opacity key curve')).toBeDisabled();
  await expect(page.getByTestId('particle-timeline-lane-opacity-1').getByText('1 keys')).toBeVisible();
  const keyframe = page.locator('[title="Opacity 0.00s = 0.4"]').first();
  await expect(keyframe).toBeVisible();
  await dragLocatorBy(page, keyframe, trackStripBox!.width * (0.3 / 3));
  await expect(page.getByLabel('Opacity key time').first()).toHaveValue('0.3');

  await page.getByTestId('particle-emitter-row-1').dragTo(page.getByTestId('particle-emitter-row-2'));
  await page.getByTestId('particle-timeline-track-2').click();
  await expect(page.getByLabel('Stop at').first()).toHaveValue('2.4');
  await page.getByTestId('particle-timeline-track-1').click();
  await expect(page.getByLabel('Stop at').first()).toHaveValue('3');

  await page.getByTitle('Play timeline').click();
  await expect(page.getByTitle('Pause timeline')).toBeVisible();
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
        const commands = (window as unknown as {
          __FEATHER_E2E_TAURI__?: { commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }> };
        }).__FEATHER_E2E_TAURI__?.commands ?? [];
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
        const commands = (window as unknown as {
          __FEATHER_E2E_TAURI__?: { commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }> };
        }).__FEATHER_E2E_TAURI__?.commands ?? [];
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
        const commands = (window as unknown as {
          __FEATHER_E2E_TAURI__?: { commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }> };
        }).__FEATHER_E2E_TAURI__?.commands ?? [];
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
        const commands = (window as unknown as {
          __FEATHER_E2E_TAURI__?: { commands?: Array<{ message?: { type?: string; data?: { probes?: unknown[] } } }> };
        }).__FEATHER_E2E_TAURI__?.commands ?? [];
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
  await page.getByLabel('Command Center search').fill('feel inspector');
  await expect(page.getByTestId('command-center-row').filter({ hasText: '/plugins/feel-inspector' }).first()).toBeVisible();
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
