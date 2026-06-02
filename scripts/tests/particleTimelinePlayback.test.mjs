import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceParticleTimelineState } from '../../src/pages/particle-system-playground/timeline.ts';

const baseState = { time: 2.8, playing: true, scrubVersion: 7 };

test('particle timeline playback stops one-shot timelines at duration', () => {
  const next = advanceParticleTimelineState(
    { duration: 3, mode: 'one-shot', loop: false },
    baseState,
    0.5,
  );

  assert.equal(next.time, 3);
  assert.equal(next.playing, false);
  assert.equal(next.scrubVersion, 7);
});

test('particle timeline playback wraps loop timelines', () => {
  const next = advanceParticleTimelineState(
    { duration: 3, mode: 'loop', loop: true },
    baseState,
    0.5,
  );

  assert.ok(Math.abs(next.time - 0.3) < 0.001);
  assert.equal(next.playing, true);
  assert.equal(next.scrubVersion, 7);
});

test('particle timeline playback holds ambient timelines at duration', () => {
  const next = advanceParticleTimelineState(
    { duration: 3, mode: 'ambient', loop: false },
    baseState,
    0.5,
  );

  assert.equal(next.time, 3);
  assert.equal(next.playing, true);
  assert.equal(next.scrubVersion, 7);
});

test('particle timeline playback leaves stopped timelines cheap and stable', () => {
  const next = advanceParticleTimelineState(
    { duration: 3, mode: 'loop', loop: true },
    { time: 1.25, playing: false, scrubVersion: 4 },
    0.5,
  );

  assert.deepEqual(next, { time: 1.25, playing: false, scrubVersion: 4 });
});
