import assert from 'node:assert/strict';
import test from 'node:test';

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

function quotaExceededError(): Error {
  const error = new Error('quota exceeded');
  error.name = 'QuotaExceededError';
  return error;
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
});

const {
  applyLogUpdate,
  createDebouncedStorage,
  mergeLogLists,
  resolveLogHistoryKeys,
  sanitizeLogForHistory,
  useLogHistoryStore,
} = await import('../../src/store/log-history.ts');

const log = (id: string, str: string, time: number) => ({
  id,
  count: 1,
  time,
  firstTime: time,
  lastTime: time,
  type: 'output',
  str,
  trace: '',
});

test('log history keys include device and project fallbacks for restarted CLI runs', () => {
  assert.deepEqual(
    resolveLogHistoryKeys(
      {
        deviceId: 'abc',
        sourceDir: '/tmp/game',
        root_path: '/tmp/game/',
        location: '/Users/me/Library/Application Support/love/tmp-shim',
      },
      'session-1',
    ),
    [
      'device:abc',
      'source:/tmp/game',
      'root:/tmp/game',
      'save:/Users/me/Library/Application Support/love/tmp-shim',
      'session:session-1',
    ],
  );
});

test('log history merge dedupes exact restored logs without collapsing restarted ids', () => {
  const firstRun = log('1', 'first boot', 10);
  const duplicate = { ...firstRun };
  const secondRunSameId = log('1', 'second boot', 20);

  assert.deepEqual(mergeLogLists([firstRun], [duplicate, secondRunSameId]), [firstRun, secondRunSameId]);
});

test('log history updates only the latest matching repeated-log id', () => {
  const firstRun = log('1', 'first boot', 10);
  const secondRun = log('1', 'second boot', 20);
  const updated = applyLogUpdate([firstRun, secondRun], { id: '1', count: 3, time: 21, lastTime: 21 });

  assert.equal(updated[0].count, 1);
  assert.equal(updated[1].count, 3);
  assert.equal(updated[1].lastTime, 21);
});

test('persisted log history strips screenshots and writes session plus stable-key buckets', () => {
  useLogHistoryStore.setState({
    logsBySession: {},
    logsByHistoryKey: {},
    sessionHistoryKeys: {},
  });

  useLogHistoryStore.getState().rememberSession('session-1', ['device:abc', 'root:/tmp/game'], 'Demo');
  useLogHistoryStore.getState().appendLog('session-1', {
    ...log('1', 'with screenshot', 30),
    screenshot: 'data:image/png;base64,large',
  });

  const bySession = useLogHistoryStore.getState().getLogsForSession('session-1');
  const byKeys = useLogHistoryStore.getState().getLogsForHistoryKeys(['device:abc', 'root:/tmp/game']);

  assert.equal(bySession.length, 1);
  assert.equal(byKeys.length, 1);
  assert.equal(sanitizeLogForHistory(bySession[0]).screenshot, undefined);
  assert.equal(bySession[0].screenshot, undefined);
});

test('clearing a session also clears its stable history buckets', () => {
  useLogHistoryStore.setState({
    logsBySession: {},
    logsByHistoryKey: {},
    sessionHistoryKeys: {},
  });

  useLogHistoryStore.getState().rememberSession('session-1', ['device:abc', 'root:/tmp/game'], 'Demo');
  useLogHistoryStore.getState().appendLog('session-1', log('1', 'first', 40));
  useLogHistoryStore.getState().appendLog('session-1', log('2', 'second', 41));

  useLogHistoryStore.getState().removeLogs('session-1');

  assert.deepEqual(useLogHistoryStore.getState().getLogsForSession('session-1'), []);
  assert.deepEqual(useLogHistoryStore.getState().getLogsForHistoryKeys(['device:abc', 'root:/tmp/game']), []);
});

test('debounced log history storage coalesces localStorage writes', () => {
  const backing = createMemoryStorage();
  let pendingFlush: (() => void) | null = null;
  let timerId = 0;
  let scheduled = 0;
  let cleared = 0;
  const storage = createDebouncedStorage(backing, 100, {
    setTimer: (callback) => {
      scheduled += 1;
      pendingFlush = callback;
      timerId += 1;
      return timerId as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimer: () => {
      cleared += 1;
    },
  });

  storage.setItem('history', 'first');
  storage.setItem('history', 'second');

  assert.equal(backing.getItem('history'), null);
  assert.equal(storage.getItem('history'), 'second');
  assert.equal(scheduled, 2);
  assert.equal(cleared, 1);

  pendingFlush?.();

  assert.equal(backing.getItem('history'), 'second');
});

test('debounced log history storage compacts persisted logs when quota is exceeded', () => {
  const backing = createMemoryStorage();
  let setAttempts = 0;
  let pendingFlush: (() => void) | null = null;
  const storage = createDebouncedStorage(
    {
      ...backing,
      setItem: (key, value) => {
        setAttempts += 1;
        if (setAttempts === 1) throw quotaExceededError();
        backing.setItem(key, value);
      },
    },
    100,
    {
      setTimer: (callback) => {
        pendingFlush = callback;
        return 1 as unknown as ReturnType<typeof globalThis.setTimeout>;
      },
      clearTimer: () => {},
    },
  );

  const bucket = {
    logs: Array.from({ length: 250 }, (_, index) => ({
      ...log(String(index), `log ${index}`, index),
      trace: index === 249 ? 'x'.repeat(20000) : '',
    })),
    label: 'Noisy',
    updatedAt: 100,
  };
  const raw = JSON.stringify({
    state: {
      logsBySession: { session: bucket },
      logsByHistoryKey: { stable: bucket },
      sessionHistoryKeys: { session: ['stable'] },
    },
    version: 0,
  });

  storage.setItem('history', raw);
  assert.doesNotThrow(() => pendingFlush?.());

  const persisted = backing.getItem('history');
  assert.ok(persisted);
  assert.ok(persisted.length < raw.length);
  const parsed = JSON.parse(persisted);
  assert.equal(parsed.state.logsBySession.session.logs.length, 200);
  assert.ok(parsed.state.logsBySession.session.logs.at(-1).trace.length < 13000);
});
