import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Particle timeline semantics must exist in exactly one place.
 *
 * They existed in four: the in-game plugin, the love.js preview, the exported
 * Lua, and the TypeScript curve editor. Three of those were Lua copies of the
 * same maths, and they had drifted — the preview clamped none of the four
 * values the others clamped, so an `inElastic` size lane rendered at -37% in
 * the preview and 0 in the game and the export.
 *
 * This is a structural test rather than a behavioural one on purpose: a
 * behavioural test catches a copy that has *already* drifted, and by then
 * someone has shipped the wrong thing. This catches the copy.
 *
 * See V4-PARTICLES.md §1 and P1.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const CORE = 'packages/runtime-lua/plugins/particle-system-playground/core.lua';

/** Names that may only be *defined* inside core.lua. */
const SEMANTICS = [
  'easeOutBounce',
  'easeTimelineValue',
  'evaluateKeyframes',
  'clipAllowsEmission',
  'trackAllowsEmission',
  'normalizeTimelineEasing',
];

const HOSTS = [
  'packages/runtime-lua/example/showcase_preview/main.lua',
  'packages/runtime-lua/plugins/particle-system-playground/timeline_runtime.lua',
];

test('core.lua is the only Lua file defining timeline semantics', () => {
  for (const host of HOSTS) {
    const source = read(host);
    for (const name of SEMANTICS) {
      const defines = new RegExp(`^\\s*(local\\s+)?function\\s+${name}\\b`, 'm').test(source);
      assert.ok(
        !defines,
        `${host} defines ${name}. Semantics belong in ${CORE}; require it instead of restating it.`,
      );
    }
  }
});

test('core.lua does not depend on LÖVE, so it can be unit tested and embedded anywhere', () => {
  // Comments mention love.js by name; only real code counts.
  const code = read(CORE)
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

  // A single `love.` reference would tie the semantics to a graphics context
  // and make them untestable outside one.
  assert.ok(!/\blove\s*\./.test(code), 'core.lua must not reference the love API');
  assert.ok(!/\brequire\s*\(/.test(code), 'core.lua must not require anything');
});

test('the preview ships core.lua rather than carrying its own copy', () => {
  const build = read('scripts/showcase-lovejs-utils.mjs');
  assert.match(
    build,
    /plugins\/particle-system-playground\/core\.lua/,
    'the showcase .love must bundle core.lua, or the preview cannot require it',
  );

  const preview = read('packages/runtime-lua/example/showcase_preview/main.lua');
  assert.match(
    preview,
    /require\("plugins\.particle-system-playground\.core"\)/,
    'the preview must require the shared core',
  );
  assert.match(
    build,
    /plugins\/particle-system-playground\/apply\.lua/,
    'the showcase .love must bundle apply.lua too, or the preview cannot require it',
  );
  assert.match(
    preview,
    /ParticleApply\.tick\(/,
    'the preview must go through apply.tick, which resolves through core (where the ' +
      'clamps live) and sends only what changed',
  );
});

test('apply.lua stays testable without a graphics context', () => {
  const code = read('packages/runtime-lua/plugins/particle-system-playground/apply.lua')
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

  // It calls methods on the object it is handed, so a counting stub can stand
  // in for a ParticleSystem. A `love.` reference would end that.
  assert.ok(!/\blove\s*\./.test(code), 'apply.lua must not reference the love API');
});

test('the per-frame path does not pcall calls that cannot fail', () => {
  const apply = read('packages/runtime-lua/plugins/particle-system-playground/apply.lua');
  assert.ok(
    !/pcall/.test(apply),
    'apply.lua runs per frame on a system this code constructed; pcall there allocates ' +
      'and hides errors (V4-PARTICLES.md §4.2)',
  );
});

test('the exported file embeds core.lua rather than a restatement of it', () => {
  const plugin = read('packages/runtime-lua/plugins/particle-system-playground/init.lua');
  assert.match(plugin, /coreSource\(\)/, 'the exporter must read core.lua to embed it');
  assert.match(
    plugin,
    /refusing to emit a stale copy/,
    'the exporter must refuse rather than fall back to an embedded duplicate',
  );
});
