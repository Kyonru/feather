/* eslint-disable no-undef */
import {
  LOCAL_SRC,
  assert,
  existsSync,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  parseDoctorJsonResult,
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
      '--allow-insecure-connection',
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
      '--allow-insecure-connection',
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

test('init --yes without --allow-insecure-connection: config omits __DANGEROUS_INSECURE_CONNECTION__ and doctor fails on missing appId', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'secure-game');

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

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    const activeConfig = config.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    assert.ok(!/__DANGEROUS_INSECURE_CONNECTION__\s*=\s*true/.test(activeConfig), 'config must not enable __DANGEROUS_INSECURE_CONNECTION__');

    const { parsed: report } = parseDoctorJsonResult(project);
    const insecureCheck = report.checks.find((c) => c.label === '__DANGEROUS_INSECURE_CONNECTION__');
    const appIdCheck = report.checks.find((c) => c.label === 'Desktop App ID');
    assert.equal(insecureCheck?.detail, 'disabled');
    assert.equal(appIdCheck?.severity, 'fail');
    assert.ok(report.failures >= 1);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init --yes --allow-insecure-connection: config sets __DANGEROUS_INSECURE_CONNECTION__ and doctor downgrades missing appId to warn', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'insecure-game');

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
      '--allow-insecure-connection',
    ]);

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /__DANGEROUS_INSECURE_CONNECTION__\s*=\s*true/);

    const report = doctorJson(project);
    const insecureCheck = report.checks.find((c) => c.label === '__DANGEROUS_INSECURE_CONNECTION__');
    const appIdCheck = report.checks.find((c) => c.label === 'Desktop App ID');
    assert.equal(insecureCheck?.detail, 'enabled');
    assert.equal(appIdCheck?.severity, 'warn');
    assert.equal(report.failures, 0);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: installed plugins add their capabilities to generated config', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'plugin-capability-game');

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
      '--plugins',
      'collision-debug,console,input-replay',
      '--yes',
    ]);

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /capabilities\s*=\s*\{\s*"draw",\s*"filesystem",\s*"input"\s*\}/);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});
