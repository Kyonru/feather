import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * The Inspector↔Studio bridge contract is written twice — TypeScript for
 * Studio, Rust for Inspector — and `check:protocol` is what keeps them in step.
 * A check nobody has seen fail is not a check, so each case here hands it a
 * drifted copy of one side and expects a named failure.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TS = readFileSync(join(ROOT, 'packages/session-bridge/src/contract.ts'), 'utf8');
const RS = readFileSync(join(ROOT, 'apps/inspector/src-tauri/src/studio_bridge.rs'), 'utf8');
const ADAPTERS = readFileSync(join(ROOT, 'packages/session-bridge/src/adapters.ts'), 'utf8');

function runCheck({ ts = TS, rs = RS, adapters = ADAPTERS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'feather-bridge-drift-'));
  const files = { ts: join(dir, 'contract.ts'), rs: join(dir, 'studio_bridge.rs'), adapters: join(dir, 'adapters.ts') };
  writeFileSync(files.ts, ts);
  writeFileSync(files.rs, rs);
  writeFileSync(files.adapters, adapters);
  const result = spawnSync(process.execPath, ['scripts/check-protocol.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      FEATHER_BRIDGE_TS_FILE: files.ts,
      FEATHER_BRIDGE_RS_FILE: files.rs,
      FEATHER_BRIDGE_ADAPTERS_FILE: files.adapters,
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function replaceOnce(source, from, to) {
  assert.ok(source.includes(from), `fixture anchor missing: ${from}`);
  return source.replace(from, to);
}

test('the unmodified contract passes', () => {
  const { status, output } = runCheck();
  assert.equal(status, 0, output);
  assert.match(output, /methods, error codes, allowlist and limits agreed/);
});

test('a method renamed on one side fails', () => {
  const { status, output } = runCheck({ rs: replaceOnce(RS, '    "preview.cancel",\n', '    "preview.stop",\n') });
  assert.equal(status, 1);
  assert.match(output, /Bridge methods differ[\s\S]*Only in TypeScript: preview\.cancel[\s\S]*Only in Rust: preview\.stop/);
});

test('a declared method with no handler fails', () => {
  const { status, output } = runCheck({ rs: replaceOnce(RS, '"capability.release" => {', '"capability.drop" => {') });
  assert.equal(status, 1);
  assert.match(output, /declares "capability\.release" but has no match arm/);
});

test('an error code only one side knows fails', () => {
  const { status, output } = runCheck({ ts: replaceOnce(TS, "  'stale-session',\n", '') });
  assert.equal(status, 1);
  assert.match(output, /Bridge error codes differ[\s\S]*Only in Rust: stale-session/);
});

test('an undeclared code used by the Rust server fails', () => {
  const { status, output } = runCheck({
    rs: replaceOnce(RS, 'fail(id, "rejected", &error.to_string())', 'fail(id, "game-busy", &error.to_string())'),
  });
  assert.equal(status, 1);
  assert.match(output, /undeclared bridge error codes: game-busy/);
});

test('an action Rust forwards that TypeScript never allowed fails', () => {
  const { status, output } = runCheck({
    rs: replaceOnce(RS, '("particle-system-playground", &["set-shader"])', '("particle-system-playground", &["set-shader", "export-zip"])'),
  });
  assert.equal(status, 1);
  assert.match(output, /allowlist for "particle-system-playground" differs/);
});

test('a size limit changed on one side fails', () => {
  const { status, output } = runCheck({
    ts: replaceOnce(TS, 'BRIDGE_MAX_REQUEST_BYTES = 8 * 1024 * 1024;', 'BRIDGE_MAX_REQUEST_BYTES = 64 * 1024 * 1024;'),
  });
  assert.equal(status, 1);
  assert.match(output, /Bridge size limits differ/);
});

test('a version bumped on one side fails', () => {
  const { status, output } = runCheck({ rs: replaceOnce(RS, 'pub const BRIDGE_VERSION: u32 = 2;', 'pub const BRIDGE_VERSION: u32 = 3;') });
  assert.equal(status, 1);
  assert.match(output, /Bridge version mismatch/);
});
