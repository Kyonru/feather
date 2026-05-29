import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRequestSessionConfig } from '../../src/utils/session-reconnect.ts';

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

const { PENDING_SESSION_NAME, prepareSessionsForPersistence } = await import('../../src/store/session.ts');

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
