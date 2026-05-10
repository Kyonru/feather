#!/usr/bin/env node
/* eslint-disable no-undef */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'cli', 'dist', 'index.js');
const localSrc = join(root, 'src-lua');

function log(message) {
  console.log(`cli-e2e: ${message}`);
}

function fail(message) {
  console.error(`cli-e2e: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    ...options,
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    fail(`command failed: feather ${args.join(' ')}`);
  }

  return result.stdout.trim();
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function writeGame(dir) {
  writeFileSync(
    join(dir, 'main.lua'),
    `local t = 0

function love.update(dt)
  t = t + dt
end

function love.draw()
  love.graphics.print("CLI E2E " .. tostring(t), 10, 10)
end
`,
  );
}

function doctorJson(dir, extra = []) {
  const raw = run(['doctor', dir, '--json', ...extra]);
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(raw);
    throw err;
  }
}

assert(existsSync(cli), 'cli/dist/index.js is missing. Run npm run cli:build first.');
assert(existsSync(join(localSrc, 'feather', 'init.lua')), 'src-lua Feather runtime is missing.');

const workspace = mkdtempSync(join(tmpdir(), 'feather-cli-e2e-'));
log(`workspace ${workspace}`);

try {
  const autoProject = join(workspace, 'auto-game');
  const cliProject = join(workspace, 'cli-game');
  rmSync(autoProject, { recursive: true, force: true });
  rmSync(cliProject, { recursive: true, force: true });
  writeFileSync(join(workspace, '.keep'), '');
  mkdirSync(autoProject, { recursive: true });
  mkdirSync(cliProject, { recursive: true });

  writeGame(autoProject);
  writeGame(cliProject);

  log('init auto project');
  run([
    'init',
    autoProject,
    '--mode',
    'auto',
    '--local-src',
    localSrc,
    '--install-dir',
    'feather',
    '--no-plugins',
    '--yes',
  ]);

  assert(existsSync(join(autoProject, 'feather', 'init.lua')), 'auto init did not install feather/init.lua');
  assert(existsSync(join(autoProject, 'feather.config.lua')), 'auto init did not create feather.config.lua');
  assert(
    read(join(autoProject, 'main.lua')).includes('FEATHER-INIT-BEGIN require'),
    'auto init did not patch main.lua',
  );
  assert(read(join(autoProject, 'main.lua')).includes('USE_DEBUGGER'), 'auto init did not add USE_DEBUGGER guard');

  log('doctor auto project');
  const autoDoctor = doctorJson(autoProject);
  assert(autoDoctor.failures === 0, `doctor found blockers for auto project: ${JSON.stringify(autoDoctor, null, 2)}`);
  assert(
    autoDoctor.checks.some((check) => check.label === 'Embedded Feather runtime' && check.severity === 'pass'),
    'doctor did not detect embedded runtime',
  );
  assert(
    autoDoctor.checks.some((check) => check.label === 'USE_DEBUGGER guard' && check.severity === 'pass'),
    'doctor did not detect USE_DEBUGGER guard',
  );

  log('remove auto project');
  run(['remove', autoProject, '--yes']);
  assert(!existsSync(join(autoProject, 'feather')), 'remove did not delete feather runtime');
  assert(!existsSync(join(autoProject, 'feather.config.lua')), 'remove did not delete managed feather.config.lua');
  assert(!read(join(autoProject, 'main.lua')).includes('FEATHER-INIT'), 'remove did not strip FEATHER-INIT markers');

  log('init cli-mode project');
  run([
    'init',
    cliProject,
    '--mode',
    'cli',
    '--local-src',
    localSrc,
    '--install-dir',
    'feather',
    '--no-plugins',
    '--yes',
  ]);

  assert(existsSync(join(cliProject, 'feather.config.lua')), 'cli init did not create feather.config.lua');
  assert(!existsSync(join(cliProject, 'feather')), 'cli mode should not install embedded runtime');

  log('doctor cli-mode project');
  const cliDoctor = doctorJson(cliProject);
  assert(cliDoctor.failures === 0, `doctor found blockers for cli-mode project: ${JSON.stringify(cliDoctor, null, 2)}`);
  assert(
    cliDoctor.checks.some((check) => check.label === 'Embedded Feather runtime' && check.severity === 'info'),
    'doctor should treat missing runtime as info in cli mode',
  );

  log('help commands');
  run(['--help']);
  run(['doctor', '--help']);
  run(['plugin', '--help']);

  log('passed');
} finally {
  if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
    rmSync(workspace, { recursive: true, force: true });
  }
}
