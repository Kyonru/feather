/**
 * `feather package remove` never deletes local edits, refuses to break dependents, and offers an
 * explicit --cascade plan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmp, outputOf, readLock, run, sha256, snapshotTree, writeLock } from './package-helpers.mjs';

const { readLockfile } = await import('../../dist/lib/package/lockfile.js');
const { commitPackageRemoval, planPackageRemoval } = await import('../../dist/lib/package/remove.js');

function entry(id, files, extra = {}) {
  return {
    version: 'v1.0.0',
    trust: 'verified',
    source: { repo: `example/${id}`, tag: 'v1.0.0' },
    files: Object.entries(files).map(([target, content]) => ({ name: target.split('/').pop(), target, sha256: sha256(content) })),
    installedAt: new Date(0).toISOString(),
    ...extra,
  };
}

/** flux is required by feel (recorded in feel's lock entry); both are installed and unchanged. */
function project() {
  const dir = makeTmp();
  mkdirSync(join(dir, 'lib', 'feel'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'flux.lua'), 'return "flux"');
  writeFileSync(join(dir, 'lib', 'feel', 'init.lua'), 'return "feel"');
  writeLock(dir, {
    flux: entry('flux', { 'lib/flux.lua': 'return "flux"' }),
    feel: entry('feel', { 'lib/feel/init.lua': 'return "feel"' }, { dependencies: ['flux'] }),
  });
  return dir;
}

test('remove: a locally modified file is kept, ownership is dropped, and the recovery action is printed', () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'feel', 'init.lua'), 'my edits');

  const result = run(['package', 'remove', 'feel', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(readFileSync(join(dir, 'lib', 'feel', 'init.lua'), 'utf8'), 'my edits');
  assert.match(
    outputOf(result),
    /Kept lib\/feel\/init\.lua: it has local changes, so Feather left it in place and no longer manages it\. Delete it yourself if you do not need the edits\./,
  );
  assert.equal(readLock(dir).packages.feel, undefined);
  assert.ok(readLock(dir).packages.flux, 'unrelated package stays installed');
});

test('remove --json: reports preserved files', () => {
  const dir = project();
  writeFileSync(join(dir, 'lib', 'feel', 'init.lua'), 'my edits');
  const result = run(['package', 'remove', 'feel', '--dir', dir, '--yes', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.preserved, [{ id: 'feel', target: 'lib/feel/init.lua', reason: 'modified' }]);
  assert.deepEqual(payload.removed.existingFiles, []);
  assert.deepEqual(payload.cascaded, []);
});

test('remove: refuses to remove a package another installed package depends on', () => {
  const dir = project();
  const before = snapshotTree(dir);
  const result = run(['package', 'remove', 'flux', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.match(outputOf(result), /"flux" is required by feel\. Remove that package first, or run `feather package remove flux --cascade`/);
  assert.deepEqual(snapshotTree(dir), before);
});

test('remove --cascade: removes the package and its dependents in one transaction', () => {
  const dir = project();
  const result = run(['package', 'remove', 'flux', '--dir', dir, '--yes', '--cascade', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.deepEqual(JSON.parse(result.stdout).cascaded, ['feel']);
  assert.equal(existsSync(join(dir, 'lib', 'flux.lua')), false);
  assert.equal(existsSync(join(dir, 'lib', 'feel', 'init.lua')), false);
  assert.deepEqual(readLock(dir).packages, {});
});

test('remove: dependents are found transitively', () => {
  const dir = project();
  const lock = readLock(dir);
  lock.packages.ui = entry('ui', {}, { dependencies: ['feel'] });
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify(lock));
  const planned = planPackageRemoval(dir, readLockfile(dir), 'flux', { cascade: true });
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.plan.ids, ['flux', 'feel', 'ui']);
});

test('remove: a file another installed package still owns is kept', () => {
  const dir = project();
  const lock = readLock(dir);
  lock.packages['feel.core'] = entry('feel.core', { 'lib/feel/init.lua': 'return "feel"' }, { parent: 'feel' });
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify(lock));

  const result = run(['package', 'remove', 'feel', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'lib', 'feel', 'init.lua')), true);
  assert.match(outputOf(result), /Kept lib\/feel\/init\.lua: another installed package still uses it\./);
});

for (const step of ['delete', 'lockfile']) {
  test(`remove: a failure at ${step} leaves files and lockfile unchanged`, () => {
    const dir = project();
    const before = snapshotTree(dir);
    const lockfile = readLockfile(dir);
    const planned = planPackageRemoval(dir, lockfile, 'flux', { cascade: true });
    const result = commitPackageRemoval(dir, lockfile, planned.plan, {
      beforeStep: (current, index) => {
        if (current === step && index === (step === 'delete' ? 1 : 0)) throw new Error(`injected ${step}`);
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(`injected ${step}\\. No files were changed\\.`));
    assert.deepEqual(snapshotTree(dir), before);
  });
}
