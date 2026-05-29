import assert from 'node:assert/strict';
import test from 'node:test';
import { PARTICLE_TIMELINE_EASINGS } from '../../src/types/particle-system-playground.ts';
import {
  easeParticleTimelineValue,
  normalizeParticleTimelineEasing,
} from '../../src/pages/particle-system-playground/easing.ts';

test('particle timeline easing helper normalizes unknown values to linear', () => {
  assert.equal(normalizeParticleTimelineEasing('outBounce'), 'outBounce');
  assert.equal(normalizeParticleTimelineEasing('unknown'), 'linear');
  assert.equal(easeParticleTimelineValue('unknown', 0.5), 0.5);
});

test('particle timeline curated easing set has stable bounds and characteristic shapes', () => {
  for (const easing of PARTICLE_TIMELINE_EASINGS) {
    const start = easeParticleTimelineValue(easing, 0);
    const end = easeParticleTimelineValue(easing, 1);
    assert.ok(Math.abs(start) < 0.001, `${easing} starts near 0`);
    assert.ok(Math.abs(end - (easing === 'hold' ? 0 : 1)) < 0.001, `${easing} ends near expected value`);
  }

  assert.ok(easeParticleTimelineValue('inQuad', 0.5) < 0.5);
  assert.ok(easeParticleTimelineValue('outQuad', 0.5) > 0.5);
  assert.ok(Math.abs(easeParticleTimelineValue('inOutSine', 0.5) - 0.5) < 0.001);
  assert.ok(easeParticleTimelineValue('outBack', 0.7) > 1);
  assert.ok(easeParticleTimelineValue('outBounce', 0.5) > 0.5);
});
