import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { easeParticleTimelineValue } from '../../apps/studio/src/tools/particle-system-playground/easing.ts';

/**
 * The editor draws a curve; the game plays one. They are different programs in
 * different languages — `easing.ts` renders the curve editor, `core.lua` runs
 * inside the game and inside the exported file. Nothing connected them, so a
 * change to either would silently make the curve you author differ from the
 * curve that runs, with no failure anywhere.
 *
 * The fixture is generated from `core.lua`, which is the authority because it
 * is what ships. This test holds the TypeScript side to it; the Lua e2e suite
 * holds `core.lua` to the same file. See packages/runtime-lua/plugins/particle-system-playground/README.md, Particles §1.
 */
const contract = JSON.parse(
  readFileSync(new URL('./fixtures/particle-easing-contract.json', import.meta.url), 'utf8'),
) as { samples: number; curves: Record<string, string[]> };

test('the editor curve matches the curve that plays, for every easing', () => {
  const names = Object.keys(contract.curves);
  assert.ok(names.length >= 26, `expected the full easing set, got ${names.length}`);

  for (const [easing, expected] of Object.entries(contract.curves)) {
    assert.equal(expected.length, contract.samples, `${easing} sample count`);
    for (let i = 0; i < expected.length; i++) {
      const t = i / (contract.samples - 1);
      const actual = easeParticleTimelineValue(easing, t);
      assert.ok(
        Math.abs(actual - Number(expected[i])) < 1e-5,
        `${easing} at t=${t.toFixed(2)}: core.lua says ${expected[i]}, easing.ts says ${actual.toFixed(6)}`,
      );
    }
  }
});

test('the overshoot easings really do leave [0,1] — the reason resolved values are clamped', () => {
  // If these ever stop overshooting, Core.resolve's clamps look pointless and
  // someone will remove them. They are not pointless; see packages/runtime-lua/plugins/particle-system-playground/README.md, Particles §4.3.
  const below = (name: string) => Math.min(...contract.curves[name].map(Number));
  const above = (name: string) => Math.max(...contract.curves[name].map(Number));

  assert.ok(below('inBack') < -0.05, `inBack should undershoot, got ${below('inBack')}`);
  assert.ok(below('inElastic') < -0.3, `inElastic should undershoot, got ${below('inElastic')}`);
  assert.ok(above('outBack') > 1.05, `outBack should overshoot, got ${above('outBack')}`);
  assert.ok(above('outElastic') > 1.3, `outElastic should overshoot, got ${above('outElastic')}`);
});
