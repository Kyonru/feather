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
    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /-- mode: cli/);
    assert.match(config, /managed\s*=\s*"cli"/);
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

test('init e2e: auto mode writes managed = "auto" as parseable Lua field', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'auto-managed-game');

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

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /managed\s*=\s*"auto"/);
    assert.match(config, /-- mode: auto/);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: cli mode removes only config, leaves main.lua untouched', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'cli-remove-game');

  try {
    writeE2eGame(project);
    runOk(['init', project, '--no-plugins', '--yes', '--allow-insecure-connection']);

    assert.equal(existsSync(join(project, 'feather.config.lua')), true);
    assert.equal(existsSync(join(project, 'feather')), false);
    assert.equal(readFileSync(join(project, 'main.lua'), 'utf8').includes('FEATHER-INIT'), false);

    runOk(['remove', project, '--yes']);

    assert.equal(existsSync(join(project, 'feather.config.lua')), false);
    // main.lua must still exist and be unmodified (CLI mode never patches it)
    assert.ok(existsSync(join(project, 'main.lua')));
    assert.equal(readFileSync(join(project, 'main.lua'), 'utf8').includes('FEATHER-INIT'), false);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: remove --dry-run prints targets without deleting files', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'dry-run-game');

  try {
    writeE2eGame(project);
    runOk(['init', project, '--no-plugins', '--yes', '--allow-insecure-connection']);

    const result = run(['remove', project, '--dry-run']);
    assert.equal(result.exitCode, 0, outputOf(result));
    assert.ok(outputOf(result).includes('feather.config.lua'));
    // file must still exist
    assert.equal(existsSync(join(project, 'feather.config.lua')), true);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: remove without --yes in non-interactive mode fails', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'non-interactive-game');

  try {
    writeE2eGame(project);
    runOk(['init', project, '--no-plugins', '--yes', '--allow-insecure-connection']);

    const result = run(['remove', project]);
    assert.equal(result.exitCode, 1);
    assert.ok(outputOf(result).includes('Refusing to remove Feather files without --yes'));
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: auto mode remove keeps config with --keep-config', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'keep-config-game');

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

    runOk(['remove', project, '--yes', '--keep-config']);

    assert.equal(existsSync(join(project, 'feather')), false);
    assert.equal(existsSync(join(project, 'feather.config.lua')), true);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: auto mode remove keeps runtime with --keep-runtime', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'keep-runtime-game');

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

    runOk(['remove', project, '--yes', '--keep-runtime']);

    assert.equal(existsSync(join(project, 'feather')), true);
    assert.equal(existsSync(join(project, 'feather.config.lua')), false);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: cli mode round-trip — init, plugin install, plugin list, plugin remove, feather update', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'cli-roundtrip');

  try {
    writeE2eGame(project);

    // init in CLI mode
    runOk(['init', project, '--no-plugins', '--yes', '--allow-insecure-connection']);
    assert.match(readFileSync(join(project, 'feather.config.lua'), 'utf8'), /managed\s*=\s*"cli"/);

    // plugin install via CLI mode
    runOk(['plugin', 'install', 'console', '--dir', project]);
    const afterInstall = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(afterInstall, /include\s*=\s*\{[^}]*"console"/);
    // no plugin files copied to filesystem
    assert.equal(existsSync(join(project, 'feather', 'plugins', 'console')), false);

    // plugin list shows the installed plugin
    const listResult = run(['plugin', 'list', '--dir', project]);
    assert.equal(listResult.exitCode, 0, outputOf(listResult));
    assert.ok(outputOf(listResult).includes('console'));

    // plugin remove via CLI mode
    runOk(['plugin', 'remove', 'console', '--dir', project, '--yes']);
    const afterRemove = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    // only check uncommented include lines (comment block also contains "include = ...")
    const includeMatch = afterRemove.match(/^\s*include\s*=\s*\{([^}]*)\}/m);
    assert.ok(!includeMatch || !includeMatch[1].includes('"console"'));

    // feather update is a no-op for CLI mode
    const updateResult = run(['update', project]);
    assert.equal(updateResult.exitCode, 0, outputOf(updateResult));
    assert.ok(outputOf(updateResult).includes('CLI'));

    // remove the project
    runOk(['remove', project, '--yes']);
    assert.equal(existsSync(join(project, 'feather.config.lua')), false);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: cli mode records selected plugins in generated config', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'cli-plugins-game');

  try {
    writeE2eGame(project);

    runOk([
      'init',
      project,
      '--mode',
      'cli',
      '--plugins',
      'console,input-replay',
      '--yes',
      '--allow-insecure-connection',
    ]);

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /include\s*=\s*\{\s*"console",\s*"input-replay"\s*\}/);
    assert.match(config, /capabilities\s*=\s*\{\s*"filesystem",\s*"input"\s*\}/);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: cli mode includes default creative plugins', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'cli-default-plugins-game');

  try {
    writeE2eGame(project);

    runOk([
      'init',
      project,
      '--mode',
      'cli',
      '--yes',
      '--allow-insecure-connection',
    ]);

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /include\s*=\s*\{\s*"particle-system-playground",\s*"shader-graph"\s*\}/);
    assert.match(config, /capabilities\s*=\s*\{\s*"draw",\s*"filesystem"\s*\}/);
    assert.match(config, /debug\s*=\s*true/);
    assert.match(config, /autoRegisterErrorHandler\s*=\s*true/);
    assert.doesNotMatch(config, /^\s*hotReload\s*=/m);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: cli mode hot reload writes debugger allowlist config', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'cli-hot-reload-game');

  try {
    writeE2eGame(project);

    runOk([
      'init',
      project,
      '--mode',
      'cli',
      '--plugins',
      'hot-reload',
      '--hot-reload-allow',
      'game.player,game.systems.combat',
      '--yes',
      '--allow-insecure-connection',
    ]);

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /include\s*=\s*\{\s*"hot-reload"\s*\}/);
    assert.match(config, /debug\s*=\s*true/);
    assert.match(config, /autoRegisterErrorHandler\s*=\s*true/);
    assert.match(config, /debugger\s*=\s*\{/);
    assert.match(config, /enabled\s*=\s*true/);
    assert.match(config, /hotReload\s*=\s*\{/);
    assert.match(config, /allow\s*=\s*\{\s*"game\.player",\s*"game\.systems\.combat"\s*\}/);
    assert.match(config, /deny\s*=\s*\{\s*"main",\s*"conf",\s*"feather\.\*"\s*\}/);
    assert.match(config, /persistToDisk\s*=\s*false/);
  } finally {
    if (process.env.FEATHER_KEEP_E2E_TMP !== '1') {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

test('init e2e: cli mode writes session name and app id from flags', () => {
  const workspace = makeTmp();
  const project = join(workspace, 'cli-custom-config-game');

  try {
    writeE2eGame(project);

    runOk([
      'init',
      project,
      '--mode',
      'cli',
      '--session-name',
      'Custom Session',
      '--app-id',
      'feather-app-test',
      '--no-plugins',
      '--yes',
    ]);

    const config = readFileSync(join(project, 'feather.config.lua'), 'utf8');
    assert.match(config, /sessionName\s*=\s*"Custom Session"/);
    assert.match(config, /appId\s*=\s*"feather-app-test"/);
    assert.doesNotMatch(config, /^\s*__DANGEROUS_INSECURE_CONNECTION__\s*=\s*true/m);
    assert.doesNotMatch(config, /^\s*include\s*=/m);
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
