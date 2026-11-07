/**
 * One transaction per package command: a failure at any write boundary, or any download, leaves
 * project files and feather.lock.json byte-for-byte unchanged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fakePackage,
  makeTmp,
  readLock,
  serveFakePackages,
  sha256,
  snapshotTree,
  withFetchMock,
  writeLock,
} from './package-helpers.mjs';

const { installPackages } = await import('../../dist/lib/package/install.js');
const { readLockfile } = await import('../../dist/lib/package/lockfile.js');

const CONTENTS = {
  alpha: { 'a.lua': 'return "alpha v1"', 'b.lua': 'return "alpha b"' },
  beta: { 'c.lua': 'return "beta"' },
};

/**
 * A project where alpha v0 is installed (lib/alpha/a.lua and lib/alpha/old.lua, both unchanged),
 * and the command installs alpha v1 (replaces a.lua, creates b.lua, drops old.lua) plus beta,
 * which depends on alpha and lands in a directory that does not exist yet.
 */
function setupProject() {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib', 'alpha'), { recursive: true });
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  writeFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'return "alpha v0"');
  writeFileSync(join(dir, 'lib', 'alpha', 'old.lua'), 'return "old"');
  writeLock(dir, {
    alpha: {
      version: 'v0.0.0',
      trust: 'verified',
      source: { repo: 'example/alpha', tag: 'v0.0.0' },
      files: [
        { name: 'a.lua', target: 'lib/alpha/a.lua', sha256: sha256('return "alpha v0"') },
        { name: 'old.lua', target: 'lib/alpha/old.lua', sha256: sha256('return "old"') },
      ],
      installedAt: new Date(0).toISOString(),
    },
  });
  const alpha = fakePackage('alpha', CONTENTS.alpha);
  const beta = fakePackage('beta', CONTENTS.beta, { entry: { dependencies: ['alpha'] }, pkg: { requested: true } });
  alpha.dependencyOf = ['beta'];
  return { dir, packages: [alpha, beta] };
}

const BOUNDARIES = [
  ['stage', 0], ['stage', 1], ['stage', 2],
  ['backup', 0],
  ['swap', 0], ['swap', 1], ['swap', 2],
  ['delete', 0],
  ['lockfile', 0],
];

for (const [step, index] of BOUNDARIES) {
  test(`transaction: a failure at ${step}#${index} leaves files and lockfile byte-for-byte unchanged`, async () => {
    const { dir, packages } = setupProject();
    const before = snapshotTree(dir);
    const lockfile = readLockfile(dir);
    const lockBefore = JSON.stringify(lockfile);
    let reached = false;

    const result = await withFetchMock(serveFakePackages(CONTENTS), () =>
      installPackages(packages, lockfile, {
        projectDir: dir,
        hooks: {
          beforeStep: (current, currentIndex) => {
            if (current === step && currentIndex === index) {
              reached = true;
              throw new Error(`injected failure at ${step}#${index}`);
            }
          },
        },
      }),
    );

    assert.equal(reached, true, `boundary ${step}#${index} was never reached`);
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(`injected failure at ${step}#${index}\\. No files were changed\\.`));
    assert.deepEqual(snapshotTree(dir), before);
    assert.equal(JSON.stringify(lockfile), lockBefore, 'the in-memory lockfile must not change either');
  });
}

test('transaction: success swaps every file, drops obsolete files, and writes the lockfile last', async () => {
  const { dir, packages } = setupProject();
  const lockfile = readLockfile(dir);

  const result = await withFetchMock(serveFakePackages(CONTENTS), () => installPackages(packages, lockfile, { projectDir: dir }));

  assert.equal(result.ok, true, result.error);
  assert.equal(readFileSync(join(dir, 'lib', 'alpha', 'a.lua'), 'utf8'), CONTENTS.alpha['a.lua']);
  assert.equal(readFileSync(join(dir, 'lib', 'alpha', 'b.lua'), 'utf8'), CONTENTS.alpha['b.lua']);
  assert.equal(readFileSync(join(dir, 'lib', 'beta', 'c.lua'), 'utf8'), CONTENTS.beta['c.lua']);
  assert.equal(existsSync(join(dir, 'lib', 'alpha', 'old.lua')), false, 'unchanged obsolete file is removed');
  const lock = readLock(dir);
  assert.deepEqual(lock.packages.alpha.files.map((file) => file.target), ['lib/alpha/a.lua', 'lib/alpha/b.lua']);
  assert.deepEqual(lock.packages.beta.dependencies, ['alpha']);
  assert.deepEqual(lockfile.packages.beta.dependencies, ['alpha'], 'caller lockfile reflects the commit');
  assert.deepEqual(Object.keys(snapshotTree(dir)).filter((path) => path.includes('feather-package-txn')), []);
});

test('transaction: a failed download of a dependent package commits nothing, including its dependency', async () => {
  const { dir, packages } = setupProject();
  const before = snapshotTree(dir);
  const lockfile = readLockfile(dir);

  const result = await withFetchMock(
    serveFakePackages(CONTENTS, new Set(['https://example.com/beta/c.lua'])),
    () => installPackages(packages, lockfile, { projectDir: dir }),
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 500/);
  assert.deepEqual(result.results.map((entry) => [entry.id, entry.ok]), [['alpha', false], ['beta', false]]);
  assert.match(result.results[0].error, /another package in this command failed/);
  assert.deepEqual(snapshotTree(dir), before);
});

test('transaction: a checksum mismatch on a later file writes nothing', async () => {
  const { dir, packages } = setupProject();
  const before = snapshotTree(dir);
  const tampered = { ...CONTENTS, alpha: { ...CONTENTS.alpha, 'b.lua': 'return "tampered"' } };

  const result = await withFetchMock(serveFakePackages(tampered), () =>
    installPackages(packages, readLockfile(dir), { projectDir: dir }),
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /Checksum mismatch/);
  assert.deepEqual(snapshotTree(dir), before);
});

test('transaction: an interrupted transaction directory blocks new commands before any download', async () => {
  const { dir, packages } = setupProject();
  mkdirSync(join(dir, '.feather-package-txn-deadbeef', 'backup'), { recursive: true });

  await withFetchMock(serveFakePackages(CONTENTS), async (calls) => {
    const result = await installPackages(packages, readLockfile(dir), { projectDir: dir });
    assert.equal(result.ok, false);
    assert.match(result.error, /interrupted package transaction was found at \.feather-package-txn-deadbeef/);
    assert.deepEqual(calls, []);
  });
});
