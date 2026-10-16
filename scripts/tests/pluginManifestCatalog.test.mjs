import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LuaTableParseError, parseLuaTable } from '../lib/lua-table.mjs';
import { validateManifest } from '../lib/plugin-manifest.mjs';

/**
 * The plugin catalog generator used regular expressions over Lua source, so a
 * commented-out field still counted, nested tables were cut at the first `}`,
 * and runtime policy and action contracts were never read at all. These tests
 * pin the parser to Lua's meaning and the validator to the manifest contract.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contract = parseLuaTable(readFileSync(join(root, 'packages/runtime-lua/feather/plugin_contract.lua'), 'utf8'));

const validManifest = () => ({
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'Does a thing',
  version: '1.2.3',
  capabilities: ['draw'],
  runtime: { cost: 'low', update: 'active', push: 'active', sampleRate: 1 },
  optIn: false,
  disabled: true,
});

const context = (overrides = {}) => ({ sourceDir: 'my-plugin', contract, hasReadme: true, hasE2e: true, ...overrides });

test('a commented-out field is not a field', () => {
  // The regex generator read `disabled = false` out of the comment.
  const parsed = parseLuaTable(`return {
    id = "x", -- disabled = false
    --[[ optIn = true ]]
    disabled = true,
  }`);
  assert.deepEqual(parsed, { id: 'x', disabled: true });
});

test('nested tables, quoting styles and long strings parse as Lua reads them', () => {
  const parsed = parseLuaTable(`return {
    name = 'single',
    long = [[line one
line two]],
    leveled = [==[has ]] inside]==],
    escaped = "tab\\tquote\\"",
    runtime = { cost = "high", update = "explicit", push = "manual", sampleRate = 0.5 },
    list = { "a", 'b'; [[c]] },
    ["dashed-key"] = -3,
    hex = 0x10,
    gone = nil,
  }`);
  assert.equal(parsed.name, 'single');
  assert.equal(parsed.long, 'line one\nline two');
  assert.equal(parsed.leveled, 'has ]] inside');
  assert.equal(parsed.escaped, 'tab\tquote"');
  assert.deepEqual(parsed.runtime, { cost: 'high', update: 'explicit', push: 'manual', sampleRate: 0.5 });
  assert.deepEqual(parsed.list, ['a', 'b', 'c']);
  assert.equal(parsed['dashed-key'], -3);
  assert.equal(parsed.hex, 16);
  assert.ok(!('gone' in parsed));
});

test('code is rejected by name rather than guessed at', () => {
  for (const source of [
    'return { id = makeId() }',
    'return { id = "a" .. "b" }',
    'local x = 1 return { id = x }',
    'return { id = "a", id = "b" }',
    'return { "a", id = "b" }',
    'return { id = "a" ',
  ]) {
    assert.throws(() => parseLuaTable(source), LuaTableParseError, source);
  }
});

test('every built-in manifest parses and validates', async () => {
  const { readdirSync, existsSync } = await import('node:fs');
  const pluginsRoot = join(root, 'packages/runtime-lua/plugins');
  const manifests = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'manifest.lua') manifests.push(path);
    }
  };
  walk(pluginsRoot);
  assert.ok(manifests.length >= 26);
  for (const path of manifests) {
    const sourceDir = dirname(path).slice(pluginsRoot.length + 1);
    const manifest = parseLuaTable(readFileSync(path, 'utf8'));
    const { problems, entry } = validateManifest(manifest, context({ sourceDir }));
    assert.deepEqual(problems, [], sourceDir);
    assert.ok(entry.runtime, `${sourceDir} declares runtime policy`);
    assert.ok(existsSync(join(dirname(path), 'README.md')));
  }
});

test('a valid manifest normalizes runtime, api and actions into the catalog entry', () => {
  const manifest = {
    ...validManifest(),
    api: { min: 5 },
    actions: [{ name: 'gif', cancellable: true }, { name: 'clear' }],
  };
  const { problems, entry } = validateManifest(manifest, context());
  assert.deepEqual(problems, []);
  assert.deepEqual(entry.runtime, { cost: 'low', update: 'active', push: 'active', sampleRate: 1 });
  assert.deepEqual(entry.api, { min: 5, max: null, exact: null });
  assert.deepEqual(
    entry.actions.map((action) => [action.name, action.cancellable]),
    [
      ['gif', true],
      ['clear', false],
    ],
  );
});

test('missing runtime policy is an error, not a silent "always"', () => {
  const manifest = validManifest();
  delete manifest.runtime;
  const { problems } = validateManifest(manifest, context());
  assert.ok(problems.some((problem) => problem.includes('runtime policy is missing')));
});

test('each contract violation is named', () => {
  const cases = [
    [{ version: '1.0' }, 'semantic version'],
    [{ capabilities: ['filesytem'] }, "unknown capability 'filesytem'"],
    [{ runtime: { cost: 'low', update: 'sometimes', push: 'active', sampleRate: 1 } }, 'runtime.update must be one of'],
    [{ runtime: { cost: 'low', update: 'active', push: 'active' } }, 'runtime.sampleRate is required'],
    [{ api: { min: 6, max: 5 } }, 'api range is empty'],
    [{ id: 'other-plugin' }, 'does not match its directory'],
    [{ actions: [{ name: 'a' }, { name: 'a' }] }, "action 'a' is declared twice"],
    [{ disabeld: true }, 'unknown manifest fields: disabeld'],
    [{ optionalCapabilities: ['draw'] }, 'both required and optional'],
  ];
  for (const [override, expected] of cases) {
    const { problems } = validateManifest({ ...validManifest(), ...override }, context());
    assert.ok(
      problems.some((problem) => problem.includes(expected)),
      `${JSON.stringify(override)} -> ${JSON.stringify(problems)}`,
    );
  }
});

test('documentation and e2e coverage are required', () => {
  const { problems } = validateManifest(validManifest(), context({ hasReadme: false, hasE2e: false }));
  assert.ok(problems.some((problem) => problem.includes('README.md')));
  assert.ok(problems.some((problem) => problem.includes('e2e/plugins/my_plugin.lua')));
});

test('dotted ids map to nested directories', () => {
  const { problems } = validateManifest({ ...validManifest(), id: 'hump.signal' }, context({ sourceDir: 'hump/signal' }));
  assert.deepEqual(problems, []);
});
