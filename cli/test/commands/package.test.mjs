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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const LOCAL_SRC = join(ROOT, 'src-lua');
const LOCK_FIXTURES = fileURLToPath(new URL('../fixtures/package-locks/', import.meta.url));
const CLI_PACKAGE = JSON.parse(readFileSync(join(ROOT, 'cli', 'package.json'), 'utf8'));
const LOCK_FEATURE_REQUIREMENT = `>=${CLI_PACKAGE.version}`;
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

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

/**
 * Write a minimal feather.lock.json to dir.
 * @param {string} dir
 * @param {Record<string, object>} packages
 */
function writeLock(dir, packages) {
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify({ lockfileVersion: 1, packages }, null, 2));
}

function writeLockFixture(dir, name) {
  writeFileSync(join(dir, 'feather.lock.json'), readFileSync(join(LOCK_FIXTURES, name), 'utf8'));
}

function writeGame(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'main.lua'),
    `function love.update(dt)
end

function love.draw()
end
`,
  );
}

test('package project resolver: nested game dir resolves parent project metadata', async () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return {}\n');
  writeLock(dir, {});

  const { resolvePackageProjectDir } = await import('../../dist/commands/package/shared.js');
  assert.equal(resolvePackageProjectDir(gameDir), dir);
});

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
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
  const result = run(['package', 'info', 'zzz_no_such_pkg', '--offline', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('not found'));
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

test('package lock compatibility: old fixture lockfiles remain accepted by audit', () => {
  const fixtures = [
    'plain-v1.json',
    'custom-url-v1.json',
    'fixed-layout-menori.json',
    'install-dir-v1.json',
    'old-feel-vendored-flux.json',
  ];

  for (const fixture of fixtures) {
    const dir = makeTmp();
    writeLockFixture(dir, fixture);
    const lock = JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
    for (const entry of Object.values(lock.packages)) {
      for (const file of entry.files) {
        const content = file.sha256 === sha256('return "flux"') ? 'return "flux"' : 'return {}';
        const target = join(dir, file.target);
        mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true });
        writeFileSync(target, content);
      }
    }

    const result = run(['package', 'audit', '--dir', dir]);
    assert.equal(result.exitCode, 0, `${fixture}: ${outputOf(result)}`);
    assert.ok(outputOf(result).includes('All packages verified'), fixture);
  }
});

test('package lock compatibility: generated alias fixture restores and audits alias files', () => {
  const dir = makeTmp();
  writeLockFixture(dir, 'generated-alias.json');
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'flux.lua'), 'return "flux"');
  mkdirSync(join(dir, 'lib', 'feel'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'feel', 'init.lua'), 'return {}');

  const restore = run(['package', 'install', '--dir', dir]);
  assert.equal(restore.exitCode, 0, outputOf(restore));
  assert.equal(
    readFileSync(join(dir, 'lib', 'feel', 'vendor', 'flux.lua'), 'utf8'),
    '-- Generated by Feather package manager. Do not edit.\nreturn require("lib.flux")\n',
  );

  const audit = run(['package', 'audit', '--dir', dir]);
  assert.equal(audit.exitCode, 0, outputOf(audit));
  assert.ok(outputOf(audit).includes('All packages verified'));

  writeFileSync(join(dir, 'lib', 'feel', 'vendor', 'flux.lua'), 'return "tampered"');
  const tampered = run(['package', 'audit', '--dir', dir]);
  assert.equal(tampered.exitCode, 1);
  assert.ok(outputOf(tampered).includes('MODIFIED'));
});

test('package lock compatibility: future features fail early across package commands', () => {
  const commands = [
    ['package', 'install'],
    ['package', 'install', 'anim8', '--offline'],
    ['package', 'audit'],
    ['package', 'remove', 'future', '--yes'],
    ['package', 'update', 'future', '--offline'],
    ['package', 'list', '--installed'],
    ['package', 'info', 'anim8', '--offline'],
  ];

  for (const args of commands) {
    const dir = makeTmp();
    writeLockFixture(dir, 'future-feature.json');
    const result = run([...args, '--dir', dir]);
    assert.equal(result.exitCode, 1, args.join(' '));
    assert.ok(outputOf(result).includes('require Feather'), outputOf(result));
    assert.ok(outputOf(result).includes('9.0.0'), outputOf(result));
    assert.ok(outputOf(result).includes('made-up-future-feature'), outputOf(result));
    assert.ok(outputOf(result).includes('Update Feather before restoring packages'), outputOf(result));
  }
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

test('install: --install-dir dry-run preserves package layout', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', 'feel', '--install-dir', 'vendor', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('feel/init.lua'));
  assert.ok(stdout.includes('vendor/feel/init.lua'));
  assert.ok(stdout.includes('vendor/feel/vendor/flux.lua'));
  assert.ok(!existsSync(join(dir, 'vendor', 'feel', 'init.lua')), 'must not write any file');
  assert.ok(!existsSync(join(dir, 'feather.lock.json')), 'must not write lockfile');
});

test('install: --install-dir dry-run reinstalls already-installed package', () => {
  const dir = makeTmp();
  writeLock(dir, {
    feel: {
      version: 'main',
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main' },
      files: [],
    },
  });

  const { stdout, exitCode } = run(['package', 'install', 'feel', '--install-dir', 'vendor', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(!stdout.includes('already installed'));
  assert.ok(stdout.includes('vendor/feel/init.lua'));
});

test('install: --flat-dir dry-run flattens catalog files', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', 'feel', '--flat-dir', 'vendor', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('feel/init.lua'));
  assert.ok(stdout.includes('vendor/init.lua'));
  assert.ok(stdout.includes('vendor/flux.lua'));
});

test('install: deprecated --target alias still flattens catalog files', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run(['package', 'install', 'feel', '--target', 'vendor', '--dry-run', '--offline', '--dir', dir]);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('vendor/init.lua'));
  assert.ok(stdout.includes('vendor/flux.lua'));
});

test('install: install-dir option validation', () => {
  const dir = makeTmp();

  const withFlatDir = run(['package', 'install', 'feel', '--install-dir', 'vendor', '--flat-dir', 'lib', '--offline', '--dir', dir]);
  assert.equal(withFlatDir.exitCode, 1);
  assert.ok(outputOf(withFlatDir).includes('--install-dir cannot be used with --flat-dir'));

  const saveOnly = run(['package', 'install', 'feel', '--save-install-dir', '--offline', '--dir', dir]);
  assert.equal(saveOnly.exitCode, 1);
  assert.ok(outputOf(saveOnly).includes('--save-install-dir requires --install-dir'));

  const absolute = run(['package', 'install', 'feel', '--install-dir', '/tmp/vendor', '--offline', '--dir', dir]);
  assert.equal(absolute.exitCode, 1);
  assert.ok(outputOf(absolute).includes('--install-dir must be a relative path'));

  const escaping = run(['package', 'install', 'feel', '--install-dir', '../vendor', '--offline', '--dir', dir]);
  assert.equal(escaping.exitCode, 1);
  assert.ok(outputOf(escaping).includes('--install-dir must be a relative path'));

  const escapingFlatDir = run(['package', 'install', 'feel', '--flat-dir', '../vendor', '--offline', '--dir', dir]);
  assert.equal(escapingFlatDir.exitCode, 1);
  assert.ok(outputOf(escapingFlatDir).includes('--flat-dir must be a relative path'));

  const catalogTargetPath = run(['package', 'install', 'feel', '--target-path', 'lib/feel.lua', '--offline', '--dir', dir]);
  assert.equal(catalogTargetPath.exitCode, 1);
  assert.ok(outputOf(catalogTargetPath).includes('--target-path can only be used with --from-url'));

  const fromUrl = run([
    'package',
    'install',
    '--from-url',
    'https://example.com/helper.lua',
    '--target-path',
    'lib/helper.lua',
    '--install-dir',
    'vendor',
    '--allow-untrusted',
    '--dir',
    dir,
  ]);
  assert.equal(fromUrl.exitCode, 1);
  assert.ok(outputOf(fromUrl).includes('--from-url uses --target-path'));
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
  const result = run(['package', 'install', 'anim8@v2.2.0', '--offline', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('allow-untrusted'));
});

test('install --from-url: missing --allow-untrusted exits 1 with warning', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run([
    'package',
    'install',
    '--from-url',
    'https://example.com/helper.lua',
    '--target-path',
    'lib/helper.lua',
    '--dir',
    dir,
  ]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('NOT been reviewed') || stdout.includes('allow-untrusted'));
});

test('add: non-interactive terminal exits cleanly', () => {
  const dir = makeTmp();
  const { stdout, stderr, exitCode } = run(['package', 'add', '--dir', dir]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('interactive terminal'));
  assert.equal(stderr.includes('Raw mode is not supported'), false);
});

test('install --from-url: --yes alone does not bypass untrusted source', () => {
  const dir = makeTmp();
  const { stdout, exitCode } = run([
    'package',
    'install',
    '--from-url',
    'https://example.com/helper.lua',
    '--target-path',
    'lib/helper.lua',
    '--yes',
    '--dir',
    dir,
  ]);
  assert.equal(exitCode, 1);
  assert.ok(stdout.includes('allow-untrusted') || stdout.includes('untrusted'));
});

test('install --from-url: missing --target-path exits 1', () => {
  const dir = makeTmp();
  const result = run([
    'package',
    'install',
    '--from-url',
    'https://example.com/helper.lua',
    '--allow-untrusted',
    '--dir',
    dir,
  ]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('--target-path'));
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
  const result = run(['package', 'remove', 'anim8', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('not installed'));
});

test('remove: installed package requires --yes in non-interactive mode', () => {
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
  const result = run(['package', 'remove', 'anim8', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('--yes'));
  assert.ok(existsSync(join(dir, 'lib', 'anim8.lua')), 'file should remain');
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
  const { exitCode } = run(['package', 'remove', 'anim8', '--dir', dir, '--yes']);
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
  run(['package', 'remove', 'anim8', '--dir', dir, '--yes']);
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
  const result = run(['package', 'update', 'anim8', '--offline', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('not installed'));
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
  assert.match(stdout, /lib\/mypkg\/a\.lua\s+verified/);
  assert.match(stdout, /lib\/mypkg\/b\.lua\s+verified/);
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

test('install (no args): broken untrusted url package requires explicit repair consent', () => {
  const dir = makeTmp();
  const content = 'return {}\n';
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { kind: 'url', url: 'data:text/plain,return%20%7B%7D%0A', urls: ['data:text/plain,return%20%7B%7D%0A'] },
      files: [{ name: 'helper.lua', target: 'lib/helper.lua', sha256: sha256(content) }],
    },
  });

  const result = run(['package', 'install', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('--allow-untrusted'));
  assert.equal(existsSync(join(dir, 'lib', 'helper.lua')), false);
});

test('install (no args): --allow-untrusted repairs broken url package', () => {
  const dir = makeTmp();
  const content = 'return {}\n';
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { kind: 'url', url: 'data:text/plain,return%20%7B%7D%0A', urls: ['data:text/plain,return%20%7B%7D%0A'] },
      files: [{ name: 'helper.lua', target: 'lib/helper.lua', sha256: sha256(content) }],
    },
  });

  const result = run(['package', 'install', '--dir', dir, '--allow-untrusted']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(readFileSync(join(dir, 'lib', 'helper.lua'), 'utf8'), content);
});

test('remove: url package removes file and lockfile entry', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), 'return {}');
  writeUrlLock(dir, 'my-helper', [
    { name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: 'any' },
  ]);
  const { exitCode } = run(['package', 'remove', 'my-helper', '--dir', dir, '--yes']);
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
  const { exitCode } = run(['package', 'remove', 'mypkg', '--dir', dir, '--yes']);
  assert.equal(exitCode, 0);
  assert.ok(!existsSync(join(dir, 'lib', 'mypkg', 'a.lua')));
  assert.ok(!existsSync(join(dir, 'lib', 'mypkg', 'b.lua')));
});

test('plugin remove: --yes removes plugin in non-interactive mode', () => {
  const dir = makeTmp();
  const pluginDir = join(dir, 'feather', 'plugins', 'my-plugin');
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    join(pluginDir, 'manifest.lua'),
    'return { id = "my-plugin", name = "My Plugin", version = "1.0.0" }\n',
  );

  const { stdout, exitCode } = run(['plugin', 'remove', 'my-plugin', '--dir', dir, '--yes']);
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('Removed my-plugin'));
  assert.ok(!existsSync(pluginDir), 'plugin directory should be deleted');
});

test('output: NO_COLOR keeps package search readable without ANSI escapes', () => {
  const { stdout, exitCode } = run(['package', 'search', 'anim', '--offline'], {
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  assert.equal(exitCode, 0);
  assert.ok(stdout.includes('anim8'));
  // eslint-disable-next-line no-control-regex
  assert.equal(/\x1B\[[0-?]*[ -/]*[@-~]/.test(stdout), false);
});

test('output: command and lib sources route terminal writes through output helpers', () => {
  const allowed = new Set([
    join(ROOT, 'cli', 'src', 'lib', 'output.ts'),
    join(ROOT, 'cli', 'src', 'lib', 'command.ts'),
  ]);
  const files = [
    ...sourceFiles(join(ROOT, 'cli', 'src', 'commands')),
    ...sourceFiles(join(ROOT, 'cli', 'src', 'lib')),
  ].filter((file) => !allowed.has(file));

  const offenders = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return source.match(/console\.(?:log|error)\s*\(/) ? [file.replace(`${ROOT}/`, '')] : [];
  });

  assert.deepEqual(offenders, []);
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

test('command errors: central handler writes compact stderr and exit code', () => {
  const dir = makeTmp();
  const result = run(['package', 'info', 'zzz_no_such_pkg', '--offline', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(result.stderr.includes('not found'));
  assert.equal(result.stderr.includes('Error:'), false);
});

test('registry validation rejects targets outside the project', async () => {
  const { validateRegistry } = await import('../../dist/lib/package/registry.js');
  assert.throws(
    () =>
      validateRegistry({
        version: 1,
        updatedAt: '2026-05-16',
        packages: {
          escape: {
            type: 'love2d-library',
            trust: 'verified',
            description: 'bad target',
            tags: [],
            source: {
              repo: 'owner/repo',
              tag: 'main',
              baseUrl: 'https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/',
              commitSha: '0123456789abcdef0123456789abcdef01234567',
            },
            install: {
              files: [{ name: 'escape.lua', target: '../escape.lua', sha256: 'a'.repeat(64) }],
            },
            require: 'escape',
          },
        },
      }),
    /escapes project root/,
  );
});

test('registry validation accepts fixed install layout', async () => {
  const { validateRegistry } = await import('../../dist/lib/package/registry.js');
  const registry = validateRegistry({
    version: 1,
    updatedAt: '2026-05-16',
    packages: {
      fixed: {
        type: 'love2d-library',
        trust: 'verified',
        description: 'fixed layout',
        tags: [],
        source: {
          repo: 'owner/repo',
          tag: 'main',
          baseUrl: 'https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/',
          commitSha: '0123456789abcdef0123456789abcdef01234567',
        },
        install: {
          layout: 'fixed',
          files: [{ name: 'libs/json.lua', target: 'libs/json.lua', sha256: 'a'.repeat(64) }],
        },
        require: 'libs.json',
      },
    },
  });

  assert.equal(registry.packages.fixed.install.layout, 'fixed');
});

test('registry validation rejects invalid install layout', async () => {
  const { validateRegistry } = await import('../../dist/lib/package/registry.js');
  assert.throws(
    () =>
      validateRegistry({
        version: 1,
        updatedAt: '2026-05-16',
        packages: {
          fixed: {
            type: 'love2d-library',
            trust: 'verified',
            description: 'bad layout',
            tags: [],
            source: {
              repo: 'owner/repo',
              tag: 'main',
              baseUrl: 'https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/',
              commitSha: '0123456789abcdef0123456789abcdef01234567',
            },
            install: {
              layout: 'nested',
              files: [{ name: 'mod.lua', target: 'lib/mod.lua', sha256: 'a'.repeat(64) }],
            },
            require: 'lib.mod',
          },
        },
      }),
    /install\.layout/,
  );
});

test('registry validation rejects missing dependency ids', async () => {
  const { validateRegistry } = await import('../../dist/lib/package/registry.js');
  assert.throws(
    () =>
      validateRegistry({
        version: 1,
        updatedAt: '2026-05-16',
        packages: {
          app: {
            type: 'love2d-library',
            trust: 'verified',
            description: 'depends on missing',
            tags: [],
            source: {
              repo: 'owner/app',
              tag: 'main',
              baseUrl: 'https://raw.githubusercontent.com/owner/app/0123456789abcdef0123456789abcdef01234567/',
              commitSha: '0123456789abcdef0123456789abcdef01234567',
            },
            install: {
              files: [{ name: 'app.lua', target: 'lib/app.lua', sha256: 'a'.repeat(64) }],
            },
            dependencies: ['missing'],
            require: 'lib.app',
          },
        },
      }),
    /dependency missing is missing/,
  );
});

test('registry validation rejects dependency aliases that are not declared dependencies', async () => {
  const { validateRegistry } = await import('../../dist/lib/package/registry.js');
  assert.throws(
    () =>
      validateRegistry({
        version: 1,
        updatedAt: '2026-05-16',
        packages: {
          app: {
            type: 'love2d-library',
            trust: 'verified',
            description: 'aliases undeclared dependency',
            tags: [],
            source: {
              repo: 'owner/app',
              tag: 'main',
              baseUrl: 'https://raw.githubusercontent.com/owner/app/0123456789abcdef0123456789abcdef01234567/',
              commitSha: '0123456789abcdef0123456789abcdef01234567',
            },
            install: {
              files: [{ name: 'app.lua', target: 'lib/app.lua', sha256: 'a'.repeat(64) }],
            },
            dependencyAliases: [{ dependency: 'dep', target: 'lib/app/vendor/dep.lua' }],
            require: 'lib.app',
          },
          dep: {
            type: 'love2d-library',
            trust: 'verified',
            description: 'dep',
            tags: [],
            source: {
              repo: 'owner/dep',
              tag: 'main',
              baseUrl: 'https://raw.githubusercontent.com/owner/dep/0123456789abcdef0123456789abcdef01234567/',
              commitSha: '0123456789abcdef0123456789abcdef01234567',
            },
            install: {
              files: [{ name: 'dep.lua', target: 'lib/dep.lua', sha256: 'b'.repeat(64) }],
            },
            require: 'lib.dep',
          },
        },
      }),
    /must also be listed in dependencies/,
  );
});

test('resolver expands exact dependencies in dependency-first order and dedupes shared dependencies', async () => {
  const { resolveMany } = await import('../../dist/lib/package/resolve.js');
  const pkg = (id, dependencies = []) => ({
    type: 'love2d-library',
    trust: 'verified',
    description: id,
    tags: [],
    source: { repo: `owner/${id}`, tag: 'main', baseUrl: 'https://example.com/', commitSha: '0123456789abcdef0123456789abcdef01234567' },
    install: { files: [{ name: `${id}.lua`, target: `lib/${id}.lua`, sha256: 'a'.repeat(64) }] },
    dependencies,
    require: `lib.${id}`,
  });
  const registry = {
    version: 1,
    updatedAt: '2026-05-16',
    packages: {
      root: pkg('root', ['left', 'right']),
      left: pkg('left', ['shared']),
      right: pkg('right', ['shared']),
      shared: pkg('shared'),
    },
  };

  const { resolved, errors } = resolveMany(['root'], registry);

  assert.deepEqual(errors, []);
  assert.deepEqual(resolved.map((item) => item.id), ['shared', 'left', 'right', 'root']);
  assert.deepEqual(resolved.find((item) => item.id === 'shared').dependencyOf.sort(), ['left', 'right']);
});

test('resolver rejects dependency cycles', async () => {
  const { resolveMany } = await import('../../dist/lib/package/resolve.js');
  const pkg = (id, dependencies = []) => ({
    type: 'love2d-library',
    trust: 'verified',
    description: id,
    tags: [],
    source: { repo: `owner/${id}`, tag: 'main', baseUrl: 'https://example.com/', commitSha: '0123456789abcdef0123456789abcdef01234567' },
    install: { files: [{ name: `${id}.lua`, target: `lib/${id}.lua`, sha256: 'a'.repeat(64) }] },
    dependencies,
    require: `lib.${id}`,
  });
  const { errors } = resolveMany(['a'], {
    version: 1,
    updatedAt: '2026-05-16',
    packages: {
      a: pkg('a', ['b']),
      b: pkg('b', ['a']),
    },
  });

  assert.match(errors.join('\n'), /Package dependency cycle: a -> b -> a/);
});

test('resolver rejects conflicting direct override and exact dependency version', async () => {
  const { resolveMany } = await import('../../dist/lib/package/resolve.js');
  const pkg = (id, dependencies = []) => ({
    type: 'love2d-library',
    trust: 'verified',
    description: id,
    tags: [],
    source: { repo: `owner/${id}`, tag: 'main', baseUrl: 'https://example.com/', commitSha: '0123456789abcdef0123456789abcdef01234567' },
    install: { files: [{ name: `${id}.lua`, target: `lib/${id}.lua`, sha256: 'a'.repeat(64) }] },
    dependencies,
    require: `lib.${id}`,
  });
  const { errors } = resolveMany(['dep@other', 'root'], {
    version: 1,
    updatedAt: '2026-05-16',
    packages: {
      root: pkg('root', ['dep']),
      dep: pkg('dep'),
    },
  });

  assert.match(errors.join('\n'), /conflicting versions/);
});

test('resolver reports already-installed dependency conflicts', async () => {
  const { dependencyInstallConflicts } = await import('../../dist/lib/package/resolve.js');
  const pkg = {
    id: 'dep',
    entry: {
      source: { tag: 'main' },
    },
    files: [],
    dependencyOf: ['root'],
  };

  assert.deepEqual(
    dependencyInstallConflicts([pkg], {
      lockfileVersion: 1,
      generatedAt: new Date(0).toISOString(),
      packages: {
        dep: {
          version: 'old',
          trust: 'verified',
          source: { repo: 'owner/dep', tag: 'old' },
          files: [],
          installedAt: new Date(0).toISOString(),
        },
      },
    }),
    ['"dep" is required by root but is already installed as old. Remove or update it before installing dependent packages.'],
  );
});

test('resolver reports experimental installed dependency conflicts', async () => {
  const { dependencyInstallConflicts } = await import('../../dist/lib/package/resolve.js');
  const pkg = {
    id: 'dep',
    entry: {
      source: { tag: 'main' },
    },
    files: [],
    dependencyOf: ['root'],
  };

  const conflicts = dependencyInstallConflicts([pkg], {
    lockfileVersion: 1,
    generatedAt: new Date(0).toISOString(),
    packages: {
      dep: {
        version: 'main',
        trust: 'experimental',
        source: { repo: 'owner/dep', tag: 'main' },
        files: [],
        installedAt: new Date(0).toISOString(),
      },
    },
  });

  assert.equal(conflicts.length, 1);
});

test('init: --yes --mode auto patches main.lua with guarded markers', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { exitCode } = run([
    'init',
    dir,
    '--mode',
    'auto',
    '--local-src',
    LOCAL_SRC,
    '--install-dir',
    'feather',
    '--no-plugins',
    '--yes',
  ]);
  assert.equal(exitCode, 0);
  const main = readFileSync(join(dir, 'main.lua'), 'utf8');
  assert.ok(main.includes('FEATHER-INIT-BEGIN require'));
  assert.ok(main.includes('USE_DEBUGGER'));
});

test('remove: non-interactive destructive remove requires --yes', () => {
  const dir = makeTmp();
  writeGame(dir);
  run(['init', dir, '--mode', 'auto', '--local-src', LOCAL_SRC, '--install-dir', 'feather', '--no-plugins', '--yes']);
  const result = run(['remove', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('--yes'));
  assert.ok(existsSync(join(dir, 'feather.config.lua')));
});

test('remove: dry-run does not delete files or edit main.lua', () => {
  const dir = makeTmp();
  writeGame(dir);
  run(['init', dir, '--mode', 'auto', '--local-src', LOCAL_SRC, '--install-dir', 'feather', '--no-plugins', '--yes']);
  const beforeMain = readFileSync(join(dir, 'main.lua'), 'utf8');
  const { exitCode } = run(['remove', dir, '--dry-run']);
  assert.equal(exitCode, 0);
  assert.equal(readFileSync(join(dir, 'main.lua'), 'utf8'), beforeMain);
  assert.ok(existsSync(join(dir, 'feather')));
  assert.ok(existsSync(join(dir, 'feather.config.lua')));
});

test('doctor --json reports package audit problems and unsafe config flags', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  include = { "console" },
  apiKey = "dev",
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  debugger = true,
  captureScreenshot = true,
  writeToDisk = true,
}
`,
  );
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { url: 'https://example.com/helper.lua' },
      files: [
        {
          name: 'helper.lua',
          url: 'https://example.com/helper.lua',
          target: 'lib/helper.lua',
          sha256: sha256('expected'),
        },
      ],
    },
  });
  const result = run(['doctor', dir, '--json']);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Package file integrity').severity, 'warn');
  assert.equal(labels.get('__DANGEROUS_INSECURE_CONNECTION__').severity, 'warn');
  assert.equal(labels.get('Console API key').severity, 'warn');
  assert.equal(labels.get('Step debugger').severity, 'warn');
  assert.equal(labels.get('captureScreenshot').severity, 'warn');
  assert.equal(labels.get('Disk logging').severity, 'warn');
});

test('doctor --json reports included plugins missing or unknown', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { include = { "console", "missing-plugin" } }\n');

  const result = run(['doctor', dir, '--json']);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  const consoleCheck = labels.get('Plugin console');
  const unknownCheck = labels.get('Plugin missing-plugin');

  assert.equal(consoleCheck.severity, 'warn');
  assert.equal(consoleCheck.detail, 'included but not installed');
  assert.ok(consoleCheck.fix.includes(`feather plugin install console --dir ${dir} --install-dir feather`));
  assert.equal(unknownCheck.severity, 'warn');
  assert.equal(unknownCheck.detail, 'included but unknown');
  assert.ok(unknownCheck.fix.includes('Remove or correct "missing-plugin"'));
});

test('doctor --json reports malformed installed plugin manifests with exact update fix', () => {
  const dir = makeTmp();
  writeGame(dir);
  mkdirSync(join(dir, 'feather', 'plugins', 'bad-plugin'), { recursive: true });
  writeFileSync(join(dir, 'feather', 'init.lua'), 'return {}\n');
  writeFileSync(join(dir, 'feather', 'plugins', 'bad-plugin', 'manifest.lua'), 'return { name = "Bad Plugin" }\n');

  const result = run(['doctor', dir, '--json']);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  const manifestCheck = labels.get('Plugin manifests');

  assert.equal(manifestCheck.severity, 'warn');
  assert.equal(manifestCheck.detail, '1 missing id');
  assert.ok(manifestCheck.fix.includes(`feather plugin update --dir ${dir} --install-dir feather --yes`));
});

test('doctor --json reports package file recovery and stale bundled registry versions', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test" }\n');
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'anim8.lua'), 'tampered');
  writeLock(dir, {
    anim8: {
      version: 'v0.0.0',
      trust: 'verified',
      source: { repo: 'kikito/anim8', tag: 'v0.0.0' },
      files: [{ name: 'anim8.lua', target: 'lib/anim8.lua', sha256: sha256('original') }],
    },
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { url: 'https://example.com/helper.lua' },
      files: [
        {
          name: 'helper.lua',
          url: 'https://example.com/helper.lua',
          target: 'lib/helper.lua',
          sha256: sha256('expected'),
        },
      ],
    },
  });

  const result = run(['doctor', dir, '--json']);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));

  assert.equal(labels.get('Package file integrity').severity, 'warn');
  assert.ok(labels.get('Package file integrity').fix.includes(`feather package install --dir ${dir}`));
  assert.equal(labels.get('Package anim8 files').detail, '1 modified');
  assert.ok(labels.get('Package anim8 files').fix.includes(`feather package install --dir ${dir}`));
  assert.equal(labels.get('Package helper files').detail, '1 missing');
  assert.equal(labels.get('Package anim8 version').severity, 'warn');
  assert.ok(labels.get('Package anim8 version').fix.includes(`feather package update anim8 --dir ${dir}`));
  assert.equal(labels.has('Package helper version'), false);
});

test('doctor --json reports untrusted lockfile source URLs', () => {
  const dir = makeTmp();
  writeGame(dir);
  const commitSha = '0123456789abcdef0123456789abcdef01234567';
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { kind: 'url', url: 'https://example.com/helper.lua', urls: ['https://example.com/helper.lua'] },
      files: [
        {
          name: 'helper.lua',
          url: 'https://example.com/helper.lua',
          target: 'lib/helper.lua',
          sha256: sha256('expected'),
        },
      ],
    },
    'raw-helper': {
      version: 'main',
      trust: 'experimental',
      source: { repo: 'me/pkg', tag: 'main', resolvedRef: commitSha, commitSha },
      files: [{ name: 'raw.lua', target: 'lib/raw.lua', sha256: sha256('expected') }],
    },
  });

  const result = run(['doctor', dir, '--json']);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  const sourceCheck = labels.get('Package helper source');

  assert.equal(sourceCheck.severity, 'warn');
  const detailUrls = (sourceCheck.detail.match(/https?:\/\/[^\s)]+/g) || [])
    .map((value) => {
      try {
        return new URL(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  assert.ok(detailUrls.some((parsedUrl) => parsedUrl.hostname === 'example.com'));
  assert.ok(sourceCheck.fix.includes('--allow-untrusted'));
  assert.equal(labels.has('Package raw-helper source'), false);
});

test('doctor --json reports future package lock features with update guidance', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeLockFixture(dir, 'future-feature.json');

  const result = run(['doctor', dir, '--json']);
  assert.equal(result.exitCode, 1);
  const parsed = JSON.parse(result.stdout);
  const lockCheck = parsed.checks.find((check) => check.group === 'Packages' && check.label === 'Package lockfile');

  assert.equal(lockCheck.severity, 'fail');
  assert.ok(lockCheck.detail.includes('require Feather >=9.0.0'));
  assert.ok(lockCheck.detail.includes('made-up-future-feature'));
  assert.ok(lockCheck.fix.includes('Update Feather'));
});

test('doctor --json reports non-experimental packages missing from bundled registry', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeLock(dir, {
    'local-legacy': {
      version: 'v1.0.0',
      trust: 'known',
      source: { repo: 'me/local-legacy', tag: 'v1.0.0' },
      files: [],
    },
  });

  const result = run(['doctor', dir, '--json']);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  const registryCheck = labels.get('Package local-legacy registry');

  assert.equal(registryCheck.severity, 'warn');
  assert.equal(registryCheck.detail, 'not found in bundled registry');
  assert.ok(registryCheck.fix.includes(`feather package remove local-legacy --dir ${dir} --yes`));
});

test('doctor: human report includes grouped checks and summary', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test", include = { "console" } }\n');
  const result = run(['doctor', dir]);
  assert.match(result.stdout, /Feather doctor/);
  assert.match(result.stdout, /Environment/);
  assert.match(result.stdout, /Project/);
  assert.match(result.stdout, /Plugin console/);
  assert.match(result.stdout, /feather plugin install console/);
  assert.match(result.stdout, /passed, .* warnings, .* failures/);
});

async function withFetchMock(mock, runTest) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await runTest();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function emptyLockfile() {
  return { lockfileVersion: 1, generatedAt: new Date(0).toISOString(), packages: {} };
}

function initSetupState(overrides = {}) {
  return {
    mode: 'auto',
    installSource: 'local',
    branch: 'main',
    installDir: 'feather',
    installPlugins: true,
    pluginPromptsEnabled: true,
    include: new Set(),
    exclude: new Set(['console']),
    advanced: false,
    sessionName: 'My Game',
    host: '127.0.0.1',
    port: '4004',
    socketModeIndex: 0,
    baseDir: '',
    sampleRate: '1',
    updateInterval: '0.1',
    maxTempLogs: '200',
    outputDir: 'logs',
    retryInterval: '5',
    connectTimeout: '2',
    errorWait: '3',
    binaryTextThreshold: '4096',
    deviceId: '',
    capabilities: 'all',
    toggles: new Set(['debug', 'wrapPrint', 'defaultObservers']),
    needsApiKey: false,
    apiKey: '',
    appIdInput: 'feather-app-test',
    ...overrides,
  };
}

test('package add: repo plan converts to custom install input', async () => {
  const { packageAddPlanFiles, toCustomRepoPackageInput } = await import('../../dist/lib/package/add-plan.js');
  const lockfile = emptyLockfile();
  const commitSha = '0123456789abcdef0123456789abcdef01234567';
  const plan = {
    kind: 'repo',
    id: 'my-pkg',
    requirePath: 'lib.my-pkg.init',
    repoName: 'me/pkg',
    tag: 'v1.0.0',
    commitSha,
    baseUrl: `https://raw.githubusercontent.com/me/pkg/${commitSha}/`,
    selectedFiles: ['init.lua', 'util.lua'],
    targetMap: { 'init.lua': 'lib/my-pkg/init.lua', 'util.lua': 'lib/my-pkg/util.lua' },
  };

  assert.deepEqual(packageAddPlanFiles(plan), [
    { name: 'init.lua', target: 'lib/my-pkg/init.lua' },
    { name: 'util.lua', target: 'lib/my-pkg/util.lua' },
  ]);
  assert.deepEqual(toCustomRepoPackageInput({ plan, projectDir: '/tmp/game', lockfile }), {
    id: 'my-pkg',
    repoName: 'me/pkg',
    tag: 'v1.0.0',
    commitSha,
    baseUrl: `https://raw.githubusercontent.com/me/pkg/${commitSha}/`,
    selectedFiles: ['init.lua', 'util.lua'],
    targetMap: { 'init.lua': 'lib/my-pkg/init.lua', 'util.lua': 'lib/my-pkg/util.lua' },
    projectDir: '/tmp/game',
    lockfile,
    onFileStart: undefined,
  });
});

test('package add: url plan converts to custom install input', async () => {
  const { packageAddPlanFiles, toCustomUrlPackageInput } = await import('../../dist/lib/package/add-plan.js');
  const lockfile = emptyLockfile();
  const urlFiles = [
    {
      name: 'helper.lua',
      url: 'https://example.com/helper.lua',
      sha256: sha256('return {}'),
      target: 'lib/helper.lua',
      buffer: Buffer.from('return {}'),
    },
  ];
  const plan = { kind: 'url', id: 'helper', requirePath: 'lib.helper', urlFiles };

  assert.deepEqual(packageAddPlanFiles(plan), [{ name: 'helper.lua', target: 'lib/helper.lua' }]);
  assert.deepEqual(toCustomUrlPackageInput({ plan, projectDir: '/tmp/game', lockfile }), {
    id: 'helper',
    urlFiles,
    projectDir: '/tmp/game',
    lockfile,
  });
});

test('package add: failed plan install does not write lockfile', async () => {
  const dir = makeTmp();
  const { installPackageAddPlan } = await import('../../dist/lib/package/add-plan.js');

  await withFetchMock(
    async () => new Response('missing', { status: 404 }),
    async () => {
      const result = await installPackageAddPlan({
        projectDir: dir,
        lockfile: emptyLockfile(),
        plan: {
          kind: 'repo',
          id: 'my-pkg',
          requirePath: 'lib.my-pkg.init',
          repoName: 'me/pkg',
          tag: 'v1.0.0',
          commitSha: '0123456789abcdef0123456789abcdef01234567',
          baseUrl: 'https://raw.githubusercontent.com/me/pkg/abc123/',
          selectedFiles: ['init.lua'],
          targetMap: { 'init.lua': 'lib/my-pkg/init.lua' },
        },
      });

      assert.equal(result.ok, false);
      assert.equal(existsSync(join(dir, 'feather.lock.json')), false);
    },
  );
});

test('init mode: config builder preserves cli and advanced setup values', async () => {
  const { buildInitSetup } = await import('../../dist/ui/init/config.js');
  const setup = buildInitSetup(
    initSetupState({
      mode: 'cli',
      installSource: 'remote',
      branch: 'dev',
      installDir: '',
      installPlugins: true,
      include: new Set(['console']),
      exclude: new Set(),
      advanced: true,
      port: '5000',
      socketModeIndex: 1,
      capabilities: 'logs, assets',
      toggles: new Set(['debug', 'captureScreenshot']),
      needsApiKey: true,
      apiKey: 'StrongSecret123!',
      appIdInput: '',
    }),
  );

  assert.equal(setup.mode, 'cli');
  assert.equal(setup.source, 'remote');
  assert.equal(setup.branch, 'dev');
  assert.equal(setup.installDir, 'feather');
  assert.deepEqual(setup.config.include, ['console']);
  assert.equal(setup.config.port, 5000);
  assert.equal(setup.config.mode, 'disk');
  assert.deepEqual(setup.config.capabilities, ['assets', 'filesystem', 'logs']);
  assert.equal(setup.config.captureScreenshot, true);
  assert.equal(setup.config.apiKey, 'StrongSecret123!');
  assert.deepEqual(setup.config.pluginOptions, { console: { evalEnabled: true } });
  assert.equal(setup.config.__DANGEROUS_INSECURE_CONNECTION__, true);
});

test('init mode: selected plugins add required capabilities automatically', async () => {
  const { buildInitSetup } = await import('../../dist/ui/init/config.js');
  const setup = buildInitSetup(
    initSetupState({
      include: new Set(['collision-debug', 'console', 'input-replay']),
      exclude: new Set(),
      advanced: false,
      needsApiKey: true,
      apiKey: 'StrongSecret123!',
    }),
  );

  assert.deepEqual(setup.config.include, ['collision-debug', 'console', 'input-replay']);
  assert.deepEqual(setup.config.capabilities, ['draw', 'filesystem', 'input']);
});

test('custom add: repo install writes selected files and lockfile metadata', async () => {
  const dir = makeTmp();
  const { installCustomRepoPackage } = await import('../../dist/lib/package/custom-add.js');
  const commitSha = '0123456789abcdef0123456789abcdef01234567';
  const files = new Map([
    [`https://raw.githubusercontent.com/me/pkg/${commitSha}/init.lua`, 'return "init"'],
    [`https://raw.githubusercontent.com/me/pkg/${commitSha}/util.lua`, 'return "util"'],
  ]);

  await withFetchMock(
    async (url) => {
      const body = files.get(String(url));
      return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
    },
    async () => {
      const result = await installCustomRepoPackage({
        id: 'my-pkg',
        repoName: 'me/pkg',
        tag: 'v1.0.0',
        commitSha,
        baseUrl: `https://raw.githubusercontent.com/me/pkg/${commitSha}/`,
        selectedFiles: ['init.lua', 'util.lua'],
        targetMap: { 'init.lua': 'lib/my-pkg/init.lua', 'util.lua': 'lib/my-pkg/util.lua' },
        projectDir: dir,
        lockfile: emptyLockfile(),
      });

      assert.equal(result.ok, true);
      assert.equal(readFileSync(join(dir, 'lib', 'my-pkg', 'init.lua'), 'utf8'), 'return "init"');
      assert.equal(readFileSync(join(dir, 'lib', 'my-pkg', 'util.lua'), 'utf8'), 'return "util"');

      const lock = JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
      assert.equal(lock.packages['my-pkg'].version, 'v1.0.0');
      assert.equal(lock.packages['my-pkg'].trust, 'experimental');
      assert.deepEqual(lock.packages['my-pkg'].source, {
        repo: 'me/pkg',
        tag: 'v1.0.0',
        resolvedRef: commitSha,
        commitSha,
      });
      assert.equal(lock.packages['my-pkg'].files.length, 2);
      assert.equal(
        lock.packages['my-pkg'].files[0].url,
        `https://raw.githubusercontent.com/me/pkg/${commitSha}/init.lua`,
      );
    },
  );
});

test('custom add: URL install writes buffered files and lockfile metadata', async () => {
  const dir = makeTmp();
  const { installCustomUrlPackage } = await import('../../dist/lib/package/custom-add.js');
  const buffer = Buffer.from('return "helper"');
  const otherBuffer = Buffer.from('return "other"');
  const result = await installCustomUrlPackage({
    id: 'my-helper',
    urlFiles: [
      {
        name: 'helper.lua',
        url: 'https://example.com/helper.lua',
        sha256: 'stale-sha-is-recomputed',
        target: 'lib/helper.lua',
        buffer,
      },
      {
        name: 'other.lua',
        url: 'https://example.com/other.lua',
        sha256: 'stale-sha-is-recomputed',
        target: 'lib/other.lua',
        buffer: otherBuffer,
      },
    ],
    projectDir: dir,
    lockfile: emptyLockfile(),
  });

  assert.equal(result.ok, true);
  assert.equal(readFileSync(join(dir, 'lib', 'helper.lua'), 'utf8'), 'return "helper"');
  const lock = JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
  assert.equal(lock.packages['my-helper'].version, 'url');
  assert.equal(lock.packages['my-helper'].trust, 'experimental');
  assert.deepEqual(lock.packages['my-helper'].source, {
    kind: 'url',
    url: 'https://example.com/helper.lua',
    urls: ['https://example.com/helper.lua', 'https://example.com/other.lua'],
  });
  assert.equal(lock.packages['my-helper'].files[0].sha256, sha256(buffer));
  assert.equal(lock.packages['my-helper'].files[1].url, 'https://example.com/other.lua');
});

test('custom add: lockfile source validation rejects malformed optional provenance', async () => {
  const { validateLockfileSource } = await import('../../dist/lib/package/lockfile.js');

  assert.throws(() => validateLockfileSource({ repo: 'me/pkg', tag: 'main', commitSha: 'abc123' }), /commitSha/);
  assert.throws(
    () => validateLockfileSource({ kind: 'url', url: 'https://example.com/helper.lua', urls: [] }),
    /source\.urls/,
  );
  assert.throws(
    () => validateLockfileSource({ kind: 'url', url: 'https://example.com/helper.lua', urls: [''] }),
    /source\.urls/,
  );
});

test('custom add: invalid repo commit provenance is rejected before fetch or write', async () => {
  const dir = makeTmp();
  const { installCustomRepoPackage } = await import('../../dist/lib/package/custom-add.js');
  let fetchCalled = false;

  await withFetchMock(
    async () => {
      fetchCalled = true;
      return new Response('return {}');
    },
    async () => {
      const result = await installCustomRepoPackage({
        id: 'bad-sha',
        repoName: 'me/pkg',
        tag: 'main',
        commitSha: 'abc123',
        baseUrl: 'https://raw.githubusercontent.com/me/pkg/abc123/',
        selectedFiles: ['init.lua'],
        targetMap: { 'init.lua': 'lib/init.lua' },
        projectDir: dir,
        lockfile: emptyLockfile(),
      });

      assert.equal(result.ok, false);
      assert.equal(fetchCalled, false);
      assert.match(result.error, /commitSha/);
      assert.equal(existsSync(join(dir, 'feather.lock.json')), false);
    },
  );
});

test('install package: installDir writes preserved layout and saves lockfile preference', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "feel"';
  const vendorContent = 'return "flux"';
  const pkg = {
    id: 'feel',
    entry: {
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main', baseUrl: 'https://example.com/' },
    },
    files: [
      { name: 'feel/init.lua', target: 'lib/feel/init.lua', sha256: sha256(content) },
      { name: 'feel/vendor/flux.lua', target: 'lib/feel/vendor/flux.lua', sha256: sha256(vendorContent) },
    ],
  };

  await withFetchMock(
    async (url) => {
      const body = String(url).endsWith('/feel/init.lua') ? content : vendorContent;
      return new Response(body);
    },
    async () => {
      const lockfile = emptyLockfile();
      const result = await installPackage(pkg, lockfile, {
        projectDir: dir,
        installDir: 'vendor',
        saveInstallDir: true,
      });

      assert.equal(result.ok, true);
      assert.equal(readFileSync(join(dir, 'vendor', 'feel', 'init.lua'), 'utf8'), content);
      assert.equal(readFileSync(join(dir, 'vendor', 'feel', 'vendor', 'flux.lua'), 'utf8'), vendorContent);
      assert.equal(lockfile.packages.feel.installDir, 'vendor');
      assert.deepEqual(lockfile.packages.feel.files.map((file) => file.target), [
        'vendor/feel/init.lua',
        'vendor/feel/vendor/flux.lua',
      ]);
    },
  );
});

test('install package: installDir without save only records transformed file targets', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "feel"';
  const pkg = {
    id: 'feel',
    entry: {
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main', baseUrl: 'https://example.com/' },
    },
    files: [{ name: 'feel/init.lua', target: 'lib/feel/init.lua', sha256: sha256(content) }],
  };

  await withFetchMock(
    async () => new Response(content),
    async () => {
      const lockfile = emptyLockfile();
      const result = await installPackage(pkg, lockfile, {
        projectDir: dir,
        installDir: 'vendor',
      });

      assert.equal(result.ok, true);
      assert.equal(lockfile.packages.feel.installDir, undefined);
      assert.equal(lockfile.packages.feel.files[0].target, 'vendor/feel/init.lua');
    },
  );
});

test('install package: dependency aliases write generated shims and lock metadata', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "feel"';
  const lockfile = emptyLockfile();
  lockfile.packages.flux = {
    version: 'main',
    trust: 'verified',
    source: { repo: 'rxi/flux', tag: 'main' },
    files: [{ name: 'flux.lua', target: 'lib/flux.lua', sha256: sha256('return "flux"') }],
    installedAt: new Date(0).toISOString(),
  };
  const pkg = {
    id: 'feel',
    entry: {
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main', baseUrl: 'https://example.com/' },
      install: {},
    },
    files: [{ name: 'feel/init.lua', target: 'lib/feel/init.lua', sha256: sha256(content) }],
    dependencyAliases: [
      {
        dependency: 'flux',
        target: 'lib/feel/vendor/flux.lua',
        dependencyEntry: { require: 'lib.flux' },
      },
    ],
  };

  await withFetchMock(
    async () => new Response(content),
    async () => {
      const result = await installPackage(pkg, lockfile, { projectDir: dir });

      assert.equal(result.ok, true);
      const aliasContent = readFileSync(join(dir, 'lib', 'feel', 'vendor', 'flux.lua'), 'utf8');
      assert.equal(aliasContent, '-- Generated by Feather package manager. Do not edit.\nreturn require("lib.flux")\n');
      const aliasFile = lockfile.packages.feel.files.find((file) => file.target === 'lib/feel/vendor/flux.lua');
      assert.deepEqual(aliasFile.generated, { type: 'require-alias', require: 'lib.flux' });
      assert.equal(aliasFile.sha256, sha256(aliasContent));
      assert.equal(lockfile.requiresFeather, LOCK_FEATURE_REQUIREMENT);
      assert.deepEqual(lockfile.features, ['generated-require-aliases', 'package-dependencies']);
    },
  );
});

test('install package: dependency-only installs mark dependency lock feature', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "dep"';
  const pkg = {
    id: 'flux',
    entry: {
      trust: 'verified',
      source: { repo: 'rxi/flux', tag: 'main', baseUrl: 'https://example.com/' },
      install: {},
    },
    files: [{ name: 'flux.lua', target: 'lib/flux.lua', sha256: sha256(content) }],
    dependencyOf: ['feel'],
  };

  await withFetchMock(
    async () => new Response(content),
    async () => {
      const lockfile = emptyLockfile();
      const result = await installPackage(pkg, lockfile, { projectDir: dir });

      assert.equal(result.ok, true);
      assert.equal(lockfile.requiresFeather, LOCK_FEATURE_REQUIREMENT);
      assert.deepEqual(lockfile.features, ['package-dependencies']);
    },
  );
});

test('install package: dependency aliases use dependency installDir require path', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "feel"';
  const lockfile = emptyLockfile();
  lockfile.packages.flux = {
    version: 'main',
    trust: 'verified',
    source: { repo: 'rxi/flux', tag: 'main' },
    installDir: 'vendor',
    files: [{ name: 'flux.lua', target: 'vendor/flux.lua', sha256: sha256('return "flux"') }],
    installedAt: new Date(0).toISOString(),
  };
  const pkg = {
    id: 'feel',
    entry: {
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main', baseUrl: 'https://example.com/' },
      install: {},
    },
    files: [{ name: 'feel/init.lua', target: 'lib/feel/init.lua', sha256: sha256(content) }],
    dependencyAliases: [
      {
        dependency: 'flux',
        target: 'lib/feel/vendor/flux.lua',
        dependencyEntry: { require: 'lib.flux' },
      },
    ],
  };

  await withFetchMock(
    async () => new Response(content),
    async () => {
      const result = await installPackage(pkg, lockfile, { projectDir: dir, installDir: 'vendor', saveInstallDir: true });

      assert.equal(result.ok, true);
      assert.equal(
        readFileSync(join(dir, 'vendor', 'feel', 'vendor', 'flux.lua'), 'utf8'),
        '-- Generated by Feather package manager. Do not edit.\nreturn require("vendor.flux")\n',
      );
      assert.equal(lockfile.packages.feel.files.find((file) => file.generated)?.target, 'vendor/feel/vendor/flux.lua');
    },
  );
});

test('install package: dependency alias target collision fails when unowned', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  mkdirSync(join(dir, 'lib', 'feel', 'vendor'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'feel', 'vendor', 'flux.lua'), 'return "user file"');
  const lockfile = emptyLockfile();
  lockfile.packages.flux = {
    version: 'main',
    trust: 'verified',
    source: { repo: 'rxi/flux', tag: 'main' },
    files: [{ name: 'flux.lua', target: 'lib/flux.lua', sha256: sha256('return "flux"') }],
    installedAt: new Date(0).toISOString(),
  };
  const pkg = {
    id: 'feel',
    entry: {
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main', baseUrl: 'https://example.com/' },
      install: {},
    },
    files: [{ name: 'feel/init.lua', target: 'lib/feel/init.lua', sha256: sha256('return "feel"') }],
    dependencyAliases: [
      {
        dependency: 'flux',
        target: 'lib/feel/vendor/flux.lua',
        dependencyEntry: { require: 'lib.flux' },
      },
    ],
  };

  const result = await installPackage(pkg, lockfile, { projectDir: dir });

  assert.equal(result.ok, false);
  assert.match(result.error, /not managed by Feather/);
});

test('install package: fixed layout ignores installDir and records catalog targets', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "menori"';
  const jsonContent = 'return "json"';
  const pkg = {
    id: 'menori',
    entry: {
      trust: 'verified',
      install: { layout: 'fixed' },
      source: { repo: 'rozenmad/Menori', tag: 'dev', baseUrl: 'https://example.com/' },
    },
    files: [
      { name: 'libs/json.lua', target: 'libs/json.lua', sha256: sha256(jsonContent) },
      { name: 'menori/init.lua', target: 'lib/menori/init.lua', sha256: sha256(content) },
    ],
  };

  await withFetchMock(
    async (url) => new Response(String(url).endsWith('/libs/json.lua') ? jsonContent : content),
    async () => {
      const lockfile = emptyLockfile();
      const result = await installPackage(pkg, lockfile, {
        projectDir: dir,
        installDir: 'vendor',
        saveInstallDir: true,
      });

      assert.equal(result.ok, true);
      assert.equal(readFileSync(join(dir, 'libs', 'json.lua'), 'utf8'), jsonContent);
      assert.equal(readFileSync(join(dir, 'lib', 'menori', 'init.lua'), 'utf8'), content);
      assert.equal(lockfile.packages.menori.installDir, undefined);
      assert.deepEqual(lockfile.packages.menori.files.map((file) => file.target), [
        'libs/json.lua',
        'lib/menori/init.lua',
      ]);
    },
  );
});

test('install package: fixed layout cannot be flattened', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const pkg = {
    id: 'menori',
    entry: {
      trust: 'verified',
      install: { layout: 'fixed' },
      source: { repo: 'rozenmad/Menori', tag: 'dev', baseUrl: 'https://example.com/' },
    },
    files: [{ name: 'menori/init.lua', target: 'lib/menori/init.lua', sha256: sha256('return {}') }],
  };

  const result = await installPackage(pkg, emptyLockfile(), {
    projectDir: dir,
    targetOverride: 'vendor',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /fixed runtime paths and cannot be flattened/);
});

test('install package: saved installDir is reused by later installs', async () => {
  const dir = makeTmp();
  const { installPackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "feel"';
  const pkg = {
    id: 'feel',
    entry: {
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main', baseUrl: 'https://example.com/' },
    },
    files: [{ name: 'feel/init.lua', target: 'lib/feel/init.lua', sha256: sha256(content) }],
  };

  await withFetchMock(
    async () => new Response(content),
    async () => {
      const lockfile = emptyLockfile();
      lockfile.packages.feel = {
        version: 'old',
        trust: 'verified',
        source: { repo: 'kyonru/feel.lua', tag: 'old' },
        installDir: 'vendor',
        files: [{ name: 'feel/init.lua', target: 'vendor/feel/init.lua', sha256: sha256('old') }],
        installedAt: new Date(0).toISOString(),
      };
      const result = await installPackage(pkg, lockfile, { projectDir: dir });

      assert.equal(result.ok, true);
      assert.equal(lockfile.packages.feel.installDir, 'vendor');
      assert.equal(lockfile.packages.feel.files[0].target, 'vendor/feel/init.lua');
      assert.equal(readFileSync(join(dir, 'vendor', 'feel', 'init.lua'), 'utf8'), content);
    },
  );
});

test('restore: old url source-only lockfiles remain compatible', async () => {
  const dir = makeTmp();
  const { restorePackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "old url"';

  await withFetchMock(
    async (url) => {
      assert.equal(String(url), 'https://example.com/helper.lua');
      return new Response(content);
    },
    async () => {
      const result = await restorePackage(
        'my-helper',
        {
          version: 'url',
          trust: 'experimental',
          source: { url: 'https://example.com/helper.lua' },
          files: [{ name: 'helper.lua', target: 'lib/helper.lua', sha256: sha256(content) }],
          installedAt: new Date(0).toISOString(),
        },
        { projectDir: dir },
      );

      assert.equal(result.ok, true);
      assert.equal(readFileSync(join(dir, 'lib', 'helper.lua'), 'utf8'), content);
    },
  );
});

test('restore: enriched url lockfiles still prefer per-file URLs', async () => {
  const dir = makeTmp();
  const { restorePackage } = await import('../../dist/lib/package/install.js');
  const files = new Map([
    ['https://example.com/a.lua', 'return "a"'],
    ['https://example.com/b.lua', 'return "b"'],
  ]);
  const fetched = [];

  await withFetchMock(
    async (url) => {
      fetched.push(String(url));
      const body = files.get(String(url));
      return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
    },
    async () => {
      const result = await restorePackage(
        'mypkg',
        {
          version: 'url',
          trust: 'experimental',
          source: {
            kind: 'url',
            url: 'https://example.com/primary.lua',
            urls: ['https://example.com/a.lua', 'https://example.com/b.lua'],
          },
          files: [
            {
              name: 'a.lua',
              url: 'https://example.com/a.lua',
              target: 'lib/mypkg/a.lua',
              sha256: sha256('return "a"'),
            },
            {
              name: 'b.lua',
              url: 'https://example.com/b.lua',
              target: 'lib/mypkg/b.lua',
              sha256: sha256('return "b"'),
            },
          ],
          installedAt: new Date(0).toISOString(),
        },
        { projectDir: dir },
      );

      assert.equal(result.ok, true);
      assert.deepEqual(fetched, ['https://example.com/a.lua', 'https://example.com/b.lua']);
      assert.equal(readFileSync(join(dir, 'lib', 'mypkg', 'a.lua'), 'utf8'), 'return "a"');
      assert.equal(readFileSync(join(dir, 'lib', 'mypkg', 'b.lua'), 'utf8'), 'return "b"');
    },
  );
});

test('restore: old repo lockfiles without commitSha remain compatible', async () => {
  const dir = makeTmp();
  const { restorePackage } = await import('../../dist/lib/package/install.js');
  const content = 'return "repo"';

  await withFetchMock(
    async (url) => {
      assert.equal(String(url), 'https://raw.githubusercontent.com/me/pkg/main/init.lua');
      return new Response(content);
    },
    async () => {
      const result = await restorePackage(
        'my-pkg',
        {
          version: 'main',
          trust: 'experimental',
          source: { repo: 'me/pkg', tag: 'main' },
          files: [{ name: 'init.lua', target: 'lib/init.lua', sha256: sha256(content) }],
          installedAt: new Date(0).toISOString(),
        },
        { projectDir: dir },
      );

      assert.equal(result.ok, true);
      assert.equal(readFileSync(join(dir, 'lib', 'init.lua'), 'utf8'), content);
    },
  );
});

test('restore and audit: generated dependency aliases are recreated and verified', async () => {
  const dir = makeTmp();
  const { restorePackage } = await import('../../dist/lib/package/install.js');
  const { auditLockfile } = await import('../../dist/lib/package/audit.js');
  const aliasContent = '-- Generated by Feather package manager. Do not edit.\nreturn require("lib.flux")\n';
  const lockfile = emptyLockfile();
  lockfile.packages.feel = {
    version: 'main',
    trust: 'verified',
    source: { repo: 'kyonru/feel.lua', tag: 'main' },
    files: [
      {
        name: 'lib/feel/vendor/flux.lua',
        target: 'lib/feel/vendor/flux.lua',
        sha256: sha256(aliasContent),
        generated: { type: 'require-alias', require: 'lib.flux' },
      },
    ],
    installedAt: new Date(0).toISOString(),
  };

  await withFetchMock(
    async () => {
      throw new Error('generated aliases should not fetch');
    },
    async () => {
      const result = await restorePackage('feel', lockfile.packages.feel, { projectDir: dir });
      assert.equal(result.ok, true);
      assert.equal(readFileSync(join(dir, 'lib', 'feel', 'vendor', 'flux.lua'), 'utf8'), aliasContent);

      const audit = await auditLockfile(dir, lockfile);
      assert.deepEqual(audit.map((entry) => entry.status), ['verified']);
    },
  );
});

test('remove: generated dependency aliases are deleted with the owning package', () => {
  const dir = makeTmp();
  const aliasContent = '-- Generated by Feather package manager. Do not edit.\nreturn require("lib.flux")\n';
  mkdirSync(join(dir, 'lib', 'feel', 'vendor'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'feel', 'vendor', 'flux.lua'), aliasContent);
  writeLock(dir, {
    feel: {
      version: 'main',
      trust: 'verified',
      source: { repo: 'kyonru/feel.lua', tag: 'main' },
      files: [
        {
          name: 'lib/feel/vendor/flux.lua',
          target: 'lib/feel/vendor/flux.lua',
          sha256: sha256(aliasContent),
          generated: { type: 'require-alias', require: 'lib.flux' },
        },
      ],
      installedAt: new Date(0).toISOString(),
    },
  });

  const result = run(['package', 'remove', 'feel', '--dir', dir, '--yes']);

  assert.equal(result.exitCode, 0);
  assert.equal(existsSync(join(dir, 'lib', 'feel', 'vendor', 'flux.lua')), false);
  const lockfile = JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
  assert.equal(lockfile.packages.feel, undefined);
});

test('custom add: escaping target is rejected before fetch or write', async () => {
  const dir = makeTmp();
  const { installCustomRepoPackage } = await import('../../dist/lib/package/custom-add.js');
  let fetchCalled = false;

  await withFetchMock(
    async () => {
      fetchCalled = true;
      return new Response('return {}');
    },
    async () => {
      const result = await installCustomRepoPackage({
        id: 'escape',
        repoName: 'me/pkg',
        tag: 'v1.0.0',
        baseUrl: 'https://raw.githubusercontent.com/me/pkg/abc123/',
        selectedFiles: ['escape.lua'],
        targetMap: { 'escape.lua': '../escape.lua' },
        projectDir: dir,
        lockfile: emptyLockfile(),
      });

      assert.equal(result.ok, false);
      assert.equal(fetchCalled, false);
      assert.ok(result.error.includes('escapes project root'));
      assert.equal(existsSync(join(dir, 'feather.lock.json')), false);
      assert.equal(existsSync(join(dir, '..', 'escape.lua')), false);
    },
  );
});

test('custom add: failed repo fetch does not write lockfile', async () => {
  const dir = makeTmp();
  const { installCustomRepoPackage } = await import('../../dist/lib/package/custom-add.js');

  await withFetchMock(
    async () => new Response('missing', { status: 500 }),
    async () => {
      const result = await installCustomRepoPackage({
        id: 'broken',
        repoName: 'me/pkg',
        tag: 'v1.0.0',
        baseUrl: 'https://raw.githubusercontent.com/me/pkg/abc123/',
        selectedFiles: ['broken.lua'],
        targetMap: { 'broken.lua': 'lib/broken.lua' },
        projectDir: dir,
        lockfile: emptyLockfile(),
      });

      assert.equal(result.ok, false);
      assert.ok(result.error.includes('HTTP 500'));
      assert.equal(existsSync(join(dir, 'lib', 'broken.lua')), false);
      assert.equal(existsSync(join(dir, 'feather.lock.json')), false);
    },
  );
});

test('package registry: top-level packages resolve offline in dry-run mode', () => {
  const registryPath = join(ROOT, 'cli', 'dist', 'generated', 'registry.json');
  assert.ok(existsSync(registryPath), 'cli/dist/generated/registry.json missing; run build first');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const topLevel = Object.entries(registry.packages).filter(([, entry]) => !entry.parent);
  assert.ok(topLevel.length > 0, 'registry should include top-level packages');

  for (const [pkgId] of topLevel) {
    const pkgDir = makeTmp();
    const files = registry.packages[pkgId].install.files;
    const allowNonLuaFiles = files.some((file) => !file.name.endsWith('.lua'));
    const args = ['package', 'install', pkgId, '--dry-run', '--offline', '--dir', pkgDir];
    if (allowNonLuaFiles) args.push('--allow-non-lua-files');

    const install = run(args);
    assert.equal(install.exitCode, 0, `${pkgId} dry-run failed:\n${outputOf(install)}`);
    assert.ok(install.stdout.includes(pkgId), `${pkgId}: dry-run output should mention package`);
    assert.ok(install.stdout.includes('Dry run'), `${pkgId}: dry-run output should label the plan`);
    assert.equal(existsSync(join(pkgDir, 'feather.lock.json')), false, `${pkgId}: dry-run must not write lockfile`);

    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(pkgDir, { recursive: true, force: true });
    }
  }
});

test('remove: refuses runtime symlink escaping project', () => {
  const dir = makeTmp();
  const outside = join(makeTmp(), 'outside-runtime');
  writeGame(dir);
  mkdirSync(join(outside, 'feather', 'lib'), { recursive: true });
  writeFileSync(join(outside, 'feather', 'init.lua'), 'FEATHER_VERSION_NAME = "test"\nreturn {}\n');
  symlinkSync(join(outside, 'feather'), join(dir, 'feather'), 'dir');
  writeFileSync(
    join(dir, 'feather.config.lua'),
    [
      '-- FEATHER-MANAGED-BEGIN',
      '-- mode: auto',
      '-- installDir: feather',
      '-- manualEntrypoint: (none)',
      '-- FEATHER-MANAGED-END',
      'return { appId = "feather-app-test" }',
      '',
    ].join('\n'),
  );

  const result = run(['remove', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Runtime remove target resolves outside project root'));
  assert.equal(existsSync(join(outside, 'feather', 'init.lua')), true);
});

test('package remove: refuses lockfile target through symlink escaping project', () => {
  const dir = makeTmp();
  const outside = join(makeTmp(), 'outside-lib');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'helper.lua'), 'return {}\n');
  symlinkSync(outside, join(dir, 'lib'), 'dir');
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { url: 'https://example.com/helper.lua' },
      files: [
        {
          name: 'helper.lua',
          url: 'https://example.com/helper.lua',
          target: 'lib/helper.lua',
          sha256: sha256('return {}\n'),
        },
      ],
    },
  });

  const result = run(['package', 'remove', 'helper', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Refusing to remove unsafe package target: lib/helper.lua'));
  assert.equal(existsSync(join(outside, 'helper.lua')), true);
});
