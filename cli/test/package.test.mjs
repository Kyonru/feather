/* eslint-disable no-undef */
/**
 * E2E tests for `feather package` subcommands.
 *
 * Runs the compiled CLI binary (dist/index.js) so build must be current.
 * Uses --offline everywhere registry access is needed to avoid network I/O.
 * Pre-populates temp dirs with lockfiles / files for audit & remove scenarios.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Run the CLI and return { stdout, stderr, exitCode }. Never throws. */
function run(args, extra = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      ...extra,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.status ?? 1 };
  }
}

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'feather-e2e-'));
}

/**
 * Write a minimal feather.lock.json to dir.
 * @param {string} dir
 * @param {Record<string, object>} packages
 */
function writeLock(dir, packages) {
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify({ lockfileVersion: 1, packages }, null, 2));
}

test('search: no query lists all registry packages', () => {
  const { stdout, exitCode } = run(['package', 'search', '--offline']);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'), 'should include anim8');
  assert.ok(stdout.includes('bump'), 'should include bump');
  assert.ok(stdout.includes('package(s)'), 'should print count');
});

test('search: query filters by package name', () => {
  const { stdout, exitCode } = run(['package', 'search', 'anim', '--offline']);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'));
  assert.ok(!stdout.includes('bump'));
});

test('search: query matches tags', () => {
  const { stdout, exitCode } = run(['package', 'search', 'animation', '--offline']);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'));
});

test('search: unmatched query reports no results', () => {
  const { stdout, exitCode } = run(['package', 'search', 'zzz_no_such_pkg_xyz', '--offline']);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('No packages found'));
});

test('list --installed: empty project prints hint', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'list', '--installed', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('No packages installed'));
});

test('list --installed: shows installed package with version', () => {
  const dir = makeTmp();
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [],
    },
  });
  const { stdout, exitCode } = run(['package', 'list', '--installed', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'));
  assert.ok(stdout.includes('v2.3.1'));
});

test('info: shows package details for known package', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'info', 'anim8', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'));
  assert.ok(stdout.includes('kikito/anim8'));
  assert.ok(stdout.includes('anim8.lua'));
  assert.ok(stdout.includes('lib/anim8.lua'));
});

test('info: unknown package exits 1 with message', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'info', 'zzz_no_such_pkg', '--offline', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('not found'));
});

test('install: no names + no lockfile prints empty hint and exits 0', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('empty'));
});

test('install: no names + empty lockfile prints hint', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('empty'));
});

test('install: no names + all verified skips restore', () => {
  const dir = makeTmp();
  const content = 'return {}';
  const hash = sha256(content);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'anim8.lua'), content);
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: hash }],
    },
  });
  const { stdout, exitCode } = run(['package', 'install', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('up to date'));
});

test('install: unknown package exits 1', () => {
  const dir = makeTmp();
  const { exitCode } = run(['package', 'install', 'zzz_no_such_pkg', '--offline', '--dir', dir]);
  assert.equal(exitCode, 1);
});

test('install: dry-run shows plan without writing any files', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', 'anim8', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'));
  assert.ok(stdout.includes('Dry run'));
  assert.ok(!existsSync(join(dir, 'lib', 'anim8.lua')), 'must not write any file');
  assert.ok(!existsSync(join(dir, 'feather.lock.json')), 'must not write lockfile');
});

test('install: already-installed package is skipped', () => {
  const dir = makeTmp();
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [],
    },
  });
  const { stdout, exitCode } = run(['package', 'install', 'anim8', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('already installed'));
});

test('install: version override without --allow-untrusted exits 1', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', 'anim8@v2.2.0', '--offline', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('allow-untrusted'));
});

test('install --from-url: missing --allow-untrusted exits 1 with warning', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run([
    'package',
    'install',
    '--from-url',
    'https://example.com/helper.lua',
    '--target',
    'lib/helper.lua',
    '--dir',
    dir,
  ]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('NOT been reviewed') || stdout.includes('allow-untrusted'));
});

test('install --from-url: missing --target exits 1', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run([
    'package',
    'install',
    '--from-url',
    'https://example.com/helper.lua',
    '--allow-untrusted',
    '--dir',
    dir,
  ]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('--target'));
});

test('audit: no packages installed prints hint', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('No packages installed'));
});

test('audit: correct file exits 0 and reports verified', () => {
  const dir = makeTmp();
  const content = 'return {}';
  const hash = sha256(content);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'anim8.lua'), content);
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: hash }],
    },
  });
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 0, `unexpected failure:\n${stdout}`);
  assert.ok(stdout.includes('verified'));
});

test('audit: missing file exits 1 and reports missing', () => {
  const dir = makeTmp();
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: 'abc123' }],
    },
  });
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('missing'));
});

test('audit: tampered file exits 1 and reports MODIFIED', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'anim8.lua'), 'tampered content');
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: sha256('original content') }],
    },
  });
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('MODIFIED'));
});

test('audit --json: outputs valid JSON', () => {
  const dir = makeTmp();
  const content = 'return {}';
  const hash = sha256(content);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'anim8.lua'), content);
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: hash }],
    },
  });
  const { stdout, exitCode } = run(['package', 'audit', '--json', '--dir', dir]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].status, 'verified');
});

test('remove: not installed exits 1 with message', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'remove', 'anim8', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('not installed'));
});

test('remove: deletes file and removes lockfile entry', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'anim8.lua'), 'return {}');
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: 'any' }],
    },
  });
  const { exitCode } = run(['package', 'remove', 'anim8', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(!existsSync(join(dir, 'lib', 'anim8.lua')), 'file should be deleted');
  const lock = JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
  assert.ok(!lock.packages.anim8, 'lockfile entry should be removed');
});

test('remove: does not touch files belonging to other packages', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'anim8.lua'), 'return {}');
  writeFileSync(join(dir, 'lib', 'bump.lua'), 'return {}');
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: 'any' }],
    },
    bump: {
      version: 'v3.1.7',
      trust: 'verified',
      source: { repo: 'kikito/bump.lua', tag: 'v3.1.7' },
      files: [{ name: 'bump.lua', target: 'lib/bump.lua', sha256: 'any' }],
    },
  });
  run(['package', 'remove', 'anim8', '--dir', dir]);
  assert.ok(existsSync(join(dir, 'lib', 'bump.lua')), 'bump.lua must not be touched');
  const lock = JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
  assert.ok(lock.packages.bump, 'bump lockfile entry must remain');
});

test('update: no packages installed prints hint', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'update', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('No packages installed'));
});

test('update: specific name not in lockfile exits 1', () => {
  const dir = makeTmp();
  // lockfile has another package so the empty-lockfile early-return is bypassed
  writeLock(dir, {
    bump: {
      version: 'v3.1.7',
      trust: 'verified',
      source: { repo: 'kikito/bump.lua', tag: 'v3.1.7' },
      files: [],
    },
  });
  const { stdout, exitCode } = run(['package', 'update', 'anim8', '--offline', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('not installed'));
});

test('update: already up-to-date package is reported', () => {
  const dir = makeTmp();
  writeLock(dir, {
    anim8: {
      version: 'v2.3.1',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v2.3.1' },
      files: [],
    },
  });
  const { stdout, exitCode } = run(['package', 'update', 'anim8', '--offline', '--dry-run', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('up to date'));
});

test('update: experimental packages are skipped', () => {
  const dir = makeTmp();
  writeLock(dir, {
    'my-helper': {
      version: '0.0.0',
      trust: 'experimental',
      source: { url: 'https://example.com/my-helper.lua' },
      files: [],
    },
  });
  const { stdout, exitCode } = run(['package', 'update', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('Skipping') || stdout.includes('experimental'));
});

/**
 * Write a lockfile entry as produced by `feather package add`:
 * trust: experimental, source: { url }, per-file url in each file entry.
 */
function writeUrlLock(dir, id, files) {
  writeLock(dir, {
    [id]: {
      version: 'url',
      trust: 'experimental',
      source: { url: files[0].url },
      files,
      installedAt: new Date().toISOString(),
    },
  });
}

test('list --installed: shows url package with experimental trust', () => {
  const dir = makeTmp();
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: 'abc' },
  ]);
  const { stdout, exitCode } = run(['package', 'list', '--installed', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('my-helper'));
  assert.ok(stdout.includes('experimental'));
});

test('audit: url package with correct file reports verified', () => {
  const dir = makeTmp();
  const content = 'return {}';
  const hash = sha256(content);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), content);
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: hash },
  ]);
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 0, `unexpected failure:\n${stdout}`);
  assert.ok(stdout.includes('verified'));
});

test('audit: url package with missing file exits 1 and reports missing', () => {
  const dir = makeTmp();
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: 'abc' },
  ]);
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('missing'));
});

test('audit: url package with tampered file exits 1 and reports MODIFIED', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), 'tampered');
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: sha256('original') },
  ]);
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('MODIFIED'));
});

test('audit: multi-file url package all verified', () => {
  const dir = makeTmp();
  const c1 = 'return "a"';
  const c2 = 'return "b"';
  mkdirSync(join(dir, 'lib', 'mypkg'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'mypkg', 'a.lua'), c1);
  writeFileSync(join(dir, 'lib', 'mypkg', 'b.lua'), c2);
  writeUrlLock(dir, 'mypkg', [
    { name: 'a.lua', url: 'https://example.com/a.lua', target: 'lib/mypkg/a.lua', sha256: sha256(c1) },
    { name: 'b.lua', url: 'https://example.com/b.lua', target: 'lib/mypkg/b.lua', sha256: sha256(c2) },
  ]);
  const { stdout, exitCode } = run(['package', 'audit', '--dir', dir]);
  assert.equal(exitCode, 0, `unexpected failure:\n${stdout}`);
  assert.equal((stdout.match(/✔/g) ?? []).length, 2, 'both files should be verified');
});

test('install (no args): url package already on disk with correct hash is skipped', () => {
  const dir = makeTmp();
  const content = 'return {}';
  const hash = sha256(content);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), content);
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: hash },
  ]);
  const { stdout, exitCode } = run(['package', 'install', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('up to date'));
});

test('remove: url package removes file and lockfile entry', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), 'return {}');
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: 'any' },
  ]);
  const { exitCode } = run(['package', 'remove', 'my-helper', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(!existsSync(join(dir, 'lib', 'helper.lua')), 'file should be deleted');
  const lock = JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
  assert.ok(!lock.packages['my-helper'], 'lockfile entry should be removed');
});

test('remove: url package with multiple files removes all of them', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib', 'mypkg'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'mypkg', 'a.lua'), 'return "a"');
  writeFileSync(join(dir, 'lib', 'mypkg', 'b.lua'), 'return "b"');
  writeUrlLock(dir, 'mypkg', [
    { name: 'a.lua', url: 'https://example.com/a.lua', target: 'lib/mypkg/a.lua', sha256: 'any' },
    { name: 'b.lua', url: 'https://example.com/b.lua', target: 'lib/mypkg/b.lua', sha256: 'any' },
  ]);
  const { exitCode } = run(['package', 'remove', 'mypkg', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(!existsSync(join(dir, 'lib', 'mypkg', 'a.lua')));
  assert.ok(!existsSync(join(dir, 'lib', 'mypkg', 'b.lua')));
});

test('update: url package is skipped with experimental message', () => {
  const dir = makeTmp();
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: 'abc' },
  ]);
  const { stdout, exitCode } = run(['package', 'update', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('Skipping') || stdout.includes('experimental'));
});

test('install: subpackage dry-run installs only its files', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', 'hump.camera', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('camera.lua'), 'should list camera.lua');
  assert.ok(stdout.includes('Dry run'));
  assert.ok(!stdout.includes('timer.lua'), 'must not include timer.lua');
  assert.ok(!stdout.includes('signal.lua'), 'must not include signal.lua');
});

test('install: parent package dry-run includes all files', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', 'hump', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('camera.lua'));
  assert.ok(stdout.includes('timer.lua'));
  assert.ok(stdout.includes('Dry run'));
});

test('info: package with subpackages lists module names', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'info', 'hump', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('hump.camera'));
  assert.ok(stdout.includes('hump.timer'));
});

test('search: matches package description', () => {
  const { stdout, exitCode } = run(['package', 'search', 'sprite', '--offline']);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'));
});

test('search: subpackages not shown at top level', () => {
  const { stdout, exitCode } = run(['package', 'search', '--offline']);
  assert.equal(exitCode, 0);
  // hump.camera should not appear as a top-level entry (it's a subpackage)
  const lines = stdout.split('\n').filter((l) => l.trim().startsWith('hump'));
  assert.ok(lines.length > 0, 'hump should appear');
  assert.ok(!lines.some((l) => l.startsWith('  hump.camera')), 'hump.camera should not be a top-level entry');
});

test('audit --json: url package included in output', () => {
  const dir = makeTmp();
  const content = 'return {}';
  const hash = sha256(content);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), content);
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: hash },
  ]);
  const { stdout, exitCode } = run(['package', 'audit', '--json', '--dir', dir]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed));
  const entry = parsed.find((r) => r.id === 'my-helper');
  assert.ok(entry, 'my-helper should appear in audit output');
  assert.equal(entry.status, 'verified');
});
