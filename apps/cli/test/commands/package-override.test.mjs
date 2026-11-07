/* global Response */
/**
 * Raw-source version overrides (`anim8@v2.2.0`) fetch the commit the requested ref resolves to,
 * never the catalog's pinned commit. GitHub is stubbed in-process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmp, readLock, sha256, withFetchMock } from './package-helpers.mjs';

const { packageInstallCommand } = await import('../../dist/commands/package/install.js');
const { restorePackage, rawBaseUrlForCommit } = await import('../../dist/lib/package/install.js');
const { loadRegistry } = await import('../../dist/lib/package/registry.js');

const registry = await loadRegistry({ offline: true });
const CATALOG = registry.packages.anim8.source;
const OVERRIDE_COMMIT = '1234567890abcdef1234567890abcdef12345678';
const OVERRIDE_BYTES = 'return "anim8 at v2.2.0"';
const CATALOG_BYTES = 'return "anim8 at the catalog pin"';

function github({ resolvesTo = OVERRIDE_COMMIT, status = 200 } = {}) {
  return (url) => {
    if (url === 'https://api.github.com/repos/kikito/anim8/commits/v2.2.0') {
      return status === 200 ? new Response(JSON.stringify({ sha: resolvesTo })) : new Response('{}', { status });
    }
    if (url === `https://raw.githubusercontent.com/kikito/anim8/${OVERRIDE_COMMIT}/anim8.lua`) return new Response(OVERRIDE_BYTES);
    if (url.includes(CATALOG.commitSha)) return new Response(CATALOG_BYTES);
    return new Response('not found', { status: 404 });
  };
}

function project() {
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  return dir;
}

async function quietly(run) {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
}

test('override: anim8@v2.2.0 fetches the commit v2.2.0 resolves to, not the catalog pin', async () => {
  assert.notEqual(CATALOG.commitSha, OVERRIDE_COMMIT);
  const dir = project();

  const calls = await withFetchMock(github(), async (calls) => {
    await quietly(() => packageInstallCommand(['anim8@v2.2.0'], { dir, offline: true, allowUntrusted: true, json: true }));
    return calls;
  });

  assert.equal(readFileSync(join(dir, 'lib', 'anim8.lua'), 'utf8'), OVERRIDE_BYTES);
  assert.equal(calls.some((url) => url.includes(CATALOG.commitSha)), false, 'catalog-pinned URL must not be fetched');
  const entry = readLock(dir).packages.anim8;
  assert.equal(entry.trust, 'experimental');
  assert.equal(entry.version, 'v2.2.0');
  assert.equal(entry.source.tag, 'v2.2.0');
  assert.equal(entry.source.requestedRef, 'v2.2.0');
  assert.equal(entry.source.commitSha, OVERRIDE_COMMIT);
  assert.equal(entry.source.resolvedRef, OVERRIDE_COMMIT);
  assert.ok(!Number.isNaN(Date.parse(entry.source.resolvedAt)));
  assert.equal(entry.files[0].sha256, sha256(OVERRIDE_BYTES));
});

test('override: restoring an override lockfile fetches the resolved commit again', async () => {
  const dir = project();
  await withFetchMock(github(), () =>
    quietly(() => packageInstallCommand(['anim8@v2.2.0'], { dir, offline: true, allowUntrusted: true, json: true })),
  );
  const entry = readLock(dir).packages.anim8;
  rmSync(join(dir, 'lib', 'anim8.lua'));

  await withFetchMock(github(), async (calls) => {
    const result = await restorePackage('anim8', entry, { projectDir: dir });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(calls, [`https://raw.githubusercontent.com/kikito/anim8/${OVERRIDE_COMMIT}/anim8.lua`]);
  });
  assert.equal(readFileSync(join(dir, 'lib', 'anim8.lua'), 'utf8'), OVERRIDE_BYTES);
});

test('override: an unresolvable ref writes nothing', async () => {
  const dir = project();
  await withFetchMock(github({ status: 404 }), async () => {
    await assert.rejects(
      quietly(() => packageInstallCommand(['anim8@v2.2.0'], { dir, offline: true, allowUntrusted: true, json: true })),
    );
  });
  assert.equal(existsSync(join(dir, 'lib', 'anim8.lua')), false);
  assert.equal(existsSync(join(dir, 'feather.lock.json')), false);
});

test('override: a ref that resolves to a non-SHA response is refused', async () => {
  const dir = project();
  await withFetchMock(github({ resolvesTo: 'v2.2.0' }), async () => {
    await assert.rejects(
      quietly(() => packageInstallCommand(['anim8@v2.2.0'], { dir, offline: true, allowUntrusted: true, json: true })),
    );
  });
  assert.equal(existsSync(join(dir, 'lib', 'anim8.lua')), false);
});

test('override: a full commit SHA is used as-is without a GitHub API lookup', async () => {
  const dir = project();
  const calls = await withFetchMock(github(), async (calls) => {
    await quietly(() =>
      packageInstallCommand([`anim8@${OVERRIDE_COMMIT}`], { dir, offline: true, allowUntrusted: true, json: true }),
    );
    return calls;
  });
  assert.deepEqual(calls, [`https://raw.githubusercontent.com/kikito/anim8/${OVERRIDE_COMMIT}/anim8.lua`]);
  assert.equal(readLock(dir).packages.anim8.source.commitSha, OVERRIDE_COMMIT);
});

test('override: the raw URL is rebuilt from repo, commit and path, keeping the catalog subdirectory', () => {
  const sha = 'a'.repeat(40);
  const source = { repo: 'owner/repo', commitSha: sha, baseUrl: `https://raw.githubusercontent.com/owner/repo/${sha}/src/lib/` };
  assert.equal(rawBaseUrlForCommit(source, OVERRIDE_COMMIT), `https://raw.githubusercontent.com/owner/repo/${OVERRIDE_COMMIT}/src/lib/`);
  assert.match(rawBaseUrlForCommit({ ...source, repo: 'someone/else' }, OVERRIDE_COMMIT).error, /not a raw GitHub URL for that repo/);
  assert.match(rawBaseUrlForCommit({ ...source, commitSha: 'b'.repeat(40) }, OVERRIDE_COMMIT).error, /not pinned to source.commitSha/);
});
