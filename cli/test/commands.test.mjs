/* eslint-disable no-undef */
/**
 * Focused compiled-CLI coverage for non-package commands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LOCAL_SRC = join(ROOT, 'src-lua');
const ANSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'feather-command-test-'));
}

function run(args, extra = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    ...extra,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function writeGame(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'main.lua'),
    `function love.update(dt)
end

function love.draw()
end
`,
  );
}

function writeMinimalRuntime(dir) {
  mkdirSync(join(dir, 'feather', 'lib'), { recursive: true });
  writeFileSync(join(dir, 'feather', 'init.lua'), 'FEATHER_VERSION_NAME = "test"\nreturn {}\n');
  writeFileSync(join(dir, 'feather', 'auto.lua'), 'return {}\n');
  writeFileSync(join(dir, 'feather', 'lib', 'ws.lua'), 'return {}\n');
  writeFileSync(join(dir, 'feather', 'plugin_manager.lua'), 'return {}\n');
}

function writeLock(dir, packages) {
  writeFileSync(join(dir, 'feather.lock.json'), JSON.stringify({ lockfileVersion: 1, packages }, null, 2));
}

function writeFakeLove(dir, options = {}) {
  const recordPath = options.recordPath ?? join(dir, 'fake-love-record.json');
  const exitCode = options.exitCode ?? 0;
  const fakePath = join(dir, 'fake-love.cjs');
  writeFileSync(
    fakePath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const shimDir = process.argv[2] || '';
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({
  argv: process.argv.slice(2),
  env: {
    FEATHER_GAME_PATH: process.env.FEATHER_GAME_PATH,
    FEATHER_SESSION_NAME: process.env.FEATHER_SESSION_NAME,
  },
  shimMainExists: shimDir ? fs.existsSync(path.join(shimDir, 'main.lua')) : false,
}, null, 2));
process.exit(${JSON.stringify(exitCode)});
`,
  );
  chmodSync(fakePath, 0o755);
  return { fakePath, recordPath };
}

function parseDoctorJson(dir, extra = []) {
  const result = run(['doctor', dir, '--json', ...extra]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  assert.equal(result.stdout.trim().startsWith('{'), true);
  return JSON.parse(result.stdout);
}

test('run: non-interactive missing game path exits with compact error', () => {
  const result = run(['run']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Game path is required'));
  assert.equal(outputOf(result).includes('Raw mode is not supported'), false);
  assert.equal(outputOf(result).includes('Error:'), false);
});

test('run: missing game path and missing main.lua render compact errors', () => {
  const dir = makeTmp();
  const missingPath = join(dir, 'missing-game');
  const emptyGame = join(dir, 'empty-game');
  mkdirSync(emptyGame, { recursive: true });

  const missing = run(['run', missingPath]);
  assert.equal(missing.exitCode, 1);
  assert.ok(outputOf(missing).includes(`Game path not found: ${resolve(missingPath)}`));
  assert.equal(outputOf(missing).includes('Error:'), false);

  const noMain = run(['run', emptyGame]);
  assert.equal(noMain.exitCode, 1);
  assert.ok(outputOf(noMain).includes(`No main.lua found in: ${resolve(emptyGame)}`));
  assert.equal(outputOf(noMain).includes('Error:'), false);
});

test('run: fake love receives shim, args, env, and exit code is propagated', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const { fakePath, recordPath } = writeFakeLove(dir, { exitCode: 7 });

  const result = run([
    'run',
    '--love',
    fakePath,
    '--session-name',
    'Command Test',
    '--no-plugins',
    '--feather-path',
    join(LOCAL_SRC, 'feather'),
    gameDir,
    '--',
    '--level',
    '2',
  ]);

  assert.equal(result.exitCode, 7);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.env.FEATHER_GAME_PATH, resolve(gameDir));
  assert.equal(record.env.FEATHER_SESSION_NAME, 'Command Test');
  assert.equal(record.shimMainExists, true);
  assert.equal(existsSync(record.argv[0]), false, 'shim should be cleaned after love exits');
  assert.deepEqual(record.argv.slice(1), ['--level', '2']);
});

test('plugin list: missing plugin directory is a clean empty state', () => {
  const dir = makeTmp();
  const result = run(['plugin', 'list', dir]);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('No plugins directory found'));
});

test('plugin install: local source copies console manifest', () => {
  const dir = makeTmp();
  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  const manifest = readFileSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua'), 'utf8');
  assert.ok(manifest.includes('id = "console"'));
  assert.ok(outputOf(result).includes('Installed console'));
});

test('plugin update: explicit local update refreshes damaged files', () => {
  const dir = makeTmp();
  run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  const installedInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  writeFileSync(installedInit, 'damaged');

  const result = run(['plugin', 'update', 'console', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(readFileSync(installedInit, 'utf8'), readFileSync(join(LOCAL_SRC, 'plugins', 'console', 'init.lua'), 'utf8'));
  assert.ok(outputOf(result).includes('Updated console'));
});

test('plugin update: local --yes updates all installed plugins without selection', () => {
  const dir = makeTmp();
  run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  run(['plugin', 'install', 'hot-reload', '--local-src', LOCAL_SRC, '--dir', dir]);
  const consoleInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  const hotReloadInit = join(dir, 'feather', 'plugins', 'hot-reload', 'init.lua');
  writeFileSync(consoleInit, 'damaged console');
  writeFileSync(hotReloadInit, 'damaged hot reload');

  const result = run(['plugin', 'update', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(readFileSync(consoleInit, 'utf8'), readFileSync(join(LOCAL_SRC, 'plugins', 'console', 'init.lua'), 'utf8'));
  assert.equal(readFileSync(hotReloadInit, 'utf8'), readFileSync(join(LOCAL_SRC, 'plugins', 'hot-reload', 'init.lua'), 'utf8'));
});

test('plugin install: unknown local plugin exits 1', () => {
  const dir = makeTmp();
  const result = run(['plugin', 'install', 'zzz-missing', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Unknown plugin: zzz-missing'));
});

test('plugin list: malformed manifests do not crash and use directory fallback id', () => {
  const dir = makeTmp();
  const pluginDir = join(dir, 'feather', 'plugins', 'bad-plugin');
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(join(pluginDir, 'manifest.lua'), 'return { name = "Bad Plugin", version = "0.0.1" }\n');

  const result = run(['plugin', 'list', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('bad-plugin'));
  assert.ok(result.stdout.includes('Bad Plugin'));
});

test('doctor --json remains decoration-free and reports missing plugin directory', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeMinimalRuntime(dir);
  const parsed = parseDoctorJson(dir);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Plugin directory').severity, 'info');
  assert.equal(labels.get('Plugin directory').detail, 'not installed');
});

test('doctor --json reports malformed plugin manifests with recovery text', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeMinimalRuntime(dir);
  mkdirSync(join(dir, 'feather', 'plugins', 'bad-plugin'), { recursive: true });
  writeFileSync(join(dir, 'feather', 'plugins', 'bad-plugin', 'manifest.lua'), 'return { name = "Bad Plugin" }\n');

  const parsed = parseDoctorJson(dir);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  const manifestCheck = labels.get('Plugin manifests');
  assert.equal(manifestCheck.severity, 'warn');
  assert.ok(manifestCheck.fix.includes('feather plugin update'));
});

test('doctor: human output honors NO_COLOR', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test", include = { "console" } }\n');
  const result = run(['doctor', dir]);
  assert.equal(result.exitCode, 0);
  assert.equal(ANSI_RE.test(result.stdout), false);
  assert.ok(result.stdout.includes('Plugin console'));
  assert.ok(result.stdout.includes('feather plugin install console'));
});

test('command runtime: unexpected errors render compact stderr and exit 1', async () => {
  const { runCliAction } = await import('../dist/lib/command.js');
  const originalError = console.error;
  const lines = [];
  const previousExitCode = process.exitCode;
  const previousDebug = process.env.FEATHER_DEBUG;
  delete process.env.FEATHER_DEBUG;
  process.exitCode = undefined;
  console.error = (line = '') => lines.push(String(line));
  try {
    await runCliAction(async () => {
      throw new Error('surprise failure');
    });
    assert.equal(process.exitCode, 1);
    assert.ok(lines.join('\n').includes('surprise failure'));
    assert.equal(lines.join('\n').includes('Error: surprise failure'), false);
  } finally {
    console.error = originalError;
    process.exitCode = previousExitCode;
    if (previousDebug === undefined) delete process.env.FEATHER_DEBUG;
    else process.env.FEATHER_DEBUG = previousDebug;
  }
});

test('command runtime: FEATHER_DEBUG includes stack for unexpected errors', async () => {
  const { runCliAction } = await import('../dist/lib/command.js');
  const originalError = console.error;
  const lines = [];
  const previousExitCode = process.exitCode;
  const previousDebug = process.env.FEATHER_DEBUG;
  process.env.FEATHER_DEBUG = '1';
  process.exitCode = undefined;
  console.error = (line = '') => lines.push(String(line));
  try {
    await runCliAction(async () => {
      throw new Error('debuggable failure');
    });
    assert.equal(process.exitCode, 1);
    assert.ok(lines.join('\n').includes('debuggable failure'));
    assert.ok(lines.join('\n').includes('Error: debuggable failure'));
  } finally {
    console.error = originalError;
    process.exitCode = previousExitCode;
    if (previousDebug === undefined) delete process.env.FEATHER_DEBUG;
    else process.env.FEATHER_DEBUG = previousDebug;
  }
});

test('json commands used by scripts stay parseable and decoration-free', () => {
  const dir = makeTmp();
  writeGame(dir);
  const content = 'return {}';
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'helper.lua'), content);
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { url: 'https://example.com/helper.lua' },
      files: [{ name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: sha256(content) }],
    },
  });

  const audit = run(['package', 'audit', '--json', '--dir', dir]);
  assert.equal(audit.exitCode, 0);
  assert.equal(ANSI_RE.test(audit.stdout), false);
  const auditParsed = JSON.parse(audit.stdout);
  assert.equal(auditParsed[0].status, 'verified');

  const doctor = run(['doctor', dir, '--json']);
  assert.equal(doctor.exitCode, 0);
  assert.equal(ANSI_RE.test(doctor.stdout), false);
  assert.equal(doctor.stdout.trim().startsWith('{'), true);
  JSON.parse(doctor.stdout);
});
