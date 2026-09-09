import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The four semantic states must be readable on every theme Feather ships.
 *
 * This is the test that C0 exists for. Before the semantic ramps, state colors
 * were hardcoded Tailwind literals: `red-600` sat at 3.34:1 on Noctis dark and
 * 4.37:1 on Inspector's own light background, and `amber-300` at 1.30:1 on
 * light themes — the color carrying "this crashed", unreadable.
 *
 * Deriving the ramps is not enough on its own; the derivation has to be checked
 * against every ground it will actually render on. That is what this does.
 *
 * See V4-ENHANCED.md §4 (C0).
 */

const { appThemes } = await import('../../apps/inspector/src/assets/theme/registry/index.ts');
const { contrastRatio, CONTRAST_FLOOR } = await import(
  '../../apps/inspector/src/assets/theme/registry/semantic.ts'
);

const STATES = ['ok', 'warn', 'danger', 'info'] as const;
const themes = Object.entries(appThemes);

test('every shipped theme defines all four semantic states', () => {
  assert.ok(themes.length >= 28, `expected the full theme set, got ${themes.length}`);

  for (const [id, theme] of themes) {
    for (const state of STATES) {
      for (const suffix of ['', '-surface', '-border']) {
        const name = `${state}${suffix}`;
        const value = (theme.variables as Record<string, string>)[name];
        assert.ok(value, `${id} is missing --${name}`);
        assert.match(value, /^#[0-9a-f]{6}$/i, `${id} --${name} is not a hex color: ${value}`);
      }
    }
  }
});

test('every semantic foreground clears WCAG AA on its own theme background', () => {
  const failures: string[] = [];

  for (const [id, theme] of themes) {
    const variables = theme.variables as Record<string, string>;
    for (const state of STATES) {
      const ratio = contrastRatio(variables[state], variables.background);
      if (ratio < CONTRAST_FLOOR) {
        failures.push(`${id} --${state} ${variables[state]} on ${variables.background} = ${ratio.toFixed(2)}`);
      }
    }
  }

  assert.deepEqual(failures, [], `states below ${CONTRAST_FLOOR}:1 on their background:\n${failures.join('\n')}`);
});

test('every semantic foreground clears WCAG AA on its own theme card surface', () => {
  // Panels draw state text on cards as often as on the page ground, and a
  // theme's card is not always close to its background.
  const failures: string[] = [];

  for (const [id, theme] of themes) {
    const variables = theme.variables as Record<string, string>;
    for (const state of STATES) {
      const ratio = contrastRatio(variables[state], variables.card);
      if (ratio < CONTRAST_FLOOR) {
        failures.push(`${id} --${state} ${variables[state]} on card ${variables.card} = ${ratio.toFixed(2)}`);
      }
    }
  }

  assert.deepEqual(failures, [], `states below ${CONTRAST_FLOOR}:1 on their card:\n${failures.join('\n')}`);
});

test('semantic foregrounds are readable on their own surface token', () => {
  // A chip renders `--ok` on `--ok-surface`. That pairing has to hold too, and
  // it is the one most likely to be missed, because both move per theme.
  const failures: string[] = [];

  for (const [id, theme] of themes) {
    const variables = theme.variables as Record<string, string>;
    for (const state of STATES) {
      const ratio = contrastRatio(variables[state], variables[`${state}-surface`]);
      if (ratio < CONTRAST_FLOOR) {
        failures.push(`${id} --${state} on --${state}-surface = ${ratio.toFixed(2)}`);
      }
    }
  }

  assert.deepEqual(failures, [], `chip pairings below ${CONTRAST_FLOOR}:1:\n${failures.join('\n')}`);
});

test('the four states stay distinguishable from each other', () => {
  // Derivation solves each hue independently, so nothing stops two states
  // converging on a ground that squeezes them. ok and warn colliding would be
  // the expensive one: "fine" and "look at this" must never be the same color.
  const failures: string[] = [];

  for (const [id, theme] of themes) {
    const variables = theme.variables as Record<string, string>;
    for (let i = 0; i < STATES.length; i += 1) {
      for (let j = i + 1; j < STATES.length; j += 1) {
        const a = variables[STATES[i]];
        const b = variables[STATES[j]];
        if (a.toLowerCase() === b.toLowerCase()) {
          failures.push(`${id}: --${STATES[i]} and --${STATES[j]} are both ${a}`);
        }
      }
    }
  }

  assert.deepEqual(failures, [], `states that collide:\n${failures.join('\n')}`);
});
