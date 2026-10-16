import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * One runtime `logs` batch is one update, and performance history is bounded.
 * See inspector-improvements/connection.md findings 7 and 8.
 */

const { applyLogOps, applyLogUpdate } = await import('../../apps/inspector/src/store/log-history.ts');
const { appendPerformanceSample, PERFORMANCE_HISTORY_MAX } = await import('../../apps/inspector/src/lib/performance-history.ts');

const log = (id: string, count = 1) => ({ id, str: `line ${id}`, type: 'output', time: 1, count }) as never;

test('a batch applies exactly like the per-entry updates it replaces', () => {
  const start = [log('a'), log('b')];
  const ops = [
    { kind: 'append', log: log('c') },
    { kind: 'update', update: { id: 'a', count: 3, time: 5 } },
    { kind: 'append', log: log('d') },
    { kind: 'update', update: { id: 'd', count: 2, time: 6, lastTime: 7 } },
    { kind: 'update', update: { id: 'missing', count: 9, time: 9 } },
  ] as const;

  let sequential = start;
  for (const op of ops) {
    sequential = op.kind === 'append' ? [...sequential, op.log] : applyLogUpdate(sequential, op.update);
  }
  assert.deepEqual(applyLogOps(start, [...ops]), sequential);
});

test('a batch does not mutate the list it was given', () => {
  const start = [log('a')];
  const copy = structuredClone(start);
  applyLogOps(start, [{ kind: 'append', log: log('b') }, { kind: 'update', update: { id: 'a', count: 2, time: 2 } }]);
  assert.deepEqual(start, copy);
});

test('an empty batch returns the same list', () => {
  const start = [log('a')];
  assert.equal(applyLogOps(start, []), start);
});

test('performance history keeps the newest samples up to its bound', () => {
  let history: number[] | undefined;
  for (let sample = 0; sample < PERFORMANCE_HISTORY_MAX + 25; sample += 1) {
    history = appendPerformanceSample(history, sample);
  }
  assert.equal(history!.length, PERFORMANCE_HISTORY_MAX);
  assert.equal(history![history!.length - 1], PERFORMANCE_HISTORY_MAX + 24, 'newest last');
  assert.equal(history![0], 25, 'oldest dropped first');
});
