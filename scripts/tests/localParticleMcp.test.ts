import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectForLocalParticleData,
  runLocalParticleAction,
  runLocalParticleWorkspaceAction,
} from '../../apps/studio/src/tools/particle-system-playground/local-mcp.ts';
import {
  defaultLocalParticleData,
  loadLocalParticleWorkspace,
  subscribeLocalParticleWorkspace,
} from '../../apps/studio/src/tools/particle-system-playground/use-local-particle-playground.ts';

test('Studio-local particle MCP creates and mutates the authored workspace', () => {
  const created = runLocalParticleAction(defaultLocalParticleData(), 'new-composite', {
    name: 'MCP Sparks',
    template: 'sparkles',
  });
  assert.deepEqual(created.response, { composite: 'MCP Sparks' });
  assert.equal(created.data.activeComposite, 'MCP Sparks');
  assert.equal(created.data.data?.systems[0]?.title, 'Sparkles');

  const updated = runLocalParticleAction(created.data, 'set-params', {
    emissionRate: 47,
    emitAtStart: 80,
    compositeX: 128,
  });
  assert.equal(updated.data.data?.systems[0]?.properties.emissionRate, 47);
  assert.equal(updated.data.data?.systems[0]?.emitAtStart, 80);
  assert.equal(updated.data.data?.x, 128);

  const emitter = runLocalParticleAction(updated.data, 'add-system', { template: 'smoke' });
  assert.deepEqual(emitter.response, { systemIndex: 2 });
  assert.equal(emitter.data.data?.systems.length, 2);
  assert.equal(emitter.data.activeSystem, 2);
});

test('Studio-local particle MCP exports project, Lua and ZIP asset payloads without a game', () => {
  const authored = runLocalParticleAction(defaultLocalParticleData(), 'new-composite', {
    name: 'Offline Fire',
    template: 'fire',
  }).data;
  const shaded = runLocalParticleAction(authored, 'set-shader', {
    shaderFilename: 'glow.glsl',
    shaderSource: 'vec4 effect(vec4 c, Image t, vec2 uv, vec2 sc) { return c; }',
  }).data;

  const project = runLocalParticleAction(shaded, 'export-project', {}).response as Record<string, unknown>;
  assert.equal(project.filename, 'Offline-Fire.featherparticles');
  assert.equal(projectForLocalParticleData(shaded).name, 'Offline Fire');

  const code = runLocalParticleAction(shaded, 'export-code', {}).response as { exportCode: string };
  assert.match(code.exportCode, /local effect =/);
  assert.match(code.exportCode, /emissionRate/);

  const zip = runLocalParticleAction(shaded, 'export-zip', {}).response as {
    zipAssets: Array<{ path: string; content: string }>;
  };
  assert.ok(zip.zipAssets.some((asset) => asset.path === 'Offline-Fire.featherparticles'));
  assert.ok(zip.zipAssets.some((asset) => asset.path === 'Offline-Fire.lua'));
  assert.ok(zip.zipAssets.some((asset) => asset.path === 'shaders/glow.glsl'));
});

test('live-only particle actions tell an MCP caller to select a game', () => {
  assert.throws(
    () => runLocalParticleAction(defaultLocalParticleData(), 'emit', { count: 10 }),
    /Pass sessionId to route it through Inspector/,
  );
});

test('Studio MCP actions persist and publish the active local particle workspace', () => {
  const values = new Map<string, string>();
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });

  try {
    const published: string[] = [];
    const unsubscribe = subscribeLocalParticleWorkspace('workspace:mcp', (data) => {
      published.push(data.activeComposite ?? '');
    });
    runLocalParticleWorkspaceAction('workspace:mcp', 'new-composite', { name: 'Published Sparks' });
    unsubscribe();

    assert.equal(loadLocalParticleWorkspace('workspace:mcp').activeComposite, 'Published Sparks');
    assert.deepEqual(published, ['Published Sparks']);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
});
