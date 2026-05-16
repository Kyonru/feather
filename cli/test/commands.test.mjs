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
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LOCAL_SRC = join(ROOT, 'src-lua');
// eslint-disable-next-line no-control-regex
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

function writeLocalPluginSource(root, id, options = {}) {
  const sourceDir = options.sourceDir ?? id.replace(/\./g, '/');
  const pluginDir = join(root, 'plugins', sourceDir);
  mkdirSync(pluginDir, { recursive: true });
  const manifestId = options.manifestId ?? id;
  const versionLine = options.version === null ? '' : `  version = "${options.version ?? '1.0.0'}",\n`;
  writeFileSync(
    join(pluginDir, 'manifest.lua'),
    `return {
  id = "${manifestId}",
  name = "${options.name ?? manifestId}",
${versionLine}}
`,
  );
  writeFileSync(join(pluginDir, 'init.lua'), 'return {}\n');
  return pluginDir;
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

function writeFakeCommand(dir, name, script) {
  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const commandPath = join(binDir, name);
  writeFileSync(commandPath, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(commandPath, 0o755);
  return { binDir, commandPath };
}

function writeFakeVendorGit(dir) {
  const recordPath = join(dir, 'git-record.json');
  const { binDir } = writeFakeCommand(dir, 'git', `
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const recordPath = ${JSON.stringify(recordPath)};
const records = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, 'utf8')) : [];
records.push({ args });
fs.writeFileSync(recordPath, JSON.stringify(records, null, 2));
if (args[0] === '--version') {
  console.log('git version test');
  process.exit(0);
}
if (args[0] !== 'clone') {
  console.error('unexpected git args ' + args.join(' '));
  process.exit(1);
}
const target = args[args.length - 1];
const repo = args[args.length - 2];
fs.mkdirSync(target, { recursive: true });
if (repo.includes('love-android')) {
  fs.writeFileSync(path.join(target, 'gradlew'), '#!/bin/sh\\n');
  fs.mkdirSync(path.join(target, 'app', 'src', 'embed', 'assets'), { recursive: true });
} else if (repo.includes('love')) {
  fs.mkdirSync(path.join(target, 'platform', 'xcode', 'love.xcodeproj'), { recursive: true });
  fs.writeFileSync(path.join(target, 'platform', 'xcode', 'love.xcodeproj', 'project.pbxproj'), '');
}
process.exit(0);
`);
  return { binDir, recordPath };
}

function envWithPath(binDir, extra = {}) {
  return {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
    ...extra,
  };
}

function writeFakeLoveJs(dir) {
  const loveJsDir = join(dir, 'love.js');
  mkdirSync(loveJsDir, { recursive: true });
  writeFileSync(
    join(loveJsDir, 'index.html'),
    '<!doctype html><html><head><title>löve.js</title></head><body><script src="player.min.js"></script></body></html>',
  );
  writeFileSync(join(loveJsDir, 'player.min.js'), 'console.log("love.js");\n');
  return loveJsDir;
}

function writeFakeLoveAndroid(dir, options = {}) {
  const recordPath = options.recordPath ?? join(dir, 'gradle-record.json');
  const apkRel = options.apkRel ?? 'app/build/outputs/apk/embed/debug/app-embed-debug.apk';
  const aabRel = options.aabRel ?? 'app/build/outputs/bundle/embedRelease/app-embed-release.aab';
  const manifestPermission = options.recordAudioPermission
    ? '    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n'
    : '';
  const root = join(dir, 'love-android');
  mkdirSync(join(root, 'app', 'src', 'main', 'res', 'values'), { recursive: true });
  mkdirSync(join(root, 'app', 'src', 'main'), { recursive: true });
  writeFileSync(
    join(root, 'app', 'build.gradle'),
    `android {
    namespace "org.love2d.android"
    defaultConfig {
        applicationId "org.love2d.android"
        versionCode 1
        versionName "0.0.0"
    }
}
`,
  );
  writeFileSync(
    join(root, 'app', 'src', 'main', 'AndroidManifest.xml'),
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${manifestPermission}    <uses-permission android:name="android.permission.INTERNET" />
    <application android:label="LÖVE">
        <activity android:name=".GameActivity" android:screenOrientation="portrait" />
    </application>
</manifest>
`,
  );
  writeFileSync(join(root, 'app', 'src', 'main', 'res', 'values', 'strings.xml'), '<resources><string name="app_name">LÖVE</string></resources>\n');
  const gradlew = join(root, 'gradlew');
  writeFileSync(
    gradlew,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const cwd = process.cwd();
const apk = path.join(cwd, ${JSON.stringify(apkRel)});
fs.mkdirSync(path.dirname(apk), { recursive: true });
fs.writeFileSync(apk, 'fake apk');
const aab = path.join(cwd, ${JSON.stringify(aabRel)});
fs.mkdirSync(path.dirname(aab), { recursive: true });
fs.writeFileSync(aab, 'fake aab');
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : { records: [] };
const entry = {
  argv: process.argv.slice(2),
  embeddedLoveExists: fs.existsSync(path.join(cwd, 'app', 'src', 'embed', 'assets', 'game.love')),
  gradle: fs.readFileSync(path.join(cwd, 'app', 'build.gradle'), 'utf8'),
  manifest: fs.readFileSync(path.join(cwd, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8'),
  signingProperties: fs.existsSync(path.join(cwd, 'feather-signing.properties'))
    ? fs.readFileSync(path.join(cwd, 'feather-signing.properties'), 'utf8')
    : '',
};
previous.records.push(entry);
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ ...entry, records: previous.records }, null, 2));
process.exit(0);
`,
  );
  chmodSync(gradlew, 0o755);
  return { root, recordPath };
}

function writeFakeLoveIos(dir) {
  const root = join(dir, 'love-ios');
  const projectDir = join(root, 'platform', 'xcode', 'love.xcodeproj');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, 'project.pbxproj'),
    `// !$*UTF8*$!
{
/* Begin PBXBuildFile section */
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
/* End PBXFileReference section */
    1234567890ABCDEF00000001 /* Resources */ = {
        isa = PBXResourcesBuildPhase;
        files = (
        );
    };
}
`,
  );
  return root;
}

function writeBuildConfig(dir, config) {
  writeFileSync(join(dir, 'feather.build.json'), `${JSON.stringify(config, null, 2)}\n`);
}

async function writeFakeAppleLibrariesZip(dir) {
  const { createZipBuffer } = await import('../dist/lib/build/archive.js');
  const zipPath = join(dir, 'love-apple-libraries.zip');
  writeFileSync(zipPath, createZipBuffer([
    { name: 'iOS/libraries/liblove-test.a', data: Buffer.from('ios lib') },
    { name: 'shared/test-shared.txt', data: Buffer.from('shared lib') },
  ]));
  return zipPath;
}

function parseDoctorJson(dir, extra = []) {
  const result = run(['doctor', dir, '--json', ...extra]);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  assert.equal(result.stdout.trim().startsWith('{'), true);
  return JSON.parse(result.stdout);
}

function parseDoctorJsonResult(dir, extra = []) {
  const result = run(['doctor', dir, '--json', ...extra]);
  assert.equal(ANSI_RE.test(result.stdout), false);
  assert.equal(result.stdout.trim().startsWith('{'), true, outputOf(result));
  return { result, parsed: JSON.parse(result.stdout) };
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

test('remove: refuses runtime symlink escaping project', () => {
  const dir = makeTmp();
  const outside = join(makeTmp(), 'outside-runtime');
  writeGame(dir);
  writeMinimalRuntime(outside);
  symlinkSync(join(outside, 'feather'), join(dir, 'feather'), 'dir');
  writeFileSync(join(dir, 'feather.config.lua'), [
    '-- FEATHER-MANAGED-BEGIN',
    '-- mode: auto',
    '-- installDir: feather',
    '-- manualEntrypoint: (none)',
    '-- FEATHER-MANAGED-END',
    'return { appId = "feather-app-test" }',
    '',
  ].join('\n'));

  const result = run(['remove', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Runtime remove target resolves outside project root'));
  assert.equal(existsSync(join(outside, 'feather', 'init.lua')), true);
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

test('doctor --json reports unknown installed plugin trust', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeMinimalRuntime(dir);
  writeLocalPluginSource(dir, 'custom-plugin');

  const parsed = parseDoctorJson(dir);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  const trustCheck = labels.get('Plugin custom-plugin');
  assert.equal(trustCheck.severity, 'warn');
  assert.ok(trustCheck.detail.includes('unknown trust'));
  assert.ok(trustCheck.fix.includes('feather plugin remove custom-plugin'));
});

test('doctor --json reports dangerous bundled plugin trust', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeMinimalRuntime(dir);
  const result = run(['plugin', 'install', 'console', '--local-src', LOCAL_SRC, '--dir', dir]);
  assert.equal(result.exitCode, 0, outputOf(result));

  const parsed = parseDoctorJson(dir);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  const trustCheck = labels.get('Plugin console trust');
  assert.equal(trustCheck.severity, 'warn');
  assert.ok(trustCheck.detail.includes('development-only'));
});

test('doctor --json warns about runtime symlinks escaping project', () => {
  const dir = makeTmp();
  const outside = join(makeTmp(), 'outside-runtime');
  writeGame(dir);
  writeMinimalRuntime(outside);
  symlinkSync(join(outside, 'feather'), join(dir, 'feather'), 'dir');

  const parsed = parseDoctorJson(dir);
  const symlinkCheck = parsed.checks.find((check) => check.label === 'Symlink escape');
  assert.equal(symlinkCheck.severity, 'warn');
  assert.ok(symlinkCheck.detail.includes('outside-runtime'));
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

test('doctor --production fails unsafe remote-control and production settings', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  host = "0.0.0.0",
  include = { "console", "hot-reload" },
  apiKey = "dev",
  captureScreenshot = true,
  writeToDisk = true,
  debugger = {
    enabled = true,
    hotReload = {
      enabled = true,
      allow = { "game.*" },
      persistToDisk = true,
    },
  },
}
`,
  );

  const { result, parsed } = parseDoctorJsonResult(dir, ['--production']);
  assert.equal(result.exitCode, 1);
  assert.equal(parsed.production, true);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  for (const label of [
    '__DANGEROUS_INSECURE_CONNECTION__',
    'Desktop App ID',
    'captureScreenshot',
    'Hot reload',
    'Hot reload allowlist',
    'Hot reload persistence',
    'Console API key',
    'Step debugger',
    'Disk logging',
    'Network host exposure',
  ]) {
    assert.equal(labels.get(label)?.severity, 'fail', `${label} should fail in production`);
  }
});

test('doctor --json keeps unsafe settings warning-oriented outside production', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  host = "0.0.0.0",
  include = { "console" },
  apiKey = "dev",
}
`,
  );

  const { result, parsed } = parseDoctorJsonResult(dir);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(parsed.production, false);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('__DANGEROUS_INSECURE_CONNECTION__')?.severity, 'warn');
  assert.equal(labels.get('Console API key')?.severity, 'warn');
  assert.equal(labels.get('Network host exposure')?.severity, 'warn');
});

test('doctor --security --json emits a sterile security report without secrets', () => {
  const dir = makeTmp();
  const secret = 'StrongSecretValue1234567890!';
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  appId = "feather-app-test-1234567890",
  host = "127.0.0.1",
  include = { "console" },
  apiKey = "${secret}",
}
`,
  );

  const result = run(['doctor', dir, '--security', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  assert.equal(result.stdout.includes('✔'), false);
  assert.equal(result.stdout.includes(secret), false);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.security, true);
  assert.equal(parsed.report.config.apiKeyStatus, 'configured');
  assert.equal(parsed.report.config.consoleIncluded, true);
  assert.equal(parsed.report.network.exposure, 'loopback');
  assert.ok(parsed.checks.every((check) => ['Safety', 'Plugins', 'Packages', 'Runtime', 'Project'].includes(check.group)));
  assert.equal(parsed.checks.some((check) => check.label === 'Node.js'), false);
});

test('doctor --production fails unmanaged embedded runtime', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeMinimalRuntime(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890", mode = "socket" }\n');

  const { result, parsed } = parseDoctorJsonResult(dir, ['--production']);
  assert.equal(result.exitCode, 1);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Managed runtime')?.severity, 'fail');
  assert.ok(labels.get('Managed runtime')?.fix.includes('feather init'));
});

test('build web: creates love archive, love.js html package, zip, and manifest', () => {
  const dir = makeTmp();
  writeGame(dir);
  const loveJsDir = writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Command Game',
    version: '1.2.3',
    targets: { web: { loveJsDir: 'love.js' } },
    upload: { itch: { project: 'tester/command-game', channels: { web: 'html5' } } },
  });

  const result = run(['build', 'web', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.target, 'web');
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'love'), true);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'zip'), true);
  assert.equal(existsSync(join(dir, 'builds', 'command-game-1.2.3.love')), true);
  assert.equal(existsSync(join(dir, 'builds', 'command-game-1.2.3-html.zip')), true);
  const index = readFileSync(join(dir, 'builds', 'command-game-1.2.3-html', 'index.html'), 'utf8');
  assert.ok(index.includes('<title>Command Game</title>'));
  assert.ok(index.includes('player.min.js?g=game.love'));
  const manifest = JSON.parse(readFileSync(join(dir, 'builds', 'feather-build-manifest.json'), 'utf8'));
  assert.equal(manifest.target, 'web');
});

test('build linux: delegates desktop packaging to love-release and writes manifest', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Desktop Game', version: '2.0.0' });
const recordPath = join(dir, 'love-release-record.json');
  const { binDir } = writeFakeCommand(dir, 'love-release', `
if (process.argv.length === 3 && process.argv[2] === '--version') {
  console.log('love-release test');
  process.exit(0);
}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ argv: process.argv.slice(2) }, null, 2));
process.exit(0);
`);

  const result = run(['build', 'linux', '--dir', dir, '--json'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(existsSync(join(dir, 'builds', 'desktop-game-2.0.0.love')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(record.argv.includes('--target'));
  assert.ok(record.argv.includes('linux'));
  assert.ok(record.argv.includes('--name'));
  assert.ok(record.argv.includes('Desktop Game'));
});

test('build validation: rejects bad mobile config values and unsafe native paths', async () => {
  const { validateAndroidBuildConfig, validateIosBuildConfig } = await import('../dist/lib/build/validation.js');
  const { resolveWorkspacePath } = await import('../dist/lib/build/native.js');
  const baseConfig = {
    configPath: '/tmp/feather.build.json',
    projectDir: '/tmp/game',
    sourceDir: '/tmp/game',
    outDir: '/tmp/game/builds',
    name: 'Validation Game',
    version: '1.0.0',
    include: [],
    exclude: [],
    includeRuntime: false,
    targets: {},
    upload: {},
  };

  const androidIssues = validateAndroidBuildConfig({
    ...baseConfig,
    productId: 'not a product id',
    targets: { android: { versionCode: 0, orientation: 'sideways', gradleTask: 'assemble debug' } },
  });
  assert.deepEqual(androidIssues.map((issue) => issue.field), [
    'productId',
    'targets.android.versionCode',
    'targets.android.orientation',
    'targets.android.gradleTask',
  ]);
  const androidReleaseIssues = validateAndroidBuildConfig({
    ...baseConfig,
    targets: {
      android: {
        release: {
          bundleTask: 'bundle release',
          apkArtifactPath: '',
          storePasswordEnv: '1BAD_ENV',
          keyPasswordEnv: 'GOOD_ENV',
        },
      },
    },
  }, true);
  assert.ok(androidReleaseIssues.some((issue) => issue.field === 'targets.android.release.bundleTask'));
  assert.ok(androidReleaseIssues.some((issue) => issue.field === 'targets.android.release.apkArtifactPath'));
  assert.ok(androidReleaseIssues.some((issue) => issue.field === 'targets.android.release.storePasswordEnv'));

  const iosIssues = validateIosBuildConfig({
    ...baseConfig,
    targets: { ios: { bundleIdentifier: 'bad id', scheme: 'bad;', derivedDataPath: '../escape' } },
  });
  assert.deepEqual(iosIssues.map((issue) => issue.field), [
    'bundleIdentifier',
    'targets.ios.scheme',
    'targets.ios.derivedDataPath',
  ]);
  const iosReleaseIssues = validateIosBuildConfig({
    ...baseConfig,
    targets: { ios: { release: { exportMethod: 'side-load', signingStyle: 'sometimes', teamId: 'BAD TEAM' } } },
  }, true);
  assert.ok(iosReleaseIssues.some((issue) => issue.field === 'targets.ios.release.exportMethod'));
  assert.ok(iosReleaseIssues.some((issue) => issue.field === 'targets.ios.release.signingStyle'));
  assert.ok(iosReleaseIssues.some((issue) => issue.field === 'targets.ios.release.teamId'));
  assert.throws(() => resolveWorkspacePath('/tmp/native-work', '../escape.apk', 'Artifact'), /native build workspace/);
});

test('build release: non-mobile targets fail cleanly', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, { name: 'Web Release', version: '1.0.0', targets: { web: { loveJsDir: 'love.js' } } });

  const result = run(['build', 'web', '--dir', dir, '--release', '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Release mode is currently supported only for android and ios'));
});

test('build vendor add android --json: clones vendor and updates config', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Vendor Android', version: '1.0.0', loveVersion: '11.5' });
  const { binDir, recordPath } = writeFakeVendorGit(dir);

  const result = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--json'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].target, 'android');
  assert.equal(parsed.vendors[0].relativePath, 'vendor/love-android');
  assert.equal(parsed.vendors[0].configUpdated, true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-android', 'gradlew')), true);
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.android.loveAndroidDir, 'vendor/love-android');
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(records.some((record) => record.args.includes('--recurse-submodules')));
  assert.ok(records.some((record) => record.args.includes('https://github.com/love2d/love-android')));
});

test('build vendor add ios --json: clones vendor, installs Apple libraries, and updates config', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Vendor iOS', version: '1.0.0', loveVersion: '11.5' });
  const { binDir, recordPath } = writeFakeVendorGit(dir);
  const zipPath = await writeFakeAppleLibrariesZip(dir);

  const result = run(['build', 'vendor', 'add', 'ios', '--dir', dir, '--json'], {
    env: envWithPath(binDir, { FEATHER_TEST_LOVE_APPLE_LIBRARIES_ZIP: zipPath }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].target, 'ios');
  assert.equal(parsed.vendors[0].relativePath, 'vendor/love-ios');
  assert.equal(existsSync(join(dir, 'vendor', 'love-ios', 'platform', 'xcode', 'ios', 'libraries', 'liblove-test.a')), true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-ios', 'platform', 'xcode', 'shared', 'test-shared.txt')), true);
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.ios.loveIosDir, 'vendor/love-ios');
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(records.some((record) => record.args.includes('https://github.com/love2d/love')));
});

test('build vendor add mobile --dry-run --json: reports planned vendors without writing', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['build', 'vendor', 'add', 'mobile', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.vendors.map((vendor) => vendor.target), ['android', 'ios']);
  assert.equal(existsSync(join(dir, 'vendor')), false);
  assert.equal(existsSync(join(dir, 'feather.build.json')), false);
});

test('build vendor add --no-config: fetches vendor without writing build config', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { binDir } = writeFakeVendorGit(dir);

  const result = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--no-config', '--json'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'vendor', 'love-android', 'gradlew')), true);
  assert.equal(existsSync(join(dir, 'feather.build.json')), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].configUpdated, false);
});

test('build vendor add: existing directories and conflicting config require --force', () => {
  const dir = makeTmp();
  writeGame(dir);
  mkdirSync(join(dir, 'vendor', 'love-android'), { recursive: true });

  const existing = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--json']);
  assert.equal(existing.exitCode, 1);
  assert.ok(outputOf(existing).includes('--force'));

  writeBuildConfig(dir, { targets: { android: { loveAndroidDir: 'native/love-android' } } });
  const conflict = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--dry-run', '--json']);
  assert.equal(conflict.exitCode, 1);
  assert.ok(outputOf(conflict).includes('already configured'));

  const { binDir } = writeFakeVendorGit(dir);
  const forced = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--force', '--json'], { env: envWithPath(binDir) });
  assert.equal(forced.exitCode, 0, outputOf(forced));
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.android.loveAndroidDir, 'vendor/love-android');
});

test('build vendor list --json: reports configured, missing, and valid vendors', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    targets: {
      android: { loveAndroidDir: 'love-android' },
      ios: { loveIosDir: 'vendor/love-ios' },
    },
  });

  const result = run(['build', 'vendor', 'list', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.vendors.map((vendor) => [vendor.target, vendor]));
  assert.equal(labels.get('android').valid, true);
  assert.equal(labels.get('ios').exists, false);
  assert.equal(labels.get('ios').detail, 'missing');
});

test('build vendor add: missing git produces compact actionable error', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--json'], {
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', PATH: '' },
  });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('git is required'));
});

test('build android: invalid config fails before staging or writing artifacts', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Bad Mobile Game',
    version: '1.0.0',
    productId: 'bad product id',
    targets: { android: { loveAndroidDir: 'love-android', versionCode: 0 } },
  });

  const result = run(['build', 'android', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Invalid android build config'));
  assert.ok(outputOf(result).includes('productId'));
  assert.equal(existsSync(join(dir, 'builds', 'bad-mobile-game-1.0.0.love')), false);
});

test('build android: injects game.love, runs Gradle, copies APK, and writes manifest', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { recordPath } = writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Mobile Game',
    version: '1.2.3',
    productId: 'com.example.mobilegame',
    targets: {
      android: {
        loveAndroidDir: 'love-android',
        displayName: 'Mobile Game Dev',
        orientation: 'landscape',
        recordAudio: true,
        versionCode: 7,
        versionName: '1.2.3-dev',
      },
    },
  });

  const result = run(['build', 'android', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.target, 'android');
  assert.equal(existsSync(join(dir, 'builds', 'mobile-game-1.2.3.love')), true);
  assert.equal(existsSync(join(dir, 'builds', 'mobile-game-1.2.3-android.apk')), true);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'apk'), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(record.argv, ['assembleEmbedRecordDebug']);
  assert.equal(record.embeddedLoveExists, true);
  assert.ok(record.gradle.includes('applicationId "com.example.mobilegame"'));
  assert.ok(record.gradle.includes('versionCode 7'));
  assert.ok(record.gradle.includes('versionName "1.2.3-dev"'));
  assert.ok(record.manifest.includes('android:label="Mobile Game Dev"'));
  assert.ok(record.manifest.includes('android:screenOrientation="landscape"'));
  assert.ok(record.manifest.includes('android.permission.RECORD_AUDIO'));
  const manifest = JSON.parse(readFileSync(join(dir, 'builds', 'feather-build-manifest.json'), 'utf8'));
  assert.equal(manifest.target, 'android');
  assert.equal(manifest.artifacts.some((artifact) => artifact.type === 'apk'), true);
});

test('build android: honors gradleTask, custom artifactPath, and removes microphone permission', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { recordPath } = writeFakeLoveAndroid(dir, {
    recordAudioPermission: true,
    apkRel: 'app/build/outputs/custom/custom-debug.apk',
  });
  writeBuildConfig(dir, {
    name: 'Custom Android',
    version: '2.0.0',
    productId: 'com.example.customandroid',
    targets: {
      android: {
        loveAndroidDir: 'love-android',
        gradleTask: ':app:assembleCustomDebug',
        artifactPath: 'app/build/outputs/custom/custom-debug.apk',
        recordAudio: false,
      },
    },
  });

  const result = run(['build', 'android', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'builds', 'custom-android-2.0.0-android.apk')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(record.argv, [':app:assembleCustomDebug']);
  assert.equal(record.manifest.includes('android.permission.RECORD_AUDIO'), false);
  assert.equal(record.manifest.includes('android.permission.INTERNET'), true);
});

test('build android --release: runs bundle/apk tasks, copies artifacts, and keeps signing secrets out of output', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'release.keystore'), 'fake keystore');
  const { recordPath } = writeFakeLoveAndroid(dir, {
    recordAudioPermission: true,
    aabRel: 'app/build/outputs/custom/store-release.aab',
    apkRel: 'app/build/outputs/custom/store-release.apk',
  });
  writeBuildConfig(dir, {
    name: 'Store Android',
    version: '3.0.0',
    productId: 'com.example.storeandroid',
    targets: {
      android: {
        loveAndroidDir: 'love-android',
        recordAudio: true,
        release: {
          bundleTask: ':app:bundleStoreRelease',
          apkTask: ':app:assembleStoreRelease',
          bundleArtifactPath: 'app/build/outputs/custom/store-release.aab',
          apkArtifactPath: 'app/build/outputs/custom/store-release.apk',
          keystorePath: 'release.keystore',
          keyAlias: 'release-key',
          storePasswordEnv: 'FEATHER_TEST_STORE_PASSWORD',
          keyPasswordEnv: 'FEATHER_TEST_KEY_PASSWORD',
        },
      },
    },
  });

  const result = run(['build', 'android', '--dir', dir, '--release', '--json'], {
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      FEATHER_TEST_STORE_PASSWORD: 'store-secret',
      FEATHER_TEST_KEY_PASSWORD: 'key-secret',
    },
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  assert.equal(outputOf(result).includes('store-secret'), false);
  assert.equal(outputOf(result).includes('key-secret'), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'aab'), true);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'apk'), true);
  assert.equal(existsSync(join(dir, 'builds', 'store-android-3.0.0-android.aab')), true);
  assert.equal(existsSync(join(dir, 'builds', 'store-android-3.0.0-android.apk')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(record.records.map((entry) => entry.argv[0]), [':app:bundleStoreRelease', ':app:assembleStoreRelease']);
  assert.ok(record.signingProperties.includes('keyAlias=release-key'));
  assert.ok(record.signingProperties.includes('storePassword=store-secret'));
});

test('build ios: invalid bundle id fails before xcodebuild', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Bad iOS Game',
    version: '1.0.0',
    targets: { ios: { loveIosDir: 'love-ios', bundleIdentifier: 'bad id' } },
  });
  const recordPath = join(dir, 'xcodebuild-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(recordPath)}, 'ran');
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--json'], { env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }) });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Invalid ios build config'));
  assert.equal(existsSync(recordPath), false);
});

test('build ios: injects game.love, runs xcodebuild, copies app, and writes manifest', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'iOS Game',
    version: '5.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.iosgame',
        displayName: 'iOS Game Dev',
        scheme: 'FeatherGame',
        configuration: 'Release',
        sdk: 'iphonesimulator',
        derivedDataPath: 'builds/ios-derived-data',
        teamId: 'ABC123XYZ',
      },
    },
  });
  const recordPath = join(dir, 'xcodebuild-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
if (process.argv.includes('-version')) {
  console.log('Xcode 99.0');
  process.exit(0);
}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const derivedData = args[args.indexOf('-derivedDataPath') + 1];
const app = path.join(derivedData, 'Build', 'Products', 'Debug-iphonesimulator', 'love-ios.app');
fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(path.join(app, 'Info.plist'), 'fake app');
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({
  argv: args,
  gameLoveExists: fs.existsSync(path.join(process.cwd(), 'platform', 'xcode', 'game.love')),
  projectContainsGameLove: fs.readFileSync(path.join(process.cwd(), 'platform', 'xcode', 'love.xcodeproj', 'project.pbxproj'), 'utf8').includes('game.love'),
}, null, 2));
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--json'], { env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.target, 'ios');
  assert.equal(existsSync(join(dir, 'builds', 'ios-game-5.0.0.love')), true);
  assert.equal(existsSync(join(dir, 'builds', 'ios-game-5.0.0-ios.app')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(record.argv.includes('-scheme'));
  assert.ok(record.argv.includes('FeatherGame'));
  assert.ok(record.argv.includes('-configuration'));
  assert.ok(record.argv.includes('Release'));
  assert.ok(record.argv.includes('-sdk'));
  assert.ok(record.argv.includes('iphonesimulator'));
  assert.ok(record.argv.includes(join(dir, 'builds', 'ios-derived-data')));
  assert.ok(record.argv.includes('PRODUCT_BUNDLE_IDENTIFIER=com.example.iosgame'));
  assert.ok(record.argv.includes('INFOPLIST_KEY_CFBundleDisplayName=iOS Game Dev'));
  assert.ok(record.argv.includes('DEVELOPMENT_TEAM=ABC123XYZ'));
  assert.equal(record.gameLoveExists, true);
  assert.equal(record.projectContainsGameLove, true);
  const manifest = JSON.parse(readFileSync(join(dir, 'builds', 'feather-build-manifest.json'), 'utf8'));
  assert.equal(manifest.target, 'ios');
  assert.equal(manifest.artifacts.some((artifact) => artifact.type === 'app'), true);
});

test('build ios --release: archives, exports IPA, and writes release manifest artifacts', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Release iOS',
    version: '6.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.releaseios',
        displayName: 'Release iOS',
        scheme: 'ReleaseGame',
        release: {
          archivePath: 'builds/native-release.xcarchive',
          exportPath: 'builds/native-export',
          exportMethod: 'app-store-connect',
          signingStyle: 'manual',
          provisioningProfileSpecifier: 'Release Profile',
          teamId: 'TEAM12345',
          configuration: 'Release',
          sdk: 'iphoneos',
        },
      },
    },
  });
  const recordPath = join(dir, 'xcodebuild-release-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
if (process.argv.includes('-version')) {
  console.log('Xcode 99.0');
  process.exit(0);
}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : { records: [] };
if (args.includes('archive')) {
  const archivePath = args[args.indexOf('-archivePath') + 1];
  fs.mkdirSync(archivePath, { recursive: true });
  fs.writeFileSync(path.join(archivePath, 'Info.plist'), 'fake archive');
}
if (args.includes('-exportArchive')) {
  const exportPath = args[args.indexOf('-exportPath') + 1];
  const exportOptions = args[args.indexOf('-exportOptionsPlist') + 1];
  fs.mkdirSync(exportPath, { recursive: true });
  fs.writeFileSync(path.join(exportPath, 'Release iOS.ipa'), 'fake ipa');
  previous.exportOptions = fs.readFileSync(exportOptions, 'utf8');
}
previous.records.push({ argv: args });
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--release', '--json'], {
    env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'xcarchive'), true);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'ipa'), true);
  assert.equal(existsSync(join(dir, 'builds', 'release-ios-6.0.0-ios.xcarchive')), true);
  assert.equal(existsSync(join(dir, 'builds', 'release-ios-6.0.0-ios.ipa')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(record.records[0].argv.includes('archive'));
  assert.ok(record.records[0].argv.includes('DEVELOPMENT_TEAM=TEAM12345'));
  assert.ok(record.records[1].argv.includes('-exportArchive'));
  assert.ok(record.exportOptions.includes('<string>app-store-connect</string>'));
  assert.ok(record.exportOptions.includes('<string>manual</string>'));
  assert.ok(record.exportOptions.includes('Release Profile'));
});

test('build mobile: missing native template paths fail with actionable errors', () => {
  const dir = makeTmp();
  writeGame(dir);

  const android = run(['build', 'android', '--dir', dir, '--allow-unsafe', '--json']);
  assert.equal(android.exitCode, 1);
  assert.ok(outputOf(android).includes('targets.android.loveAndroidDir'));

  const ios = run(['build', 'ios', '--dir', dir, '--allow-unsafe', '--json'], { env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', FEATHER_TEST_ALLOW_IOS_BUILD: '1' } });
  assert.equal(ios.exitCode, 1);
  assert.ok(outputOf(ios).includes('targets.ios.loveIosDir'));
});

test('build ios: non-macOS hosts fail with setup guidance', { skip: process.platform === 'darwin' }, () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Non Mac iOS',
    version: '1.0.0',
    targets: { ios: { loveIosDir: 'love-ios', bundleIdentifier: 'com.example.nonmacios' } },
  });

  const result = run(['build', 'ios', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('iOS builds require macOS with Xcode'));
});

test('build: production preflight blocks unsafe Feather config unless explicitly allowed', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, { name: 'Unsafe Game', version: '1.0.0', targets: { web: { loveJsDir: 'love.js' } } });
  writeFileSync(join(dir, 'feather.config.lua'), 'return { include = { "console" }, apiKey = "dev" }\n');

  const blocked = run(['build', 'web', '--dir', dir, '--json']);
  assert.equal(blocked.exitCode, 1);
  assert.ok(outputOf(blocked).includes('Production build preflight failed'));

  const allowed = run(['build', 'web', '--dir', dir, '--json', '--allow-unsafe']);
  assert.equal(allowed.exitCode, 0, outputOf(allowed));
  assert.equal(JSON.parse(allowed.stdout).ok, true);
});

test('upload itch: dry-run uses build manifest and configured channel', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Upload Game',
    version: '3.4.5',
    targets: { web: { loveJsDir: 'love.js' } },
    upload: { itch: { project: 'tester/upload-game', channels: { web: 'html5' } } },
  });
  const build = run(['build', 'web', '--dir', dir, '--json']);
  assert.equal(build.exitCode, 0, outputOf(build));

  const result = run(['upload', 'itch', 'web', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.project, 'tester/upload-game');
  assert.equal(parsed.channel, 'html5');
  assert.equal(parsed.userVersion, '3.4.5');
  assert.deepEqual(parsed.command.slice(0, 2), ['butler', 'push']);
});

test('upload itch: fake butler receives artifact, channel, version, and flags', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Butler Game',
    version: '4.0.0',
    targets: { web: { loveJsDir: 'love.js' } },
    upload: { itch: { project: 'tester/butler-game', channels: { web: 'html5' } } },
  });
  const build = run(['build', 'web', '--dir', dir, '--json']);
  assert.equal(build.exitCode, 0, outputOf(build));
  const recordPath = join(dir, 'butler-record.json');
  const { binDir } = writeFakeCommand(dir, 'butler', `
if (process.argv.includes('--version')) {
  console.log('butler test');
  process.exit(0);
}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ argv: process.argv.slice(2) }, null, 2));
process.exit(0);
`);

  const result = run(['upload', 'itch', 'web', '--dir', dir, '--if-changed', '--hidden', '--json'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.argv[0], 'push');
  assert.ok(record.argv[1].endsWith('butler-game-4.0.0.love') || record.argv[1].endsWith('butler-game-4.0.0-html.zip'));
  assert.equal(record.argv[2], 'tester/butler-game:html5');
  assert.ok(record.argv.includes('--userversion'));
  assert.ok(record.argv.includes('4.0.0'));
  assert.ok(record.argv.includes('--if-changed'));
  assert.ok(record.argv.includes('--hidden'));
});

test('upload steam: planned target fails cleanly', () => {
  const dir = makeTmp();
  writeGame(dir);
  const result = run(['upload', 'steam', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('planned but not supported yet'));
});

test('doctor: build and upload target checks report missing and configured dependencies', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, {
    name: 'Doctor Build Game',
    version: '1.0.0',
    upload: { itch: { project: 'tester/doctor-build-game' } },
  });
  const { parsed: missing } = parseDoctorJsonResult(dir, ['--build-target', 'web', '--upload-target', 'itch']);
  const missingLabels = new Map(missing.checks.map((check) => [check.label, check]));
  assert.equal(missingLabels.get('love.js player')?.severity, 'fail');
  assert.equal(missingLabels.get('butler')?.severity, 'fail');
  assert.ok(missingLabels.get('love.js player')?.fix.includes('targets.web.loveJsDir'));

  writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Doctor Build Game',
    version: '1.0.0',
    targets: { web: { loveJsDir: 'love.js' } },
    upload: { itch: { project: 'tester/doctor-build-game' } },
  });
  const { binDir } = writeFakeCommand(dir, 'butler', `console.log('butler test'); process.exit(0);`);
  const configured = run(['doctor', dir, '--json', '--build-target', 'web', '--upload-target', 'itch'], { env: envWithPath(binDir, { BUTLER_API_KEY: 'test-key' }) });
  assert.equal(configured.exitCode, 0, outputOf(configured));
  const parsed = JSON.parse(configured.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('love.js player')?.severity, 'pass');
  assert.equal(labels.get('butler')?.severity, 'pass');
  assert.equal(labels.get('BUTLER_API_KEY')?.severity, 'pass');
});

test('doctor: android build target reports template and local tool setup', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Android Doctor Game', version: '1.0.0' });
  const { parsed: missing } = parseDoctorJsonResult(dir, ['--build-target', 'android']);
  const missingLabels = new Map(missing.checks.map((check) => [check.label, check]));
  assert.equal(missingLabels.get('love-android template')?.severity, 'fail');
  assert.equal(missingLabels.get('Android Gradle wrapper')?.severity, 'fail');
  assert.ok(missingLabels.get('love-android template')?.fix.includes('targets.android.loveAndroidDir'));
  assert.ok(missingLabels.get('love-android template')?.fix.includes('feather build vendor add android'));

  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Android Doctor Game',
    version: '1.0.0',
    productId: 'com.example.androiddoctor',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir } = writeFakeCommand(dir, 'java', `console.error('java version "17.0.0"'); process.exit(0);`);
  const configured = run(['doctor', dir, '--json', '--build-target', 'android'], {
    env: envWithPath(binDir, { ANDROID_HOME: join(dir, 'android-sdk') }),
  });
  assert.equal(configured.stdout.trim().startsWith('{'), true, outputOf(configured));
  const parsed = JSON.parse(configured.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('love-android template')?.severity, 'pass');
  assert.equal(labels.get('Android Gradle wrapper')?.severity, 'pass');
  assert.equal(labels.get('JDK')?.severity, 'pass');
  assert.equal(labels.get('Android SDK')?.severity, 'pass');
  assert.equal(labels.get('Android product id')?.severity, 'pass');
  assert.equal(labels.get('Android signing')?.severity, 'warn');
});

test('doctor: mobile build target reports config validation failures', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Doctor Bad Android',
    version: '1.0.0',
    productId: 'bad product id',
    targets: { android: { loveAndroidDir: 'love-android', versionCode: 0 } },
  });

  const { result, parsed } = parseDoctorJsonResult(dir, ['--build-target', 'android']);
  assert.equal(result.exitCode, 1);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Android config')?.severity, 'fail');
  assert.ok(labels.get('Android config')?.detail.includes('versionCode'));
  assert.equal(labels.get('Android product id')?.severity, 'fail');
});

test('doctor: android release reports missing signing environment', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeFileSync(join(dir, 'release.keystore'), 'fake keystore');
  writeBuildConfig(dir, {
    name: 'Doctor Android Release',
    version: '1.0.0',
    productId: 'com.example.doctorandroidrelease',
    targets: {
      android: {
        loveAndroidDir: 'love-android',
        release: {
          keystorePath: 'release.keystore',
          keyAlias: 'release-key',
          storePasswordEnv: 'FEATHER_MISSING_STORE_PASSWORD',
          keyPasswordEnv: 'FEATHER_MISSING_KEY_PASSWORD',
        },
      },
    },
  });

  const { result, parsed } = parseDoctorJsonResult(dir, ['--build-target', 'android', '--release']);
  assert.equal(result.exitCode, 1);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Android config')?.severity, 'pass');
  assert.equal(labels.get('Android signing')?.severity, 'fail');
  assert.ok(labels.get('Android signing')?.detail.includes('FEATHER_MISSING_STORE_PASSWORD'));
});

test('doctor: ios build target reports platform, template, Xcode, and signing hints', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'iOS Doctor Game', version: '1.0.0' });
  const { parsed: missing } = parseDoctorJsonResult(dir, ['--build-target', 'ios']);
  const missingLabels = new Map(missing.checks.map((check) => [check.label, check]));
  assert.equal(missingLabels.get('LÖVE iOS template')?.severity, 'fail');
  assert.equal(missingLabels.get('LÖVE iOS Xcode project')?.severity, 'fail');
  assert.ok(missingLabels.get('LÖVE iOS template')?.fix.includes('feather build vendor add ios'));

  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'iOS Doctor Game',
    version: '1.0.0',
    targets: { ios: { loveIosDir: 'love-ios', bundleIdentifier: 'com.example.iosdoctor' } },
  });
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `console.log('Xcode 99.0'); process.exit(0);`);
  const configured = run(['doctor', dir, '--json', '--build-target', 'ios'], { env: envWithPath(binDir) });
  assert.equal(configured.stdout.trim().startsWith('{'), true, outputOf(configured));
  const parsed = JSON.parse(configured.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('xcodebuild')?.severity, 'pass');
  assert.equal(labels.get('LÖVE iOS template')?.severity, 'pass');
  assert.equal(labels.get('LÖVE iOS Xcode project')?.severity, 'pass');
  assert.equal(labels.get('iOS bundle id')?.severity, 'pass');
  assert.equal(labels.get('iOS signing team')?.severity, 'warn');
  if (process.platform === 'darwin') {
    assert.equal(labels.get('macOS host')?.severity, 'pass');
  } else {
    assert.equal(labels.get('macOS host')?.severity, 'fail');
    assert.equal(configured.exitCode, 1, outputOf(configured));
  }
});

test('doctor: ios release reports export options and release signing hints', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Doctor iOS Release',
    version: '1.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.doctoriosrelease',
        release: {
          exportMethod: 'app-store-connect',
          signingStyle: 'manual',
          teamId: 'TEAM12345',
        },
      },
    },
  });
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `console.log('Xcode 99.0'); process.exit(0);`);
  const result = run(['doctor', dir, '--json', '--build-target', 'ios', '--release'], { env: envWithPath(binDir) });
  assert.equal(result.stdout.trim().startsWith('{'), true, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('iOS config')?.severity, 'pass');
  assert.equal(labels.get('iOS signing team')?.severity, 'pass');
  assert.equal(labels.get('iOS export options')?.severity, 'pass');
});

test('command runtime redacts API keys from compact and debug errors', async () => {
  const { runCliAction } = await import('../dist/lib/command.js');
  const originalError = console.error;
  const previousExitCode = process.exitCode;
  const previousDebug = process.env.FEATHER_DEBUG;
  const secret = 'StrongSecretValue1234567890!';
  const lines = [];
  process.env.FEATHER_DEBUG = '1';
  process.exitCode = undefined;
  console.error = (line = '') => lines.push(String(line));
  try {
    await runCliAction(async () => {
      throw new Error(`Failed to parse config: apiKey = "${secret}"`);
    });
    const output = lines.join('\n');
    assert.equal(process.exitCode, 1);
    assert.equal(output.includes(secret), false);
    assert.ok(output.includes('apiKey = "[redacted]"'));
  } finally {
    console.error = originalError;
    process.exitCode = previousExitCode;
    if (previousDebug === undefined) delete process.env.FEATHER_DEBUG;
    else process.env.FEATHER_DEBUG = previousDebug;
  }
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

test('package remove: refuses lockfile target through symlink escaping project', () => {
  const dir = makeTmp();
  const outside = join(makeTmp(), 'outside-lib');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'helper.lua'), 'return {}\n');
  symlinkSync(outside, join(dir, 'lib'), 'dir');
  writeLock(dir, {
    helper: {
      version: 'url',
      trust: 'experimental',
      source: { url: 'https://example.com/helper.lua' },
      files: [{ name: 'helper.lua', url: 'https://example.com/helper.lua', target: 'lib/helper.lua', sha256: sha256('return {}\n') }],
    },
  });

  const result = run(['package', 'remove', 'helper', '--dir', dir, '--yes']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Refusing to remove unsafe package target: lib/helper.lua'));
  assert.equal(existsSync(join(outside, 'helper.lua')), true);
});
