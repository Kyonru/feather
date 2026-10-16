/* global Response */
/**
 * Registry provenance: every load says whether it used network, cache or bundled data, how old it
 * is, and why a refresh failed. Network is stubbed; HOME points at a temp dir so the user's real
 * registry cache is never read or written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTmp, outputOf, run, withFetchMock } from './package-helpers.mjs';

const { loadRegistryWithStatus, registryStatusNotice } = await import('../../dist/lib/package/registry.js');
const bundled = JSON.parse(readFileSync(new URL('../../dist/generated/registry.json', import.meta.url), 'utf8'));

function withHome(run) {
  const home = makeTmp('feather-home-');
  const previous = process.env.HOME;
  process.env.HOME = home;
  return Promise.resolve(run(home)).finally(() => {
    process.env.HOME = previous;
  });
}

function newerRegistry() {
  return { ...bundled, updatedAt: '2099-01-01' };
}

test('registry provenance: --offline reports the bundled snapshot and its age', async () => {
  const load = await loadRegistryWithStatus({ offline: true });
  assert.equal(load.source, 'bundled');
  assert.equal(load.offline, true);
  assert.equal(load.fetchedAt, null);
  assert.equal(load.generatedAt, bundled.updatedAt);
  assert.equal(typeof load.age, 'number');
  assert.equal(load.fallbackReason, undefined);
  assert.equal(registryStatusNotice(load).level, 'info');
});

test('registry provenance: network, then cache, then a failed refresh that falls back to the cache', async () => {
  await withHome(async (home) => {
    const registry = newerRegistry();
    await withFetchMock(async () => new Response(JSON.stringify(registry)), async (calls) => {
      const first = await loadRegistryWithStatus({});
      assert.equal(first.source, 'network');
      assert.equal(first.age, 0);
      assert.equal(registryStatusNotice(first), null);
      assert.equal(calls.length, 1);
      // The cache is written atomically: no temp files are left beside it.
      assert.deepEqual(readdirSync(join(home, '.feather')), ['registry-cache.json']);

      const second = await loadRegistryWithStatus({});
      assert.equal(second.source, 'cache');
      assert.equal(second.fetchedAt, first.fetchedAt);
      assert.equal(calls.length, 1, 'a fresh cache must not refetch');
    });

    await withFetchMock(async () => { throw new Error('getaddrinfo ENOTFOUND'); }, async () => {
      const refreshed = await loadRegistryWithStatus({ refresh: true });
      assert.equal(refreshed.source, 'cache');
      assert.match(refreshed.fallbackReason, /could not fetch the registry \(getaddrinfo ENOTFOUND\)/);
      const notice = registryStatusNotice(refreshed);
      assert.equal(notice.level, 'warn');
      assert.match(notice.message, /cached registry/);
    });
  });
});

test('registry provenance: an invalid network registry falls back to bundled data and says why', async () => {
  await withHome(async () => {
    await withFetchMock(async () => new Response(JSON.stringify({ version: 2 })), async () => {
      const load = await loadRegistryWithStatus({});
      assert.equal(load.source, 'bundled');
      assert.equal(load.offline, false);
      assert.match(load.fallbackReason, /the fetched registry is invalid \(Registry version must be 1\)/);
      assert.equal(registryStatusNotice(load).level, 'warn');
    });
    await withFetchMock(async () => new Response('nope', { status: 503 }), async () => {
      const load = await loadRegistryWithStatus({});
      assert.equal(load.source, 'bundled');
      assert.match(load.fallbackReason, /HTTP 503/);
    });
  });
});

test('registry provenance: a corrupt cache is reported, and a custom registry URL never uses the default cache', async () => {
  await withHome(async (home) => {
    mkdirSync(join(home, '.feather'), { recursive: true });
    writeFileSync(join(home, '.feather', 'registry-cache.json'), '{ truncated');
    await withFetchMock(async () => { throw new Error('offline'); }, async () => {
      const load = await loadRegistryWithStatus({});
      assert.equal(load.source, 'bundled');
      assert.match(load.fallbackReason, /registry cache is unreadable/);
    });

    writeFileSync(
      join(home, '.feather', 'registry-cache.json'),
      JSON.stringify({ fetchedAt: new Date().toISOString(), registry: newerRegistry() }),
    );
    await withFetchMock(async () => { throw new Error('offline'); }, async () => {
      assert.equal((await loadRegistryWithStatus({})).source, 'cache');
      const custom = await loadRegistryWithStatus({ registryUrl: 'https://mirror.example.test/registry.json' });
      assert.equal(custom.source, 'bundled');
    });
  });
});

test('registry provenance: package --json outputs name the source and fallback reason', () => {
  const home = makeTmp('feather-home-');
  const dir = makeTmp();
  const env = { HOME: home };

  const offline = run(['package', 'list', '--offline', '--json', '--dir', dir], { env });
  assert.equal(offline.exitCode, 0, outputOf(offline));
  assert.deepEqual(
    { source: JSON.parse(offline.stdout).registry.source, offline: JSON.parse(offline.stdout).registry.offline },
    { source: 'bundled', offline: true },
  );

  // Port 1 on loopback refuses immediately: a real failed refresh without touching the network.
  const failed = run(['package', 'info', 'anim8', '--json', '--dir', dir, '--registry', 'http://127.0.0.1:1/registry.json'], { env });
  assert.equal(failed.exitCode, 0, outputOf(failed));
  const registry = JSON.parse(failed.stdout).registry;
  assert.equal(registry.source, 'bundled');
  assert.equal(registry.offline, false);
  assert.match(registry.fallbackReason, /could not fetch the registry/);
  assert.equal(existsSync(join(home, '.feather', 'registry-cache.json')), false);

  const human = run(['package', 'search', 'anim8', '--registry', 'http://127.0.0.1:1/registry.json'], { env });
  assert.equal(human.exitCode, 0, outputOf(human));
  assert.match(outputOf(human), /Using bundled registry snapshot from .*could not fetch the registry/);
});

test('registry provenance: doctor says its version checks use the bundled snapshot', () => {
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify({ lockfileVersion: 1, packages: {} }));
  const result = run(['doctor', dir, '--json']);
  const check = JSON.parse(result.stdout).checks.find((entry) => entry.label === 'Package registry');
  assert.equal(check.severity, 'info');
  assert.match(check.detail, new RegExp(`bundled snapshot from ${bundled.updatedAt}.*offline data`));
});
