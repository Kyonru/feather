/* global Response */
/**
 * Shared fixtures for the package transaction, ownership, override, remove and registry suites.
 * Network is never used: tests stub `globalThis.fetch` in-process, or use data: URLs and
 * unreachable loopback ports for subprocess runs.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function makeTmp(prefix = 'feather-pkg-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function run(args, { env, ...extra } = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      ...extra,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.status ?? 1 };
  }
}

export function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

export function writeLock(dir, packages, extra = {}) {
  writeFileSync(
    join(dir, 'feather.lock.json'),
    JSON.stringify({ lockfileVersion: 1, generatedAt: new Date(0).toISOString(), ...extra, packages }, null, 2),
  );
}

export function readLock(dir) {
  return JSON.parse(readFileSync(join(dir, 'feather.lock.json'), 'utf8'));
}

export function emptyLockfile() {
  return { lockfileVersion: 1, generatedAt: new Date(0).toISOString(), packages: {} };
}

/** Every path under `dir` with its bytes (files), link target (symlinks) or a marker (directories). */
export function snapshotTree(dir) {
  const snapshot = {};
  const visit = (current) => {
    for (const entry of readdirSync(current)) {
      const abs = join(current, entry);
      const rel = relative(dir, abs);
      const stat = lstatSync(abs);
      if (stat.isSymbolicLink()) snapshot[rel] = `symlink:${readlinkSync(abs)}`;
      else if (stat.isDirectory()) {
        snapshot[`${rel}/`] = 'dir';
        visit(abs);
      } else snapshot[rel] = readFileSync(abs).toString('base64');
    }
  };
  if (existsSync(dir)) visit(dir);
  return snapshot;
}

export async function withFetchMock(mock, runTest) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return mock(String(url), init);
  };
  try {
    return await runTest(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** A catalog-shaped package whose files come from https://example.com/<id>/<name>. */
export function fakePackage(id, files, extra = {}) {
  return {
    id,
    entry: {
      trust: 'verified',
      type: 'love2d-library',
      source: { repo: `example/${id}`, tag: 'v1.0.0', baseUrl: `https://example.com/${id}/` },
      install: {},
      ...(extra.entry ?? {}),
    },
    files: Object.entries(files).map(([name, content]) => ({
      name,
      target: `lib/${id}/${name}`,
      sha256: sha256(content),
    })),
    ...(extra.pkg ?? {}),
  };
}

/** Serve fakePackage files: https://example.com/<id>/<name> → contents[id][name]. */
export function serveFakePackages(contents, failures = new Set()) {
  return (url) => {
    const match = url.match(/^https:\/\/example\.com\/([^/]+)\/(.+)$/);
    if (!match || failures.has(url)) return new Response('missing', { status: 500 });
    const body = contents[match[1]]?.[match[2]];
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
  };
}
