import assert from 'node:assert/strict';
import test from 'node:test';

import { sidecarBinaryForTarget } from '../prepare-tauri-cli-sidecar.mjs';

test('the Inspector sidecar follows the Tauri build target, not the runner host', () => {
  assert.equal(sidecarBinaryForTarget('aarch64-apple-darwin'), 'feather');
  assert.equal(sidecarBinaryForTarget('x86_64-apple-darwin'), 'feather-darwin-x64');
  assert.equal(sidecarBinaryForTarget('x86_64-pc-windows-msvc'), 'feather-win-x64.exe');
  assert.equal(sidecarBinaryForTarget('x86_64-unknown-linux-gnu'), 'feather-linux-x64');
  assert.throws(() => sidecarBinaryForTarget('aarch64-unknown-linux-gnu'), /No Feather CLI sidecar/);
});
