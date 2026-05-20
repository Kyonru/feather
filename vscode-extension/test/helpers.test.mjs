import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildCommand, buildEnvCommand, shellQuote } = require('../out/command.js');
const { getProjectStatus, resolveProjectDir } = require('../out/project.js');

test('command helpers quote paths with spaces', () => {
  assert.equal(shellQuote('/tmp/Feather App/node'), '"/tmp/Feather App/node"');
  assert.equal(
    buildCommand('/tmp/VS Code/node', '/tmp/ext/bundled-cli/index.js', ['run', '/tmp/My Game']),
    '"/tmp/VS Code/node" /tmp/ext/bundled-cli/index.js run "/tmp/My Game"',
  );
  assert.equal(
    buildEnvCommand({ ELECTRON_RUN_AS_NODE: '1' }, '/tmp/VS Code/helper', '/tmp/ext/bundled-cli/launcher.js', ['run', '/tmp/My Game']),
    'ELECTRON_RUN_AS_NODE=1 "/tmp/VS Code/helper" /tmp/ext/bundled-cli/launcher.js run "/tmp/My Game"',
  );
});

test('project helpers resolve configured project before workspace root', () => {
  assert.equal(resolveProjectDir('/tmp/game', ['/tmp/workspace']), '/tmp/game');
  assert.equal(resolveProjectDir('', ['/tmp/workspace']), '/tmp/workspace');
  assert.equal(resolveProjectDir(undefined, []), undefined);
});

test('project status reports config, runtime, plugins, and packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'feather-vscode-test-'));
  try {
    writeFileSync(join(root, 'main.lua'), '');
    writeFileSync(join(root, 'feather.config.lua'), 'return {}\n');
    mkdirSync(join(root, 'feather', 'plugins', 'console'), { recursive: true });
    writeFileSync(join(root, 'feather', 'init.lua'), 'return {}\n');
    writeFileSync(join(root, 'feather', 'plugins', 'console', 'manifest.lua'), 'return {}\n');
    writeFileSync(join(root, 'feather.lock.json'), JSON.stringify({ packages: { anim8: {}, baton: {} } }));

    const status = getProjectStatus(root);
    assert.equal(status.hasWorkspace, true);
    assert.equal(status.hasMain, true);
    assert.equal(status.hasConfig, true);
    assert.equal(status.hasRuntime, true);
    assert.equal(status.pluginCount, 1);
    assert.equal(status.packageCount, 2);
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project status counts CLI-managed included plugins from config', () => {
  const root = mkdtempSync(join(tmpdir(), 'feather-vscode-test-'));
  try {
    writeFileSync(join(root, 'main.lua'), '');
    writeFileSync(
      join(root, 'feather.config.lua'),
      `return {
  managed = "cli",
  include = { "console", "hot-reload", "profiler" },
  exclude = { "profiler" },

  -- include = { "commented-out" },
}
`,
    );

    const status = getProjectStatus(root);
    assert.equal(status.hasConfig, true);
    assert.equal(status.hasRuntime, false);
    assert.equal(status.pluginCount, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
