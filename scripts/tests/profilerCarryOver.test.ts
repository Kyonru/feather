import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * A profiler baseline must survive the restart that producing a comparison
 * requires.
 *
 * Comparing before and after a change is what a profiler is for, and making the
 * change means restarting the game. The session migration carried logs,
 * metrics, observers and assets across a session-id change and omitted the
 * profiler, so the one comparison the feature exists for was the one it could
 * not make — the baseline was dropped by the cleanup while less critical data
 * was carefully preserved.
 *
 * See skills/feather-desktop-app/references/design-rules.md §6.3 (6.3).
 */

const { profilerStateForNewSession, EMPTY_PROFILER_STATE } = await import(
  '../../apps/inspector/src/hooks/use-profiler.ts'
);

const snapshot = (label: string) => ({ label, rows: [], totalTime: 1, capturedAt: 1 });

test('snapshots survive into the next run', () => {
  const carried = profilerStateForNewSession({
    ...EMPTY_PROFILER_STATE,
    snapshots: [snapshot('Capture 1'), snapshot('Capture 2')],
  });

  assert.ok(carried, 'the baseline was dropped');
  assert.deepEqual(
    carried.snapshots.map((s: { label: string }) => s.label),
    ['Capture 1', 'Capture 2'],
  );
});

test('live capture state does not survive into the next run', () => {
  // Carrying these would make the tool lie about what it is measuring: a
  // capture shown as in progress that nothing is filling, and the previous
  // run's duration attributed to this one.
  const carried = profilerStateForNewSession({
    ...EMPTY_PROFILER_STATE,
    recording: true,
    captureElapsed: 12_345,
    totalCapturedTime: 999,
    data: [{ name: 'update', calls: 10, total: 5 }] as never,
    snapshots: [snapshot('Capture 1')],
  });

  assert.ok(carried);
  assert.equal(carried.recording, false, 'a fresh run is not recording');
  assert.equal(carried.captureElapsed, 0, "the old run's elapsed time is not this run's");
  assert.equal(carried.totalCapturedTime, 0);
  assert.deepEqual(carried.data, [], 'rows belong to the process that produced them');
});

test('nothing to carry is null rather than an empty shell', () => {
  // The caller skips the write entirely, so a session with real state is never
  // replaced by a blank one.
  assert.equal(profilerStateForNewSession(undefined), null);
  assert.equal(profilerStateForNewSession({ ...EMPTY_PROFILER_STATE }), null);
  assert.equal(profilerStateForNewSession({ ...EMPTY_PROFILER_STATE, snapshots: [] }), null);
});

test('a run that only recorded live data, never a snapshot, carries nothing', () => {
  // Deliberate: an un-snapshotted capture is scratch state. Promoting it to a
  // baseline would invent a comparison the user never asked to keep.
  const carried = profilerStateForNewSession({
    ...EMPTY_PROFILER_STATE,
    data: [{ name: 'draw', calls: 3, total: 2 }] as never,
    totalCapturedTime: 50,
  });
  assert.equal(carried, null);
});
