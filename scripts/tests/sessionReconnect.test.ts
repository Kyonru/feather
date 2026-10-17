import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRequestSessionConfig } from '../../apps/inspector/src/utils/session-reconnect.ts';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
});

const {
  PENDING_SESSION_NAME,
  prepareSessionsForPersistence,
  sessionCanOpenRuntimePages,
  sessionSupportsRuntime,
} = await import('../../apps/inspector/src/store/session.ts');

test('reconnect probe requests config for remembered or half-connected sessions', () => {
  assert.equal(shouldRequestSessionConfig(undefined, false), true);
  assert.equal(shouldRequestSessionConfig({ connected: false }, false), true);
  assert.equal(shouldRequestSessionConfig({ connected: true, pendingConfig: true }, false), true);
  assert.equal(shouldRequestSessionConfig({ connected: true }, false), true);
  assert.equal(shouldRequestSessionConfig({ connected: true, pendingConfig: false }, true), false);
});

test('persisted sessions are remembered as disconnected history entries only', () => {
  const persisted = prepareSessionsForPersistence({
    live: {
      id: 'live',
      name: 'Game',
      connected: true,
      connectedAt: 10,
    },
    pending: {
      id: 'pending',
      name: PENDING_SESSION_NAME,
      connected: true,
      connectedAt: 11,
      pendingConfig: true,
    },
    stalePending: {
      id: 'stalePending',
      name: PENDING_SESSION_NAME,
      connected: true,
      connectedAt: 12,
    },
    'file:logs': {
      id: 'file:logs',
      name: 'Logs',
      kind: 'log-file',
      connected: true,
      connectedAt: 13,
    },
  });

  assert.deepEqual(Object.keys(persisted), ['live']);
  assert.equal(persisted.live.connected, false);
  assert.equal(persisted.live.pendingConfig, false);
});

test('a creative workspace persisted by an older version is dropped, not restored', () => {
  // The creative tools moved to Feather Studio, so a workspace saved by v3 would
  // come back as a tab that opens nothing. Both the marker kinds are recognized:
  // the `creative:` id prefix and the old `kind`.
  const persisted = prepareSessionsForPersistence({
    'creative:one': {
      id: 'creative:one',
      name: 'Creative One',
      kind: 'creative',
      connected: true,
      connectedAt: 20,
      runtimeSuspended: true,
    },
    'legacy-by-kind': {
      id: 'legacy-by-kind',
      name: 'Creative Two',
      kind: 'creative',
      connected: false,
      connectedAt: 21,
    },
    live: {
      id: 'live',
      name: 'Game',
      connected: true,
      connectedAt: 22,
    },
  });

  assert.deepEqual(Object.keys(persisted), ['live'], 'only the real session survives');
  assert.equal(persisted.live.connected, false);
});

test('runtime gating no longer depends on a creative session kind', () => {
  const live = { id: 'live', name: 'Game', connected: true, connectedAt: 31 };
  const logFile = { id: 'file:logs', name: 'Logs', kind: 'log-file' as const, connected: true, connectedAt: 32 };

  assert.equal(sessionSupportsRuntime(live), true);
  // A file-backed session is not a live runtime, which is the distinction that
  // outlived the creative kind.
  assert.equal(sessionSupportsRuntime(logFile), false);
  assert.equal(sessionCanOpenRuntimePages(live), true);
  assert.equal(sessionCanOpenRuntimePages(null), false);
});
