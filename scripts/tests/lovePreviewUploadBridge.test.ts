import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { patchLoveJsPlayer, writeWebglPreviewFallback } from '../showcase-lovejs-utils.mjs';
import { stripLovePreviewUploads } from '../../src/utils/love-preview-upload-bridge';

type TestWindow = Window & {
  __featherPreviewUploadCache?: Record<string, string>;
};

function withWindow<T>(fn: (win: TestWindow) => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const win = {} as TestWindow;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: win,
  });
  try {
    return fn(win);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete (globalThis as { window?: unknown }).window;
  }
}

test('strips uploads into the preview cache by default', () => {
  withWindow((win) => {
    const payload = stripLovePreviewUploads({
      baseTexture: { filename: 'sprite.png', dataBase64: 'base-data' },
      textures: [{ filename: 'noise.png', uniform: 'u_noise', dataBase64: 'noise-data' }],
    });

    assert.equal(payload.baseTexture.dataBase64, '');
    assert.equal(payload.textures[0].dataBase64, '');
    assert.equal(Object.values(win.__featherPreviewUploadCache ?? {}).includes('base-data'), true);
    assert.equal(Object.values(win.__featherPreviewUploadCache ?? {}).includes('noise-data'), true);
  });
});

test('keeps node-preview texture uploads inline when requested', () => {
  withWindow((win) => {
    const payload = stripLovePreviewUploads(
      {
        baseTexture: { filename: 'sprite.png', dataBase64: 'base-data' },
        textures: [{ filename: 'mask.png', uniform: 'u_mask', dataBase64: 'mask-data' }],
      },
      { stripBaseTexture: false, stripTextures: false },
    );

    assert.equal(payload.baseTexture.dataBase64, 'base-data');
    assert.equal(payload.textures[0].dataBase64, 'mask-data');
    assert.deepEqual(win.__featherPreviewUploadCache, undefined);
  });
});

test('generated love.js bridge caches inline preview uploads for Lua polling', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'feather-love-preview-'));
  try {
    const playerPath = path.join(dir, 'player.js');
    await writeFile(playerPath, 'window.Player = {};');
    await patchLoveJsPlayer(dir);
    const source = await readFile(playerPath, 'utf8');
    const listeners = new Map<string, Array<(event: unknown) => void>>();
    const windowObject = {
      parent: {
        postMessage() {},
      },
      addEventListener(event: string, callback: (event: unknown) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), callback]);
      },
    };
    vm.runInNewContext(source, { window: windowObject });

    listeners.get('message')?.forEach((callback) =>
      callback({
        data: {
          source: 'feather-showcase',
          type: 'preview:update',
          payload: {
            baseTexture: { filename: 'sprite.png', dataBase64: 'base-data' },
            textures: [{ filename: 'noise.png', uniform: 'u_noise', dataBase64: 'noise-data' }],
          },
        },
      }),
    );

    const patched = windowObject as typeof windowObject & {
      _featherPayload?: {
        baseTexture?: { dataBase64?: string; dataKey?: string };
        textures?: Array<{ dataBase64?: string; dataKey?: string }>;
      };
      _featherUploadCache?: Record<string, string>;
      _featherUploadChunk?: (key: string, start: number, length: number) => string;
    };
    const baseKey = patched._featherPayload?.baseTexture?.dataKey ?? '';
    const textureKey = patched._featherPayload?.textures?.[0]?.dataKey ?? '';

    assert.equal(patched._featherPayload?.baseTexture?.dataBase64, '');
    assert.equal(patched._featherPayload?.textures?.[0]?.dataBase64, '');
    assert.equal(patched._featherUploadCache?.[baseKey], 'base-data');
    assert.equal(patched._featherUploadCache?.[textureKey], 'noise-data');
    assert.equal(patched._featherUploadChunk?.(textureKey, 0, 5), 'noise');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generated love.js target includes a WebGL node-preview fallback', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'feather-love-webgl-preview-'));
  try {
    const outDir = path.join(dir, 'out');
    await mkdir(outDir, { recursive: true });
    await writeWebglPreviewFallback({ root: process.cwd(), outDir });

    const html = await readFile(path.join(outDir, 'webgl.html'), 'utf8');
    const player = await readFile(path.join(outDir, 'webgl-player.js'), 'utf8');

    assert.match(html, /webgl-player\.js\?featherPreview=webgl-preview-v2/);
    assert.match(player, /window\._featherPayload/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
