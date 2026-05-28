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

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
});

const {
  applyLogUpdate,
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
