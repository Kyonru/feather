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
} from './helpers.mjs';

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
  assert.equal(
    readFileSync(installedInit, 'utf8'),
    readFileSync(join(LOCAL_SRC, 'plugins', 'console', 'init.lua'), 'utf8'),
  );
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
  const source = join(makeTmp(), 'src-lua');
  writeLocalPluginSource(source, 'bad-plugin', { version: null });

  const result = run(['plugin', 'install', 'bad-plugin', '--local-src', source, '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Plugin manifest is missing version: bad-plugin'));
  assert.equal(existsSync(join(dir, 'feather', 'plugins', 'bad-plugin')), false);
});

test('plugin install: local manifest id must match plugin path', () => {
  const dir = makeTmp();
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
