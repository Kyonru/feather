import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Project state is whatever the CLI says. These run the compiled workspace CLI
// against temporary projects, so "matches Doctor" is checked against Doctor.

const require = createRequire(import.meta.url);
const { loadProjectState, doctorCheckFor, doctorProblems, parsePackageList } = require('../out/project/state.js');
const { runCliQuery } = require('../out/jobs/runner.js');

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = join(extensionRoot, '..', 'cli', 'dist', 'index.js');
const invocation = { command: process.execPath, argsPrefix: [cliEntry] };

function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'feather-vscode-state-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
  return root;
}

const load = (root) => loadProjectState(root, (args) => runCliQuery(invocation, args, root));

test('a healthy CLI-managed project reports mode, plugins and packages from the CLI', async () => {
  const root = project({
    'main.lua': 'function love.draw() end\n',
    'feather.config.lua': 'return { managed = "cli", include = { "console", "hot-reload" } }\n',
  });
  try {
    const state = await load(root);
    assert.equal(state.hasMain, true);
    assert.equal(state.hasConfig, true);
    assert.deepEqual(state.plugins, { ok: true, value: { managed: 'cli', ids: ['console', 'hot-reload'] } });
    assert.deepEqual(state.packages, { ok: true, value: { ids: [] } });
    assert.equal(state.doctor.ok, true);
    assert.ok(state.doctor.value.checks.some((check) => check.label === 'main.lua' && check.severity === 'pass'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an invalid lockfile is a broken state with Doctor\'s message, not zero packages', async () => {
  const root = project({
    'main.lua': 'function love.draw() end\n',
    'feather.config.lua': 'return { managed = "cli" }\n',
    'feather.lock.json': '{ not json',
  });
  try {
    const state = await load(root);
    assert.equal(state.packages.ok, false, 'a lockfile the CLI cannot parse must not read as an empty package list');
    const check = doctorCheckFor(state, 'Package lockfile');
    assert.equal(check?.severity, 'fail');
    assert.equal(state.packages.error, check.detail, 'the view shows the same words as feather doctor');
    assert.ok(doctorProblems(state).includes(check));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an invalid feather.build.json surfaces as Doctor\'s Build failure', async () => {
  const root = project({
    'main.lua': 'function love.draw() end\n',
    'feather.config.lua': 'return { managed = "cli" }\n',
    'feather.build.json': '[1, 2]',
  });
  try {
    const state = await load(root);
    const check = doctorCheckFor(state, 'feather.build.json');
    assert.equal(check?.severity, 'fail');
    assert.match(check.detail, /Config root must be an object/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a CLI that fails without JSON yields its error line', () => {
  const read = parsePackageList({ args: [], exitCode: 1, signal: null, stdout: '', stderr: '✖ Failed to parse feather.lock.json. Fix or delete it and re-run.\n' });
  assert.deepEqual(read, { ok: false, error: 'Failed to parse feather.lock.json. Fix or delete it and re-run.' });
});
