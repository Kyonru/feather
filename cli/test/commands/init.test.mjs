/* eslint-disable no-undef */
import {
  LOCAL_SRC,
  assert,
  existsSync,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  readFileSync,
  rmSync,
  run,
  test,
  writeFileSync,
} from './helpers.mjs';

function runOk(args) {
  const result = run(args);
  assert.equal(result.exitCode, 0, outputOf(result));
  return result.stdout.trim();
}

function writeE2eGame(dir) {
  mkdirSync(dir, { recursive: true });
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
  const raw = runOk(['doctor', dir, '--json', ...extra]);
  return JSON.parse(raw);
}

test('init/remove e2e: auto mode installs runtime, doctor passes, and remove cleans up', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'auto-game');

  try {
    writeE2eGame(project);

    runOk([
      'init',
      project,
      '--mode',
      'auto',
      '--local-src',
      LOCAL_SRC,
      '--install-dir',
      'feather',
      '--no-plugins',
      '--yes',
    ]);

    assert.equal(existsSync(join(project, 'feather', 'init.lua')), true);
    assert.equal(existsSync(join(project, 'feather.config.lua')), true);
    assert.match(readFileSync(join(project, 'main.lua'), 'utf8'), /FEATHER-INIT-BEGIN require/);
    assert.match(readFileSync(join(project, 'main.lua'), 'utf8'), /USE_DEBUGGER/);

    const report = doctorJson(project);
    assert.equal(report.failures, 0, JSON.stringify(report, null, 2));
    assert.ok(report.checks.some((check) => check.label === 'Embedded Feather runtime' && check.severity === 'pass'));
    assert.ok(report.checks.some((check) => check.label === 'USE_DEBUGGER guard' && check.severity === 'pass'));

    runOk(['remove', project, '--yes']);
    assert.equal(existsSync(join(project, 'feather')), false);
    assert.equal(existsSync(join(project, 'feather.config.lua')), false);
    assert.equal(readFileSync(join(project, 'main.lua'), 'utf8').includes('FEATHER-INIT'), false);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: defaults to cli mode and creates config without embedding runtime', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'cli-game');

  try {
    writeE2eGame(project);

    runOk([
      'init',
      project,
      '--local-src',
      LOCAL_SRC,
      '--install-dir',
      'feather',
      '--no-plugins',
      '--yes',
    ]);

    assert.equal(existsSync(join(project, 'feather.config.lua')), true);
    assert.equal(existsSync(join(project, 'feather')), false);
    assert.match(readFileSync(join(project, 'feather.config.lua'), 'utf8'), /-- mode: cli/);
    assert.equal(readFileSync(join(project, 'main.lua'), 'utf8').includes('FEATHER-INIT'), false);

    const report = doctorJson(project);
    assert.equal(report.failures, 0, JSON.stringify(report, null, 2));
    assert.ok(report.checks.some((check) => check.label === 'Embedded Feather runtime' && check.severity === 'info'));
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});
