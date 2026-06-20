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
  run,
  symlinkSync,
  test,
  writeFileSync,
  writeLocalPluginSource,
  writeMinimalRuntime,
} from './helpers.mjs';

test('plugin list: missing plugin directory is a clean empty state', () => {
  const dir = makeTmp();
  const result = run(['plugin', 'list', dir]);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('No plugins directory found'));
});

test('plugin install: local source copies console manifest', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  const manifest = readFileSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua'), 'utf8');
  assert.ok(manifest.includes('id = "console"'));
  assert.ok(outputOf(result).includes('Installed console'));
});

test('plugin install: accepts multiple ids and resolves parent project from nested game dir', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(join(gameDir, 'main.lua'), 'function love.draw() end\n');
  writeFileSync(join(dir, 'feather.config.lua'), 'return {}\n');
  writeMinimalRuntime(dir);

  const result = run(['plugin', 'install', 'console', 'input-replay', '--local-src', LOCAL_SRC, '--dir', gameDir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), true);
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'input-replay', 'manifest.lua')), true);
  assert.equal(existsSync(join(gameDir, 'feather')), false);
});

test('plugin update: explicit local update refreshes damaged files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  const installedInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  writeFileSync(installedInit, 'damaged');

  const result = run(['plugin', 'update', 'console', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(
    readFileSync(installedInit, 'utf8'),
    readFileSync(join(LOCAL_SRC, 'plugins', 'console', 'init.lua'), 'utf8'),
  );
  assert.ok(outputOf(result).includes('Updated console'));
});

test('plugin update: local --yes updates all installed plugins without selection', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  run(['plugin', 'install', 'hot-reload', '--local-src', LOCAL_SRC, '--dir', dir]);
  const consoleInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  const hotReloadInit = join(dir, 'feather', 'plugins', 'hot-reload', 'init.lua');
  writeFileSync(consoleInit, 'damaged console');
  writeFileSync(hotReloadInit, 'damaged hot reload');

  const result = run(['plugin', 'update', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(
    readFileSync(consoleInit, 'utf8'),
    readFileSync(join(LOCAL_SRC, 'plugins', 'console', 'init.lua'), 'utf8'),
  );
  assert.equal(
    readFileSync(hotReloadInit, 'utf8'),
    readFileSync(join(LOCAL_SRC, 'plugins', 'hot-reload', 'init.lua'), 'utf8'),
  );
});

test('plugin install: unknown local plugin exits 1', () => {
  const dir = makeTmp();
  const result = run(['plugin', 'install', 'zzz-missing', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Unknown plugin: zzz-missing'));
});

test('plugin install: local manifest is validated before copying', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  const source = join(makeTmp(), 'src-lua');
  writeLocalPluginSource(source, 'bad-plugin', { version: null });

  const result = run(['plugin', 'install', 'bad-plugin', '--local-src', source, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Plugin manifest is missing version: bad-plugin'));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'bad-plugin')), false);
});

test('plugin install: local manifest id must match plugin path', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  const source = join(makeTmp(), 'src-lua');
  writeLocalPluginSource(source, 'console', { manifestId: 'other-plugin' });

  const result = run(['plugin', 'install', 'console', '--local-src', source, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Plugin manifest id mismatch: expected console, found other-plugin'));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console')), false);
});

test('plugin install: rejects path traversal plugin ids', () => {
  const dir = makeTmp();
  const result = run(['plugin', 'install', '../escape', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Invalid plugin id: ../escape'));
});

test('plugin install: refuses install directory symlink escaping project', () => {
  const dir = makeTmp();
  const outside = join(makeTmp(), 'outside-runtime');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'init.lua'), 'return {}\n');
  symlinkSync(outside, join(dir, 'feather'), 'dir');

  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Plugin install target resolves outside project root'));
  assert.equal(existsSync(join(outside, 'plugins', 'console')), false);
});

test('plugin update: explicit local update fails on invalid manifest', () => {
  const dir = makeTmp();
  const source = join(makeTmp(), 'src-lua');
  writeLocalPluginSource(source, 'bad-plugin', { version: 'not valid' });

  const result = run(['plugin', 'update', 'bad-plugin', '--local-src', source, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Plugin manifest has invalid version: bad-plugin'));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'bad-plugin')), false);
});

test('plugin remove: refuses plugin directory symlink escaping project', () => {
  const dir = makeTmp();
  const outside = join(makeTmp(), 'outside-runtime');
  writeLocalPluginSource(outside, 'console');
  symlinkSync(outside, join(dir, 'feather'), 'dir');

  const result = run(['plugin', 'remove', 'console', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Plugin remove target resolves outside project root'));
  assert.equal(existsSync(join(outside, 'plugins', 'console', 'manifest.lua')), true);
});

test('plugin install: CLI mode project only updates feather.config.lua include list, does not copy files', () => {
  // A CLI-mode project has feather.config.lua but NO feather/init.lua.
  // Plugin code lives in the bundled runtime; only the include list needs updating.
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  writeFileSync(join(dir, 'feather.config.lua'), 'return {}\n');

  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));

  // Plugin files must NOT be copied into the project
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), false);

  // feather.config.lua must have console in the include list
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(config.includes('"console"'), `include list should contain "console"\n${config}`);
});

test('plugin install: CLI mode accepts multiple ids and adds all to include list', () => {
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  writeFileSync(join(dir, 'feather.config.lua'), 'return {}\n');

  const result = run(['plugin', 'install', 'console', 'input-replay', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));

  assert.equal(existsSync(join(dir, 'feather', 'plugins')), false);
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(config.includes('"console"'), config);
  assert.ok(config.includes('"input-replay"'), config);
});

test('plugin list --json: reports CLI-managed included plugins from config', () => {
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  writeFileSync(join(dir, 'feather.config.lua'), 'return { managed = "cli", include = { "console" } }\n');

  const result = run(['plugin', 'list', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.projectDir, dir);
  assert.equal(payload.managed, 'cli');
  assert.equal(payload.count, 1);
  assert.equal(payload.plugins[0].id, 'console');
});

test('plugin install --dry-run --json: reports CLI-managed config change without writing', () => {
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  const original = 'return { managed = "cli", include = { "shader-graph" } }\n';
  writeFileSync(join(dir, 'feather.config.lua'), original);

  const result = run(['plugin', 'install', 'console', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.deepEqual(payload.requested.include, ['console']);
  assert.deepEqual(payload.include, ['console', 'shader-graph']);
  assert.equal(readFileSync(join(dir, 'feather.config.lua'), 'utf8'), original);
});

test('plugin remove --dry-run --json: reports CLI-managed removal without writing', () => {
  const dir = makeTmp();
  writeFileSync(join(dir, 'main.lua'), 'function love.draw() end\n');
  const original = 'return { managed = "cli", include = { "console", "shader-graph" } }\n';
  writeFileSync(join(dir, 'feather.config.lua'), original);

  const result = run(['plugin', 'remove', 'console', '--dir', dir, '--yes', '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.deepEqual(payload.requested.exclude, ['console']);
  assert.deepEqual(payload.include, ['shader-graph']);
  assert.equal(readFileSync(join(dir, 'feather.config.lua'), 'utf8'), original);
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

test('plugin install: skips already-installed plugin and warns in non-TTY mode', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);

  // First install succeeds.
  const first = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(first.exitCode, 0, outputOf(first));
  const manifestPath = join(dir, 'feather', 'plugins', 'console', 'manifest.lua');
  assert.equal(existsSync(manifestPath), true);

  // Overwrite the manifest to detect whether it's been replaced.
  writeFileSync(manifestPath, '-- sentinel\n');

  // Second install without --force: should skip, file must remain unchanged.
  const second = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(second.exitCode, 0, outputOf(second));
  assert.ok(outputOf(second).includes('already installed'), outputOf(second));
  assert.equal(readFileSync(manifestPath, 'utf8'), '-- sentinel\n');
});

test('plugin install --force: overwrites already-installed plugin', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);

  // First install.
  run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  const manifestPath = join(dir, 'feather', 'plugins', 'console', 'manifest.lua');
  writeFileSync(manifestPath, '-- sentinel\n');

  // Second install with --force: should overwrite.
  const result = run(['plugin', 'install', 'console', '--force', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('Installed'), outputOf(result));
  assert.notEqual(readFileSync(manifestPath, 'utf8'), '-- sentinel\n');
});

test('plugin install: installs new plugins and skips already-installed ones in the same batch', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);

  // Pre-install console.
  run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  const consoleSentinel = join(dir, 'feather', 'plugins', 'console', 'manifest.lua');
  writeFileSync(consoleSentinel, '-- sentinel\n');

  // Install both console (already exists) and input-replay (new).
  const result = run(['plugin', 'install', 'console', 'input-replay', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  // input-replay should be installed.
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'input-replay', 'manifest.lua')), true);
  // console should be skipped — sentinel still intact.
  assert.equal(readFileSync(consoleSentinel, 'utf8'), '-- sentinel\n');
  assert.ok(outputOf(result).includes('already installed'), outputOf(result));
});
