/**
 * Target ownership is checked from the validated lockfile before any download or write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fakePackage,
  makeTmp,
  outputOf,
  readLock,
  run,
  serveFakePackages,
  sha256,
  snapshotTree,
  withFetchMock,
  writeLock,
} from './package-helpers.mjs';

const { installPackages } = await import('../../dist/lib/package/install.js');
const { readLockfile } = await import('../../dist/lib/package/lockfile.js');

const CONTENTS = { alpha: { 'a.lua': 'return "alpha v1"' } };

function project() {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib', 'alpha'), { recursive: true });
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  return dir;
}

async function install(dir, opts = {}, packages = [fakePackage('alpha', CONTENTS.alpha)]) {
  return withFetchMock(serveFakePackages(CONTENTS), async (calls) => {
    const result = await installPackages(packages, readLockfile(dir), { projectDir: dir, ...opts });
    return { result, calls };
  });
}

test("ownership: refuses another package's file before any download", async () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'return "other"');
  writeLock(dir, {
    other: {
      version: 'v1',
      trust: 'verified',
      source: { repo: 'example/other', tag: 'v1' },
      files: [{ name: 'a.lua', target: 'lib/alpha/a.lua', sha256: sha256('return "other"') }],
    },
  });
  const before = snapshotTree(dir);

  for (const force of [false, true]) {
    const { result, calls } = await install(dir, { force });
    assert.equal(result.ok, false);
    assert.match(result.error, /lib\/alpha\/a\.lua is already managed by package "other"/);
    assert.deepEqual(calls, [], '--force must not take over another package');
  }
  assert.deepEqual(snapshotTree(dir), before);
});

test('ownership: refuses an untracked existing file unless --force, and says so precisely', async () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'my own code');

  const refused = await install(dir);
  assert.equal(refused.result.ok, false);
  assert.match(refused.result.error, /lib\/alpha\/a\.lua already exists and is not managed by Feather.*--force/);
  assert.deepEqual(refused.calls, []);
  assert.equal(readFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'utf8'), 'my own code');

  const forced = await install(dir, { force: true });
  assert.equal(forced.result.ok, true, forced.result.error);
  assert.deepEqual(forced.result.warnings, ['Overwriting untracked file lib/alpha/a.lua.']);
  assert.equal(readFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'utf8'), CONTENTS.alpha['a.lua']);
});

test('ownership: an untracked file that already has the expected bytes is adopted without --force', async () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'alpha', 'a.lua'), CONTENTS.alpha['a.lua']);
  const { result } = await install(dir);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.warnings, []);
  assert.equal(readLock(dir).packages.alpha.files[0].target, 'lib/alpha/a.lua');
});

test('ownership: refuses to write through a symlink, even with --force', async () => {
  const dir = project();
  const elsewhere = join(dir, 'elsewhere.lua');
  writeFileSync(elsewhere, 'precious');
  symlinkSync(elsewhere, join(dir, 'lib', 'alpha', 'a.lua'));

  const { result, calls } = await install(dir, { force: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /lib\/alpha\/a\.lua is a symlink/);
  assert.deepEqual(calls, []);
  assert.equal(readFileSync(elsewhere, 'utf8'), 'precious');
});

test('ownership: updating a locally modified own file refuses by default and warns precisely with --force', async () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'my edits');
  writeLock(dir, {
    alpha: {
      version: 'v0.0.0',
      trust: 'verified',
      source: { repo: 'example/alpha', tag: 'v0.0.0' },
      files: [{ name: 'a.lua', target: 'lib/alpha/a.lua', sha256: sha256('return "alpha v0"') }],
    },
  });
  const locked = sha256('return "alpha v0"').slice(0, 12);
  const found = sha256('my edits').slice(0, 12);

  const refused = await install(dir);
  assert.equal(refused.result.ok, false);
  assert.equal(
    refused.result.error,
    `lib/alpha/a.lua has local changes (locked sha256 ${locked}, found ${found}). Back up your edits, then re-run with --force to overwrite them.`,
  );
  assert.deepEqual(refused.calls, []);
  assert.equal(readFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'utf8'), 'my edits');

  const forced = await install(dir, { force: true });
  assert.equal(forced.result.ok, true, forced.result.error);
  assert.deepEqual(forced.result.warnings, [
    `Overwriting locally modified lib/alpha/a.lua (locked sha256 ${locked}, found ${found}).`,
  ]);
});

test('ownership: two packages in one command cannot plan the same target', async () => {
  const dir = project();
  const alpha = fakePackage('alpha', CONTENTS.alpha);
  const clone = fakePackage('clone', { 'a.lua': 'return "clone"' });
  clone.files[0].target = 'lib/alpha/a.lua';
  const { result, calls } = await install(dir, {}, [alpha, clone]);
  assert.equal(result.ok, false);
  assert.match(result.error, /lib\/alpha\/a\.lua is also planned by package "alpha" in this command/);
  assert.deepEqual(calls, []);
});

test('ownership: a subpackage may share its parent package files when the bytes are the catalog bytes', async () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'alpha', 'a.lua'), CONTENTS.alpha['a.lua']);
  writeLock(dir, {
    alpha: {
      version: 'v1.0.0',
      trust: 'verified',
      source: { repo: 'example/alpha', tag: 'v1.0.0' },
      files: [{ name: 'a.lua', target: 'lib/alpha/a.lua', sha256: sha256(CONTENTS.alpha['a.lua']) }],
    },
  });
  const sub = fakePackage('alpha.a', {}, { entry: { parent: 'alpha', source: { repo: 'example/alpha', tag: 'v1.0.0', baseUrl: 'https://example.com/alpha/' } } });
  sub.files = [{ name: 'a.lua', target: 'lib/alpha/a.lua', sha256: sha256(CONTENTS.alpha['a.lua']) }];

  const { result } = await install(dir, {}, [sub]);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(Object.keys(readLock(dir).packages).sort(), ['alpha', 'alpha.a']);
});

test('ownership (CLI): --from-url refuses an untracked target before fetching and --force overwrites it', () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'helper.lua'), 'my helper');
  const url = 'data:text/plain,return%201';

  const refused = run(['package', 'install', '--from-url', url, '--target-path', 'lib/helper.lua', '--allow-untrusted', '--dir', dir]);
  assert.equal(refused.exitCode, 1);
  assert.match(outputOf(refused), /lib\/helper\.lua already exists and is not managed by Feather/);
  assert.equal(readFileSync(join(dir, 'lib', 'helper.lua'), 'utf8'), 'my helper');

  const forced = run(['package', 'install', '--from-url', url, '--target-path', 'lib/helper.lua', '--allow-untrusted', '--force', '--dir', dir, '--json']);
  assert.equal(forced.exitCode, 0, outputOf(forced));
  assert.deepEqual(JSON.parse(forced.stdout).warnings, ['Overwriting untracked file lib/helper.lua.']);
  assert.equal(readFileSync(join(dir, 'lib', 'helper.lua'), 'utf8'), 'return 1');
  assert.equal(readLock(dir).packages['plain,return%201'].files[0].sha256, sha256('return 1'));
});

test('ownership (CLI): restore refuses to replace a locally modified file without --force', () => {
  const dir = project();
  const content = 'return {}\n';
  writeFileSync(join(dir, 'lib', 'helper.lua'), 'my edits');
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { kind: 'url', url: 'data:text/plain,return%20%7B%7D%0A' },
      files: [{ name: 'helper.lua', target: 'lib/helper.lua', sha256: sha256(content) }],
    },
  });

  const refused = run(['package', 'install', '--allow-untrusted', '--dir', dir]);
  assert.equal(refused.exitCode, 1);
  assert.match(outputOf(refused), /lib\/helper\.lua has local changes .*--force to replace it with the locked version/);
  assert.equal(readFileSync(join(dir, 'lib', 'helper.lua'), 'utf8'), 'my edits');

  const forced = run(['package', 'install', '--allow-untrusted', '--force', '--dir', dir]);
  assert.equal(forced.exitCode, 0, outputOf(forced));
  assert.equal(readFileSync(join(dir, 'lib', 'helper.lua'), 'utf8'), content);
});
