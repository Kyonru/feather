import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { shellQuote } = require('../out/command.js');
const { hotReloadModuleName, vendorDirOption } = require('../out/settings.js');

test('shellQuote quotes only what needs it (display only; jobs never use a shell)', () => {
  assert.equal(shellQuote('/tmp/Feather App/node'), '"/tmp/Feather App/node"');
  assert.equal(shellQuote('--plugins'), '--plugins');
  assert.equal(shellQuote('console,hot-reload'), 'console,hot-reload');
  assert.equal(shellQuote('a"b$c'), '"a\\"b\\$c"');
});

test('feather.vendorDir becomes a project-relative --vendor-dir, never --dir', () => {
  assert.deepEqual(vendorDirOption('/p', undefined), { ok: true, value: undefined });
  assert.deepEqual(vendorDirOption('/p', '  '), { ok: true, value: undefined });
  // The old flow saved the project root here after the first vendor add.
  assert.deepEqual(vendorDirOption('/p', '/p'), { ok: true, value: undefined });
  assert.deepEqual(vendorDirOption('/p', '/p/vendor'), { ok: true, value: 'vendor' });
  assert.deepEqual(vendorDirOption('/p', 'third_party/vendor'), { ok: true, value: 'third_party/vendor' });
  const outside = vendorDirOption('/p', '/elsewhere/vendor');
  assert.equal(outside.ok, false);
  assert.match(outside.error, /must be a folder inside the project/);
});

test('hot reload module names come from project-relative Lua paths', () => {
  assert.equal(hotReloadModuleName('/p', '/p/game/player.lua'), 'game.player');
  assert.equal(hotReloadModuleName('/p', '/p/game/init.lua'), 'game');
  assert.equal(hotReloadModuleName('/p', '/p/readme.md'), undefined);
  assert.equal(hotReloadModuleName('/p', '/other/x.lua'), undefined);
});
