import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appThemes,
  normalizeThemePreference,
  resolveThemeId,
  themeSelectorGroups,
  THEME_CSS_VARIABLES,
  type ThemeId,
} from '../../src/assets/theme/registry/index.ts';

const noctisThemeIds: ThemeId[] = [
  'noctis-lux',
  'noctis-hibernus',
  'noctis-lilac',
  'noctis',
  'noctis-azureus',
  'noctis-bordo',
  'noctis-obscuro',
  'noctis-sereno',
  'noctis-uva',
  'noctis-viola',
  'noctis-minimus',
];

const visualStudioCppThemeIds: ThemeId[] = [
  'vs-cpp-light',
  'vs-cpp-2017-light',
  'vs-cpp-dark',
  'vs-cpp-2017-dark',
];

const tokyoNightThemeIds: ThemeId[] = [
  'tokyo-night-light',
  'tokyo-night',
  'tokyo-night-storm',
];

test('theme picker exposes Feather defaults and external theme variants', () => {
  const options = themeSelectorGroups.flatMap((group) => group.options.map((option) => option.value));

  assert.equal(options.length, 21);
  assert.deepEqual(options, [
    'system',
    'light',
    'dark',
    'noctis-lux',
    'noctis-hibernus',
    'noctis-lilac',
    'noctis',
    'noctis-azureus',
    'noctis-bordo',
    'noctis-obscuro',
    'noctis-sereno',
    'noctis-uva',
    'noctis-viola',
    'noctis-minimus',
    'tokyo-night-light',
    'tokyo-night',
    'tokyo-night-storm',
    'vs-cpp-light',
    'vs-cpp-2017-light',
    'vs-cpp-dark',
    'vs-cpp-2017-dark',
  ]);
});

test('each registered theme provides the required Feather CSS variables', () => {
  for (const theme of Object.values(appThemes)) {
    for (const variable of THEME_CSS_VARIABLES) {
      assert.ok(theme.variables[variable], `${theme.id} is missing --${variable}`);
    }
  }
});

test('Noctis variants provide syntax highlighter styles', () => {
  for (const id of noctisThemeIds) {
    const theme = appThemes[id];

    assert.equal(theme.family, 'Noctis');
    assert.equal(theme.syntax.hljs?.background, theme.variables.background);
    assert.ok(theme.syntax['hljs-keyword']?.color, `${id} is missing keyword syntax color`);
    assert.ok(theme.syntax['hljs-string']?.color, `${id} is missing string syntax color`);
    assert.ok(theme.syntax['hljs-comment']?.color, `${id} is missing comment syntax color`);
  }
});

test('Tokyo Night variants provide syntax highlighter styles', () => {
  for (const id of tokyoNightThemeIds) {
    const theme = appThemes[id];

    assert.equal(theme.family, 'Tokyo Night');
    assert.equal(theme.syntax.hljs?.background, theme.variables.background);
    assert.ok(theme.syntax['hljs-keyword']?.color, `${id} is missing keyword syntax color`);
    assert.ok(theme.syntax['hljs-string']?.color, `${id} is missing string syntax color`);
    assert.ok(theme.syntax['hljs-comment']?.color, `${id} is missing comment syntax color`);
  }
});

test('Visual Studio C/C++ variants provide syntax highlighter styles', () => {
  for (const id of visualStudioCppThemeIds) {
    const theme = appThemes[id];

    assert.equal(theme.family, 'Visual Studio C/C++');
    assert.equal(theme.syntax.hljs?.background, theme.variables.background);
    assert.ok(theme.syntax['hljs-keyword']?.color, `${id} is missing keyword syntax color`);
    assert.ok(theme.syntax['hljs-string']?.color, `${id} is missing string syntax color`);
    assert.ok(theme.syntax['hljs-comment']?.color, `${id} is missing comment syntax color`);
  }
});

test('theme preferences normalize and resolve safely', () => {
  assert.equal(normalizeThemePreference('noctis-uva'), 'noctis-uva');
  assert.equal(normalizeThemePreference('tokyo-night-light'), 'tokyo-night-light');
  assert.equal(normalizeThemePreference('vs-cpp-2017-light'), 'vs-cpp-2017-light');
  assert.equal(normalizeThemePreference('not-a-real-theme'), 'system');
  assert.equal(resolveThemeId('system', 'dark'), 'dark');
  assert.equal(resolveThemeId('system', 'light'), 'light');
  assert.equal(resolveThemeId('noctis-viola', 'light'), 'noctis-viola');
  assert.equal(resolveThemeId('tokyo-night-storm', 'light'), 'tokyo-night-storm');
  assert.equal(resolveThemeId('vs-cpp-dark', 'light'), 'vs-cpp-dark');
});
