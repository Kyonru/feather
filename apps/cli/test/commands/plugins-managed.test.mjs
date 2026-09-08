/* eslint-disable no-undef */
/**
 * Tests for `--managed <mode>` override and automatic managed-mode detection
 * across all plugin subcommands (install, remove, update, list).
 *
 * Mode semantics:
 *   cli    – plugins are bundled in the CLI binary; only feather.config.lua
 *            `include`/`exclude` lists are updated, no files copied.
 *   auto   – embedded runtime; plugin Lua files are copied into the project.
 *   manual – same file-copying behaviour as auto.
 */
import {
  LOCAL_SRC,
  assert,
  existsSync,
  join,
  makeTmp,
  outputOf,
  readFileSync,
  run,
  test,
  writeFileSync,
  writeMinimalRuntime,
} from './helpers.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a feather.config.lua with a `managed` field and an optional
 * `include` list. Returns the path to the config file.
 */
function writeConfig(dir, managed, { include = [] } = {}) {
  const lines = [`  managed = "${managed}",`];
  if (include.length > 0) {
    lines.push(`  include = { ${include.map((id) => `"${id}"`).join(', ')} },`);
  }
  const path = join(dir, 'feather.config.lua');
  writeFileSync(path, `return {\n${lines.join('\n')}\n}\n`);
  return path;
}

/**
 * Parse the string values from a named Lua array field, e.g.
 *   include = { "console", "hot-reload" }  →  ["console", "hot-reload"]
 */
function parseLuaArray(source, key) {
  const re = new RegExp(`${key}\\s*=\\s*\\{([^}]*)\\}`);
  const m = source.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

/**
 * Install a plugin in embedded (file-copy) mode, bypassing managed-mode
 * detection in the config. Used to set up filesystem state for update/remove tests.
 */
function installEmbedded(dir, id = 'console') {
  const result = run(['plugin', 'install', id, '--managed', 'auto', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
}

// ---------------------------------------------------------------------------
// plugin install
// ---------------------------------------------------------------------------

test('plugin install --managed cli: updates include list, does not copy files (overrides embedded project)', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);           // has feather/init.lua
  writeConfig(dir, 'auto');           // config says auto …
  // … but --managed cli wins

  const result = run(['plugin', 'install', 'console', '--managed', 'cli', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), false);
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(config.includes('"console"'), `include list missing "console":\n${config}`);
});

test('plugin install --managed auto: copies files even when config says cli', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'cli');            // config says cli …
  // … but --managed auto wins

  const result = run(['plugin', 'install', 'console', '--managed', 'auto', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), true);
});

test('plugin install --managed manual: copies files even when config says cli', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'cli');

  const result = run(['plugin', 'install', 'console', '--managed', 'manual', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), true);
});

test('plugin install --managed cli: overrides filesystem fallback (feather/init.lua present, no managed field)', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);           // would normally trigger embedded mode
  writeFileSync(join(dir, 'feather.config.lua'), 'return {\n}\n');

  const result = run(['plugin', 'install', 'console', '--managed', 'cli', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), false);
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(config.includes('"console"'), `include list missing:\n${config}`);
});

test('plugin install --managed auto: overrides filesystem fallback (no feather/init.lua)', () => {
  // Without override, no feather/init.lua + no managed field → CLI mode.
  // --managed auto forces file-copy path.
  const dir = makeTmp();
  writeMinimalRuntime(dir);           // creates feather/init.lua so copy will work
  writeFileSync(join(dir, 'feather.config.lua'), 'return {\n  managed = "cli",\n}\n');

  const result = run(['plugin', 'install', 'console', '--managed', 'auto', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), true);
});

test('plugin install: managed = cli detected from config', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli');

  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), false);
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(config.includes('"console"'), config);
});

test('plugin install: managed = auto detected from config copies files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');

  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), true);
});

test('plugin install: managed = manual detected from config copies files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'manual');

  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console', 'manifest.lua')), true);
});

test('plugin install --managed cli: multiple ids all added to include list', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli');

  const result = run(['plugin', 'install', 'console', 'input-replay', '--managed', 'cli', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(config.includes('"console"'), config);
  assert.ok(config.includes('"input-replay"'), config);
  assert.equal(existsSync(join(dir, 'feather', 'plugins')), false);
});

test('plugin install --managed cli: idempotent — re-install does not duplicate include list entry', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli');

  run(['plugin', 'install', 'console', '--managed', 'cli', '--local-src', LOCAL_SRC, '--dir', dir]);
  run(['plugin', 'install', 'console', '--managed', 'cli', '--local-src', LOCAL_SRC, '--dir', dir]);

  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  const matches = [...config.matchAll(/"console"/g)];
  assert.equal(matches.length, 1, `"console" should appear exactly once:\n${config}`);
});

test('plugin install --managed cli: unknown plugin id is rejected by catalog', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli');

  const result = run(['plugin', 'install', 'zzz-missing', '--managed', 'cli', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Unknown plugin: zzz-missing'), outputOf(result));
});

test('plugin install --managed auto: unknown plugin id rejected from local source', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');

  const result = run(['plugin', 'install', 'zzz-missing', '--managed', 'auto', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Unknown plugin: zzz-missing'), outputOf(result));
});

// ---------------------------------------------------------------------------
// plugin remove
// ---------------------------------------------------------------------------

test('plugin remove --managed cli: removes plugin from include list', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli', { include: ['console'] });

  const result = run(['plugin', 'remove', 'console', '--managed', 'cli', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(!parseLuaArray(config, 'include').includes('console'), `"console" should not be in include:\n${config}`);
});

test('plugin remove --managed auto: deletes plugin files from filesystem', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');
  installEmbedded(dir);

  const pluginDir = join(dir, 'feather', 'plugins', 'console');
  assert.equal(existsSync(pluginDir), true);

  const result = run(['plugin', 'remove', 'console', '--managed', 'auto', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(pluginDir), false);
});

test('plugin remove --managed manual: deletes plugin files from filesystem', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'manual');
  installEmbedded(dir);

  const result = run(['plugin', 'remove', 'console', '--managed', 'manual', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console')), false);
});

test('plugin remove: managed = cli from config removes from include list', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli', { include: ['console', 'hot-reload'] });

  const result = run(['plugin', 'remove', 'console', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  const included = parseLuaArray(config, 'include');
  assert.ok(!included.includes('console'), `"console" still in include:\n${config}`);
  assert.ok(included.includes('hot-reload'), `"hot-reload" was unexpectedly removed:\n${config}`);
});

test('plugin remove: managed = auto from config removes filesystem files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');
  installEmbedded(dir);

  const result = run(['plugin', 'remove', 'console', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console')), false);
});

test('plugin remove: managed = manual from config removes filesystem files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'manual');
  installEmbedded(dir);

  const result = run(['plugin', 'remove', 'console', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console')), false);
});

test('plugin remove --managed cli overrides embedded project: removes from include list, files stay on disk', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto', { include: ['console'] });
  installEmbedded(dir);  // files exist on disk

  const result = run(['plugin', 'remove', 'console', '--managed', 'cli', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const config = readFileSync(join(dir, 'feather.config.lua'), 'utf8');
  assert.ok(!parseLuaArray(config, 'include').includes('console'), `"console" still in include:\n${config}`);
  // Files stay on disk because we were in CLI mode (config update only)
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'console')), true);
});

test('plugin remove --managed auto: fails when plugin file not found', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');

  const result = run(['plugin', 'remove', 'console', '--managed', 'auto', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Plugin not found'), outputOf(result));
});

// ---------------------------------------------------------------------------
// plugin update
// ---------------------------------------------------------------------------

test('plugin update --managed cli: prints info message and exits 0', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli', { include: ['console'] });

  const result = run(['plugin', 'update', '--managed', 'cli', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('CLI-managed'), outputOf(result));
});

test('plugin update: managed = cli from config prints info and exits 0', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli');

  const result = run(['plugin', 'update', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('CLI-managed'), outputOf(result));
});

test('plugin update --managed cli: specific plugin id also prints info and exits 0', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli', { include: ['console'] });

  const result = run(['plugin', 'update', 'console', '--managed', 'cli', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('CLI-managed'), outputOf(result));
});

test('plugin update --managed auto: updates plugin files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');
  installEmbedded(dir);

  const installedInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  writeFileSync(installedInit, 'damaged');

  const result = run(['plugin', 'update', 'console', '--managed', 'auto', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.notEqual(readFileSync(installedInit, 'utf8'), 'damaged');
  assert.ok(outputOf(result).includes('Updated console'), outputOf(result));
});

test('plugin update --managed manual: updates plugin files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'manual');
  installEmbedded(dir);

  const installedInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  writeFileSync(installedInit, 'damaged');

  const result = run(['plugin', 'update', 'console', '--managed', 'manual', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.notEqual(readFileSync(installedInit, 'utf8'), 'damaged');
});

test('plugin update: managed = auto from config updates plugin files', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');
  installEmbedded(dir);

  const installedInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  writeFileSync(installedInit, 'damaged');

  const result = run(['plugin', 'update', 'console', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.notEqual(readFileSync(installedInit, 'utf8'), 'damaged');
});

test('plugin update --managed auto overrides CLI config: updates files instead of printing info', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'cli');            // config says cli
  installEmbedded(dir);         // install via --managed auto so files exist

  const installedInit = join(dir, 'feather', 'plugins', 'console', 'init.lua');
  writeFileSync(installedInit, 'damaged');

  // --managed auto overrides the cli config
  const result = run(['plugin', 'update', 'console', '--managed', 'auto', '--local-src', LOCAL_SRC, '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.notEqual(readFileSync(installedInit, 'utf8'), 'damaged');
  assert.ok(!outputOf(result).includes('CLI-managed'), outputOf(result));
});

// ---------------------------------------------------------------------------
// plugin list
// ---------------------------------------------------------------------------

test('plugin list --managed cli: shows include list from config', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli', { include: ['console', 'hot-reload'] });

  const result = run(['plugin', 'list', dir, '--managed', 'cli']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('console'), result.stdout);
  assert.ok(result.stdout.includes('hot-reload'), result.stdout);
});

test('plugin list: managed = cli from config shows include list', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli', { include: ['console'] });

  const result = run(['plugin', 'list', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('console'), result.stdout);
});

test('plugin list: managed = cli with empty include list shows no-plugins message', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli');

  const result = run(['plugin', 'list', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('No plugins included'), outputOf(result));
});

test('plugin list --managed cli: shows catalog name for known plugin ids', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli', { include: ['console'] });

  const result = run(['plugin', 'list', dir, '--managed', 'cli']);
  assert.equal(result.exitCode, 0, outputOf(result));
  // The catalog entry for 'console' has a name; it should appear in the table
  assert.ok(result.stdout.includes('console'), result.stdout);
});

test('plugin list --managed auto: shows installed plugins from filesystem', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');
  installEmbedded(dir);

  const result = run(['plugin', 'list', dir, '--managed', 'auto']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('console'), result.stdout);
});

test('plugin list --managed manual: shows installed plugins from filesystem', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'manual');
  installEmbedded(dir);

  const result = run(['plugin', 'list', dir, '--managed', 'manual']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('console'), result.stdout);
});

test('plugin list: managed = auto from config shows filesystem plugins', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');
  installEmbedded(dir);

  const result = run(['plugin', 'list', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('console'), result.stdout);
});

test('plugin list: managed = manual from config shows filesystem plugins', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'manual');
  installEmbedded(dir);

  const result = run(['plugin', 'list', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('console'), result.stdout);
});

test('plugin list --managed auto overrides cli config: shows filesystem plugins', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'cli', { include: ['hot-reload'] });
  // Install console in embedded mode so it's on the filesystem
  run(['plugin', 'install', 'console', '--managed', 'auto', '--local-src', LOCAL_SRC, '--dir', dir]);

  const result = run(['plugin', 'list', dir, '--managed', 'auto']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('console'), result.stdout);
  // hot-reload is in include list but NOT on filesystem; auto mode should not show it
  assert.ok(!result.stdout.includes('hot-reload'), result.stdout);
});

test('plugin list --managed cli overrides embedded config: shows include list not filesystem', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto', { include: ['hot-reload'] });
  installEmbedded(dir);  // console on filesystem

  const result = run(['plugin', 'list', dir, '--managed', 'cli']);
  assert.equal(result.exitCode, 0, outputOf(result));
  // Should show hot-reload (from include list), not console (filesystem only)
  assert.ok(result.stdout.includes('hot-reload'), result.stdout);
  assert.ok(!result.stdout.includes('console'), result.stdout);
});

// ---------------------------------------------------------------------------
// feather update (core runtime update)
// ---------------------------------------------------------------------------

test('feather update: managed = cli from config prints info and exits 0', () => {
  const dir = makeTmp();
  writeConfig(dir, 'cli');

  const result = run(['update', dir, '--yes']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('CLI-managed'), outputOf(result));
});

test('feather update: managed = auto from config proceeds (attempts update)', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'auto');

  // With a minimal runtime, a local-src update should succeed
  const result = run(['update', dir, '--yes', '--local-src', LOCAL_SRC]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(!outputOf(result).includes('CLI-managed'), outputOf(result));
});

test('feather update: managed = manual from config proceeds (attempts update)', () => {
  const dir = makeTmp();
  writeMinimalRuntime(dir);
  writeConfig(dir, 'manual');

  const result = run(['update', dir, '--yes', '--local-src', LOCAL_SRC]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(!outputOf(result).includes('CLI-managed'), outputOf(result));
});
