/**
 * Validated lockfile reads, the safe audit resolver, and atomic writes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmp, outputOf, run, sha256, writeLock } from './package-helpers.mjs';

const { readLockfile, validateLockfile, writeLockfile } = await import('../../dist/lib/package/lockfile.js');
const { auditLockfile } = await import('../../dist/lib/package/audit.js');
const { writeFileAtomicSync } = await import('../../dist/lib/atomic-write.js');

function lockWithTarget(target) {
  return {
    lockfileVersion: 1,
    packages: {
      evil: {
        version: 'v1',
        trust: 'verified',
        source: { repo: 'evil/pkg', tag: 'v1' },
        files: [{ name: 'x.lua', target, sha256: sha256('x') }],
      },
    },
  };
}

test('lockfile validation: rejects targets that leave the project', () => {
  for (const target of ['../outside.lua', '/etc/passwd', 'lib/../../outside.lua', 'C:/Windows/x.lua', '']) {
    assert.throws(() => validateLockfile(lockWithTarget(target)), /target must be a relative path inside the project/, target);
  }
  assert.doesNotThrow(() => validateLockfile(lockWithTarget('./lib/inside.lua')));
});

test('lockfile validation: rejects malformed hashes, trust, sources and file lists', () => {
  const base = lockWithTarget('lib/x.lua');
  const cases = [
    [(lock) => { lock.packages.evil.files[0].sha256 = 'abc'; }, /sha256 must be a SHA-256 hex digest/],
    [(lock) => { lock.packages.evil.trust = 'trusted'; }, /trust must be verified, known, or experimental/],
    [(lock) => { lock.packages.evil.files = 'lib/x.lua'; }, /files must be an array/],
    [(lock) => { lock.packages.evil.source = { repo: 'evil/pkg', tag: 'v1', commitSha: 'nope' }; }, /commitSha/],
    [(lock) => { lock.packages.evil.installDir = '../vendor'; }, /installDir must be a relative path/],
    [(lock) => { lock.packages.evil.files[0].generated = { type: 'shell', require: 'x' }; }, /generated.type/],
    [(lock) => { lock.lockfileVersion = 2; }, /lockfileVersion must be 1/],
  ];
  for (const [mutate, pattern] of cases) {
    const lock = JSON.parse(JSON.stringify(base));
    mutate(lock);
    assert.throws(() => validateLockfile(lock), pattern);
  }
});

test('lockfile validation: every package command refuses a malicious lockfile with the exact field', () => {
  const dir = makeTmp();
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify(lockWithTarget('../../../etc/hosts')));
  for (const args of [
    ['package', 'audit', '--dir', dir],
    ['package', 'install', '--dir', dir],
    ['package', 'list', '--installed', '--dir', dir],
    ['package', 'remove', 'evil', '--dir', dir, '--yes'],
  ]) {
    const result = run(args);
    assert.equal(result.exitCode, 1, args.join(' '));
    assert.match(outputOf(result), /feather\.lock\.json is invalid: packages\["evil"\]\.files\[0\]\.target/);
  }
});

test('audit: a symlinked directory cannot make audit read outside the project', async () => {
  const dir = makeTmp();
  const outside = makeTmp('feather-outside-');
  writeFileSync(join(outside, 'secret.lua'), 'secret');
  symlinkSync(outside, join(dir, 'lib'), 'dir');
  const lockfile = {
    lockfileVersion: 1,
    generatedAt: new Date(0).toISOString(),
    packages: {
      evil: {
        version: 'v1',
        trust: 'verified',
        source: { repo: 'evil/pkg', tag: 'v1' },
        // The hash of the outside file: a vulnerable audit would report it "verified".
        files: [{ name: 'secret.lua', target: 'lib/secret.lua', sha256: sha256('secret') }],
      },
    },
  };

  const results = await auditLockfile(dir, lockfile);
  assert.deepEqual(results.map((result) => [result.status, result.actual]), [['unsafe', null]]);

  writeLock(dir, lockfile.packages);
  const cli = run(['package', 'audit', '--dir', dir, '--json']);
  assert.equal(cli.exitCode, 1);
  assert.equal(JSON.parse(cli.stdout)[0].status, 'unsafe');
});

test('doctor: reports a lockfile with escaping targets without reading it', () => {
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify(lockWithTarget('../outside.lua')));
  const result = run(['doctor', dir, '--json']);
  const check = JSON.parse(result.stdout).checks.find((entry) => entry.label === 'Package lockfile');
  assert.equal(check.severity, 'fail');
  assert.match(check.detail, /target must be a relative path inside the project/);
});

test('atomic write: an interruption before the rename leaves the previous file and no temp files', () => {
  const dir = makeTmp();
  const path = join(dir, 'feather.lock.json');
  writeFileSync(path, 'previous\n');

  assert.throws(
    () => writeFileAtomicSync(path, 'next\n', { beforeRename: () => { throw new Error('power cut'); } }),
    /power cut/,
  );
  assert.equal(readFileSync(path, 'utf8'), 'previous\n');
  assert.deepEqual(readdirSync(dir), ['feather.lock.json']);

  writeFileAtomicSync(path, 'next\n');
  assert.equal(readFileSync(path, 'utf8'), 'next\n');
  assert.deepEqual(readdirSync(dir), ['feather.lock.json']);
});

test('atomic write: lockfile writes round-trip through the validated reader', () => {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib'), { recursive: true });
  const lockfile = validateLockfile(lockWithTarget('lib/x.lua'));
  writeLockfile(dir, lockfile);
  assert.equal(readLockfile(dir).packages.evil.files[0].target, 'lib/x.lua');
  assert.equal(existsSync(join(dir, 'feather.lock.json')), true);
  assert.deepEqual(readdirSync(dir).sort(), ['feather.lock.json', 'lib']);
});
