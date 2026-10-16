import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The Missing filter must not answer "nothing is missing" when it only looked
 * at part of the project.
 *
 * The check used to run over `paths.slice(0, 250)` and present the result as
 * complete. On any project with more assets than that, an asset absent from
 * disk at position 400 was never flagged and never appeared under the Missing
 * filter — the panel confidently reported nothing wrong. That is the L1 failure
 * the lens calls non-negotiable: worse than not offering the answer at all.
 *
 * See V4.md §6.3 (6.6).
 */

const { findMissingPaths } = await import('../../apps/inspector/src/pages/assets/missing-paths.ts');

/** A filesystem where anything under `missing/` does not exist. */
const fakeStat = (path: string) => (path.includes('missing/') ? Promise.reject(new Error('ENOENT')) : Promise.resolve({}));

test('a missing asset is found no matter how far down the list it is', () => {
  const paths = Array.from({ length: 1000 }, (_, i) => `assets/sprite-${i}.png`);
  paths[400] = 'missing/late.png';
  paths[999] = 'missing/last.png';

  return findMissingPaths(paths, fakeStat).then((missing) => {
    assert.equal(missing.has('missing/late.png'), true, 'asset 400 was past the old 250 cap');
    assert.equal(missing.has('missing/last.png'), true, 'asset 999 was far past it');
    assert.equal(missing.size, 2, 'nothing present was reported missing');
  });
});

test('every path is actually checked, not sampled', () => {
  const seen: string[] = [];
  const paths = Array.from({ length: 300 }, (_, i) => `assets/a-${i}.png`);

  return findMissingPaths(paths, (path) => {
    seen.push(path);
    return Promise.resolve({});
  }).then(() => {
    assert.equal(seen.length, 300);
    assert.deepEqual(new Set(seen), new Set(paths));
  });
});

test('the filesystem is worked in bounded batches, not all at once', () => {
  // The old cap existed for a real reason: one stat per asset fired at once on
  // a large project exhausts file handles. Completeness must not reintroduce
  // that.
  let inFlight = 0;
  let peak = 0;
  const paths = Array.from({ length: 500 }, (_, i) => `assets/b-${i}.png`);

  return findMissingPaths(
    paths,
    async (_path) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    },
    { batchSize: 64 },
  ).then(() => {
    assert.ok(peak <= 64, `fired ${peak} stats at once`);
    assert.ok(peak > 1, 'batching collapsed to serial, which would be needlessly slow');
  });
});

test('leaving the panel stops the work rather than finishing it', () => {
  // On a large project this outlives the panel that started it.
  let checked = 0;
  const paths = Array.from({ length: 1000 }, (_, i) => `assets/c-${i}.png`);

  return findMissingPaths(
    paths,
    async (_path) => {
      checked += 1;
    },
    { batchSize: 10, isCancelled: () => checked >= 10 },
  ).then(() => {
    assert.ok(checked < 100, `kept going after cancellation: ${checked} paths checked`);
  });
});

test('an empty project is not an error', () => {
  return findMissingPaths([], fakeStat).then((missing) => assert.equal(missing.size, 0));
});
