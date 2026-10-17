import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The build-config panel against the CLI's schema. The field list is not
// written here: it is read from the CLI's compiled declaration of
// FeatherBuildConfig (apps/cli/dist/lib/build/config.d.ts), so a field the CLI
// adds is in the fixture the moment the CLI builds, and the files written are
// read back by the CLI's own readBuildConfig/loadBuildConfig.

const require = createRequire(import.meta.url);
const ts = require('typescript');
const model = require('../out/buildConfig/model.js');

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliBuild = join(extensionRoot, '..', 'cli', 'dist', 'lib', 'build');
const cli = await import(pathToFileURL(join(cliBuild, 'config.js')).href);

/** Every leaf of FeatherBuildConfig: { path, kind, values? }. */
function cliSchemaLeaves() {
  const file = join(cliBuild, 'config.d.ts');
  const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true, types: [] });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const alias = source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === 'FeatherBuildConfig');
  assert.ok(alias, 'FeatherBuildConfig is no longer declared in apps/cli/dist/lib/build/config.d.ts');

  const leaves = [];
  const walk = (type, prefix) => {
    for (const property of checker.getPropertiesOfType(type)) {
      const path = prefix ? `${prefix}.${property.name}` : property.name;
      const propType = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(property, alias));
      if (propType.isUnion() && propType.types.every((item) => item.isStringLiteral())) {
        leaves.push({ path, kind: 'enum', values: propType.types.map((item) => item.value) });
      } else if (propType.flags & ts.TypeFlags.StringLike) {
        leaves.push({ path, kind: 'string' });
      } else if (propType.flags & ts.TypeFlags.NumberLike) {
        leaves.push({ path, kind: 'number' });
      } else if (propType.flags & ts.TypeFlags.BooleanLike) {
        leaves.push({ path, kind: 'boolean' });
      } else if (checker.isArrayType(propType)) {
        leaves.push({ path, kind: 'string[]' });
      } else if (checker.getIndexInfoOfType(propType, ts.IndexKind.String)) {
        leaves.push({ path, kind: 'record' });
      } else {
        walk(propType, path);
      }
    }
  };
  walk(checker.getTypeAtLocation(alias.name), '');
  return leaves;
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let current = target;
  for (const key of keys.slice(0, -1)) current = current[key] ??= {};
  current[keys.at(-1)] = value;
}

function sampleValue(leaf) {
  switch (leaf.kind) {
    case 'enum': return leaf.values[0];
    case 'string': return `v-${leaf.path.replaceAll('.', '-')}`;
    case 'number': return 7;
    case 'boolean': return true;
    case 'string[]': return [`x-${leaf.path}`, `*.{png,jpg}`];
    case 'record': return { web: `chan-${leaf.path}`, windows: 'win' };
  }
  throw new Error(`no sample for ${leaf.kind}`);
}

const leaves = cliSchemaLeaves();
const fixture = {};
for (const leaf of leaves) setPath(fixture, leaf.path, sampleValue(leaf));
fixture.futureField = { addedByANewerCli: true };

function withProject(config, run) {
  const root = mkdtempSync(join(tmpdir(), 'feather-vscode-build-'));
  try {
    if (config !== undefined) writeFileSync(join(root, 'feather.build.json'), typeof config === 'string' ? config : JSON.stringify(config));
    return run(root, join(root, 'feather.build.json'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Open the file the way the panel does, change `edits`, save it the way the panel does. */
function saveThroughPanel(path, edits) {
  const read = model.readBuildConfigFile(path);
  assert.equal(read.ok, true);
  const initial = model.formValues(read.config);
  const result = model.applyFormChanges(model.readBuildConfigFile(path).config, initial, { ...initial, ...edits });
  assert.deepEqual(result.errors, []);
  model.writeBuildConfigFile(path, result.config);
  return result;
}

test('the schema walk found the CLI\'s fields (guards against a vacuous fixture)', () => {
  const paths = leaves.map((leaf) => leaf.path);
  assert.ok(leaves.length >= 60, `expected the full FeatherBuildConfig, found ${leaves.length} fields`);
  for (const expected of ['name', 'targets.android.versionCode', 'targets.ios.release.fastlane.matchType', 'release.fastlane.bundleExec', 'upload.itch.channels']) {
    assert.ok(paths.includes(expected), `schema walk missed ${expected}`);
  }
});

test('every field the form shows is a CLI field of a compatible type', () => {
  const kinds = { text: ['string', 'enum'], folder: ['string'], file: ['string'], choice: ['string', 'enum'], integer: ['number'], boolean: ['boolean'], lines: ['string[]'], map: ['record'] };
  const byPath = new Map(leaves.map((leaf) => [leaf.path, leaf]));
  for (const field of model.FIELDS) {
    const leaf = byPath.get(field.path);
    assert.ok(leaf, `the form shows ${field.path}, which FeatherBuildConfig does not declare`);
    assert.ok(kinds[field.kind].includes(leaf.kind), `${field.path}: form kind ${field.kind} cannot hold CLI type ${leaf.kind}`);
  }
});

test('opening and saving without edits leaves every CLI field, and unknown keys, intact', () => {
  withProject(fixture, (root, path) => {
    const result = saveThroughPanel(path, {});
    assert.deepEqual(result.changed, []);
    assert.deepEqual(cli.readBuildConfig(root), fixture);
  });
});

test('each form field round-trips through the CLI reader without disturbing any other field', () => {
  for (const field of model.FIELDS) {
    withProject(fixture, (root, path) => {
      const edited = { boolean: false, integer: '42', lines: 'a/**\nb.lua', map: 'linux=linux-beta', choice: 'landscape' }[field.kind] ?? `edited ${field.path}`;
      const expected = { boolean: undefined, integer: 42, lines: ['a/**', 'b.lua'], map: { 'linux': 'linux-beta' }, choice: 'landscape' };
      saveThroughPanel(path, { [field.path]: edited });
      const back = cli.readBuildConfig(root);
      const want = field.kind in expected ? expected[field.kind] : `edited ${field.path}`;
      assert.deepEqual(model.getAt(back, field.path), want, `${field.path} did not reach the CLI as written`);
      for (const leaf of leaves) {
        if (leaf.path === field.path) continue;
        assert.deepEqual(model.getAt(back, leaf.path), model.getAt(fixture, leaf.path), `editing ${field.path} changed ${leaf.path}`);
      }
      assert.deepEqual(back.futureField, fixture.futureField);
      // And the CLI accepts the result as a build config.
      assert.doesNotThrow(() => cli.loadBuildConfig({ projectDir: root }));
    });
  }
});

test('a value the form cannot offer (an orientation outside its list) survives a save', () => {
  withProject({ targets: { android: { orientation: 'userLandscape', versionCode: '12' } } }, (root, path) => {
    saveThroughPanel(path, { name: 'Renamed' });
    const back = cli.readBuildConfig(root);
    assert.equal(back.targets.android.orientation, 'userLandscape');
    assert.equal(back.targets.android.versionCode, '12', 'an untouched value is kept exactly, even if the CLI would reject its type');
    assert.equal(back.name, 'Renamed');
  });
});

test('clearing the last field of a section removes the empty object', () => {
  withProject({ name: 'Game', targets: { web: { title: 'T' } } }, (root, path) => {
    saveThroughPanel(path, { 'targets.web.title': '' });
    assert.deepEqual(cli.readBuildConfig(root), { name: 'Game' });
  });
});

test('an edit made in the file while the panel was open is kept', () => {
  withProject({ name: 'Game' }, (root, path) => {
    const initial = model.formValues(model.readBuildConfigFile(path).config);
    writeFileSync(path, JSON.stringify({ name: 'Game', targets: { ios: { teamId: 'ABC123' } } }));
    const { config } = model.applyFormChanges(model.readBuildConfigFile(path).config, initial, { ...initial, version: '2.0.0' });
    model.writeBuildConfigFile(path, config);
    assert.deepEqual(cli.readBuildConfig(root), { name: 'Game', targets: { ios: { teamId: 'ABC123' } }, version: '2.0.0' });
  });
});

test('invalid input is reported, not written', () => {
  const initial = model.formValues({});
  const { errors } = model.applyFormChanges({}, initial, { ...initial, 'targets.android.versionCode': '1.5', 'upload.itch.channels': 'nochannel' });
  assert.deepEqual(errors.map((error) => error.path), ['targets.android.versionCode', 'upload.itch.channels']);
});

test('the panel refuses files the CLI refuses, instead of offering a blank form over them', () => {
  for (const text of ['{ broken', '[1, 2]', '"string"']) {
    withProject(text, (root, path) => {
      assert.throws(() => cli.readBuildConfig(root), /Invalid feather.build.json/);
      const read = model.readBuildConfigFile(path);
      assert.equal(read.ok, false);
      assert.match(read.error, /Invalid feather.build.json/);
    });
  }
  withProject(undefined, (_root, path) => assert.deepEqual(model.readBuildConfigFile(path), { ok: true, exists: false, config: {} }));
});

test('browsed paths inside the project are stored relative, as the CLI requires', () => {
  assert.equal(model.projectRelativePath('/p', '/p/builds/out'), 'builds/out');
  assert.equal(model.projectRelativePath('/p', '/p'), '.');
  assert.equal(model.projectRelativePath('/p', '/elsewhere'), '/elsewhere');
});
