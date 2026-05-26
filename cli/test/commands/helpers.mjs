/* eslint-disable no-undef */
/**
 * Focused compiled-CLI coverage for non-package commands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
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

function spawnCli(args, extra = {}) {
  const child = spawn(process.execPath, [CLI, ...args], {
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    ...extra,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  return child;
}

function waitForOutput(child, pattern, timeoutMs = 10000) {
  return new Promise((resolveWait, rejectWait) => {
    let output = '';
    const timer = setTimeout(() => {
      rejectWait(new Error(`Timed out waiting for ${pattern}. Output:\n${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      if (pattern.test(output)) {
        clearTimeout(timer);
        cleanup();
        resolveWait(output);
      }
    };
    const onExit = (code) => {
      clearTimeout(timer);
      cleanup();
      rejectWait(new Error(`Process exited with ${code} before ${pattern}. Output:\n${output}`));
    };
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
  });
}

function stopChild(child) {
  return new Promise((resolveStop) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveStop();
      return;
    }
    child.once('exit', () => resolveStop());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 2000).unref();
  });
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
    FEATHER_SHIM_PATH: process.env.FEATHER_SHIM_PATH,
    FEATHER_SESSION_NAME: process.env.FEATHER_SESSION_NAME,
  },
  shimMainExists: shimDir ? fs.existsSync(path.join(shimDir, 'main.lua')) : false,
  featherAutoExists: shimDir ? fs.existsSync(path.join(shimDir, 'feather', 'auto.lua')) : false,
  shimMain: shimDir ? fs.readFileSync(path.join(shimDir, 'main.lua'), 'utf8') : '',
}, null, 2));
process.exit(${JSON.stringify(exitCode)});
`,
  );
  chmodSync(fakePath, 0o755);
  return { fakePath, recordPath };
}

function writeFakeAdb(dir, options = {}) {
  const recordPath = options.recordPath ?? join(dir, 'adb-record.json');
  const installedPackages = options.installedPackages ?? [];
  const { binDir } = writeFakeCommand(dir, 'adb', `
const fs = require('node:fs');
const args = process.argv.slice(2);
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : [];
previous.push({ args });
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
if (${JSON.stringify(options.failInstall ?? false)} && args.includes('install')) {
  console.error('install failed');
  process.exit(42);
}
const pmListIdx = args.indexOf('pm');
if (pmListIdx !== -1 && args[pmListIdx + 1] === 'list' && args[pmListIdx + 2] === 'packages') {
  const pkg = args[pmListIdx + 3];
  if (${JSON.stringify(installedPackages)}.includes(pkg)) {
    console.log('package:' + pkg);
  }
  process.exit(0);
}
process.exit(0);
`);
  return { binDir, recordPath };
}

function writeFakeXcrun(dir) {
  const recordPath = join(dir, 'xcrun-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcrun', `
const fs = require('node:fs');
const args = process.argv.slice(2);
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : [];
previous.push({ args });
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
process.exit(0);
`);
  return { binDir, recordPath };
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
if (repo.includes('love.js')) {
  fs.writeFileSync(path.join(target, 'index.html'), '<!doctype html><script src="player.js?g=nogame.love"></script>');
  fs.writeFileSync(path.join(target, 'player.js'), 'console.log("love.js");\\n');
} else if (repo.includes('love-android')) {
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
  mkdirSync(join(root, 'love', 'src', 'main', 'java', 'org', 'love2d', 'android'), { recursive: true });
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
    join(root, 'gradle.properties'),
    `app.name_byte_array=76,195,150,86,69
app.application_id=org.love2d.android
app.orientation=landscape
app.version_code=31
app.version_name=11.5
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
  writeFileSync(
    join(root, 'love', 'src', 'main', 'java', 'org', 'love2d', 'android', 'GameActivity.java'),
    `package org.love2d.android;
import java.io.IOException;
import java.io.InputStream;
class GameActivity {
  boolean embed;
  boolean needToCopyGameInArchive;
  Object getResources() { return null; }
  Object getAssets() { return null; }
  void onCreate() {
        embed = getResources().getBoolean(R.bool.embed);
  }
}
`,
  );
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
  cwd,
  embeddedLoveExists: fs.existsSync(path.join(cwd, 'app', 'src', 'embed', 'assets', 'game.love')),
  gradle: fs.readFileSync(path.join(cwd, 'app', 'build.gradle'), 'utf8'),
  gradleProperties: fs.readFileSync(path.join(cwd, 'gradle.properties'), 'utf8'),
  manifest: fs.readFileSync(path.join(cwd, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8'),
  gameActivity: fs.existsSync(path.join(cwd, 'love', 'src', 'main', 'java', 'org', 'love2d', 'android', 'GameActivity.java'))
    ? fs.readFileSync(path.join(cwd, 'love', 'src', 'main', 'java', 'org', 'love2d', 'android', 'GameActivity.java'), 'utf8')
    : '',
  signingProperties: fs.existsSync(path.join(cwd, 'feather-signing.properties'))
    ? fs.readFileSync(path.join(cwd, 'feather-signing.properties'), 'utf8')
    : '',
};
previous.records.push(entry);
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ ...entry, records: previous.records }, null, 2));
console.log('fake gradle ' + process.argv.slice(2).join(' '));
process.exit(0);
`,
  );
  chmodSync(gradlew, 0o755);
  return { root, recordPath };
}

function writeFakeLoveIos(dir) {
  const root = join(dir, 'love-ios');
  const projectDir = join(root, 'platform', 'xcode', 'love.xcodeproj');
  const plistDir = join(root, 'platform', 'xcode', 'ios');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(plistDir, { recursive: true });
  writeFileSync(
    join(plistDir, 'love-ios.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>love</string>
	<key>CFBundleIdentifier</key>
	<string>org.love2d.love</string>
	<key>CFBundleName</key>
	<string>love</string>
	<key>CFBundleShortVersionString</key>
	<string>11.5</string>
	<key>CFBundleVersion</key>
	<string>11.5</string>
</dict>
</plist>
`,
  );
  writeFileSync(
    join(projectDir, 'project.pbxproj'),
    `// !$*UTF8*$!
{
/* Begin PBXBuildFile section */
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
/* End PBXFileReference section */
/* Begin PBXNativeTarget section */
    111111111111111111111111 /* love-macosx */ = {
        isa = PBXNativeTarget;
        buildPhases = (
            222222222222222222222222 /* Resources */,
        );
        name = "love-macosx";
    };
    333333333333333333333333 /* love-ios */ = {
        isa = PBXNativeTarget;
        buildPhases = (
            444444444444444444444444 /* Sources */,
            555555555555555555555555 /* Frameworks */,
            666666666666666666666666 /* Resources */,
        );
        name = "love-ios";
    };
/* End PBXNativeTarget section */
/* Begin PBXResourcesBuildPhase section */
    222222222222222222222222 /* Resources */ = {
        isa = PBXResourcesBuildPhase;
        files = (
        );
    };
    666666666666666666666666 /* Resources */ = {
        isa = PBXResourcesBuildPhase;
        files = (
            777777777777777777777777 /* Launch Screen.xib in Resources */,
        );
    };
/* End PBXResourcesBuildPhase section */
}
`,
  );
  return root;
}

function writeBuildConfig(dir, config) {
  writeFileSync(join(dir, 'feather.build.json'), `${JSON.stringify(config, null, 2)}\n`);
}

function readStoredZipEntries(zipPath) {
  const buffer = readFileSync(zipPath);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method !== 0) throw new Error(`Test zip reader only supports stored entries: ${name}`);
    entries.set(name, data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

function createDataDescriptorZipBuffer(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x08, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(0, 18);
    local.writeUInt32LE(0, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(0, 4);
    descriptor.writeUInt32LE(data.length, 8);
    descriptor.writeUInt32LE(data.length, 12);

    const centralEntry = Buffer.alloc(46);
    centralEntry.writeUInt32LE(0x02014b50, 0);
    centralEntry.writeUInt16LE(20, 4);
    centralEntry.writeUInt16LE(20, 6);
    centralEntry.writeUInt16LE(0x08, 8);
    centralEntry.writeUInt16LE(0, 10);
    centralEntry.writeUInt32LE(0, 12);
    centralEntry.writeUInt32LE(0, 16);
    centralEntry.writeUInt32LE(data.length, 20);
    centralEntry.writeUInt32LE(data.length, 24);
    centralEntry.writeUInt16LE(name.length, 28);
    centralEntry.writeUInt16LE(0, 30);
    centralEntry.writeUInt16LE(0, 32);
    centralEntry.writeUInt16LE(0, 34);
    centralEntry.writeUInt16LE(0, 36);
    centralEntry.writeUInt32LE(0, 38);
    centralEntry.writeUInt32LE(offset, 42);

    chunks.push(local, name, data, descriptor);
    central.push(centralEntry, name);
    offset += local.length + name.length + data.length + descriptor.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...central, end]);
}

async function writeFakeAppleLibrariesZip(dir) {
  const zipPath = join(dir, 'love-apple-libraries.zip');
  writeFileSync(zipPath, createDataDescriptorZipBuffer([
    { name: 'love-apple-dependencies/iOS/libraries/liblove-test.a', data: Buffer.from('ios lib') },
    { name: 'love-apple-dependencies/macOS/Frameworks/test.framework/test', data: Buffer.from('mac lib') },
    { name: '__MACOSX/love-apple-dependencies/iOS/libraries/._ignored', data: Buffer.from('metadata') },
  ]));
  return zipPath;
}

function writeFakeDesktopRuntimeVendors(dir) {
  const windows = join(dir, 'vendor', 'love-windows');
  mkdirSync(windows, { recursive: true });
  writeFileSync(join(windows, 'love.exe'), 'fake love exe');
  writeFileSync(join(windows, 'SDL2.dll'), 'fake dll');

  const macos = join(dir, 'vendor', 'love-macos', 'love.app', 'Contents');
  mkdirSync(join(macos, 'MacOS'), { recursive: true });
  mkdirSync(join(macos, 'Resources'), { recursive: true });
  writeFileSync(join(macos, 'Info.plist'), fakeMacosPlist());
  writeFileSync(join(macos, 'MacOS', 'love'), '#!/bin/sh\n');
  chmodSync(join(macos, 'MacOS', 'love'), 0o755);

  const linux = join(dir, 'vendor', 'love-linux');
  writeFakeLinuxRuntime(linux);

  return {
    windows: 'vendor/love-windows',
    macos: 'vendor/love-macos',
    linux: 'vendor/love-linux',
  };
}

function writeFakeLinuxRuntime(root) {
  mkdirSync(join(root, 'squashfs-root', 'bin'), { recursive: true });
  mkdirSync(join(root, 'squashfs-root', 'share', 'applications'), { recursive: true });
  writeFileSync(join(root, 'squashfs-root', 'bin', 'love'), '#!/bin/sh\n');
  chmodSync(join(root, 'squashfs-root', 'bin', 'love'), 0o755);
  writeFileSync(join(root, 'squashfs-root', 'AppRun'), '#!/bin/sh\nexec "$APPDIR/bin/love" "$@"\n');
  chmodSync(join(root, 'squashfs-root', 'AppRun'), 0o755);
  writeFileSync(join(root, 'squashfs-root', 'love.desktop'), '[Desktop Entry]\nName=LÖVE\nType=Application\nExec=love\n');
  writeFileSync(
    join(root, 'appimagetool.AppImage'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const out = process.argv[3];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, 'fake appimage');
`,
  );
  chmodSync(join(root, 'appimagetool.AppImage'), 0o755);
}

function writeFakeDesktopTools(dir) {
  const { binDir } = writeFakeCommand(dir, 'makensis', `
const fs = require('node:fs');
if (process.argv.includes('/VERSION')) {
  console.log('makensis test');
  process.exit(0);
}
const script = fs.readFileSync(process.argv[2], 'utf8');
const out = script.match(/OutFile "([^"]+)"/)?.[1];
if (!out) process.exit(2);
fs.mkdirSync(require('node:path').dirname(out), { recursive: true });
fs.writeFileSync(out, 'fake installer');
process.exit(0);
`);
  writeFakeCommand(dir, 'hdiutil', `
const fs = require('node:fs');
const path = require('node:path');
if (process.argv[2] === 'help') {
  console.log('hdiutil test');
  process.exit(0);
}
const out = process.argv[process.argv.length - 1];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, 'fake dmg');
process.exit(0);
`);
  writeFakeCommand(dir, 'plutil', `
console.log('plutil test');
process.exit(0);
`);
  writeFakeCommand(dir, 'ditto', `
const fs = require('node:fs');
const path = require('node:path');
const out = process.argv[process.argv.length - 1];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, 'fake app zip');
process.exit(0);
`);
  return { binDir };
}

function writeFakeLoveWindowsZip(dir) {
  const zipPath = join(dir, 'love-windows.zip');
  writeFileSync(zipPath, createDataDescriptorZipBuffer([
    { name: 'love-11.5-win64/love.exe', data: Buffer.from('fake love exe') },
    { name: 'love-11.5-win64/SDL2.dll', data: Buffer.from('fake dll') },
  ]));
  return zipPath;
}

function writeFakeLoveMacosZip(dir) {
  const zipPath = join(dir, 'love-macos.zip');
  writeFileSync(zipPath, createDataDescriptorZipBuffer([
    { name: 'love.app/Contents/Info.plist', data: Buffer.from(fakeMacosPlist()) },
    { name: 'love.app/Contents/MacOS/love', data: Buffer.from('#!/bin/sh\n') },
  ]));
  return zipPath;
}

function writeFakeLoveLinuxAppImage(dir) {
  const appImage = join(dir, 'love.AppImage');
  writeFileSync(
    appImage,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--appimage-extract')) {
  const root = path.join(process.cwd(), 'squashfs-root');
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'share', 'applications'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'love'), '#!/bin/sh\\n');
  fs.chmodSync(path.join(root, 'bin', 'love'), 0o755);
  fs.writeFileSync(path.join(root, 'AppRun'), '#!/bin/sh\\nexec "$APPDIR/bin/love" "$@"\\n');
  fs.chmodSync(path.join(root, 'AppRun'), 0o755);
  fs.writeFileSync(path.join(root, 'love.desktop'), '[Desktop Entry]\\nName=LÖVE\\nType=Application\\nExec=love\\n');
  process.exit(0);
}
console.log('fake love appimage');
process.exit(0);
`,
  );
  chmodSync(appImage, 0o755);
  return appImage;
}

/**
 * Creates a fake AppImage containing ELF magic (so it triggers ENOEXEC on any
 * non-native platform) with real SquashFS v4 magic bytes at a known offset.
 * Used to test the unsquashfs fallback path.
 */
function writeFakeNonNativeElfAppImage(dir) {
  const appImage = join(dir, 'love-foreign.AppImage');
  const SQFS_OFFSET = 8192; // 8 KB, 4-byte aligned (AppImages use 1024-byte alignment)

  // Minimal AArch64 ELF header — triggers ENOEXEC on x86_64 Linux and all macOS.
  // 64 bytes for the ELF ident + e_type/e_machine/e_version, rest zeroed.
  const header = Buffer.alloc(64, 0);
  header[0] = 0x7f; header[1] = 0x45; header[2] = 0x4c; header[3] = 0x46; // \x7fELF
  header[4] = 0x02; // EI_CLASS: 64-bit
  header[5] = 0x01; // EI_DATA: little-endian
  header[6] = 0x01; // EI_VERSION: 1
  header.writeUInt16LE(0x00b7, 18); // e_machine: EM_AARCH64 = 183

  const data = Buffer.alloc(SQFS_OFFSET + 8, 0);
  header.copy(data, 0);
  // SquashFS v4 magic (little-endian 0x73717368 = 'sqsh')
  data.writeUInt32LE(0x73717368, SQFS_OFFSET);

  writeFileSync(appImage, data);
  chmodSync(appImage, 0o755);
  return { appImage, sqfsOffset: SQFS_OFFSET };
}

/**
 * Creates a fake `unsquashfs` binary that parses -offset/-d args and writes
 * a minimal squashfs-root structure expected by the CLI.
 * Returns the bin directory to prepend to PATH.
 */
function writeFakeUnsquashfs(tmpDir) {
  const binDir = join(tmpDir, 'fake-unsquashfs-bin');
  mkdirSync(binDir, { recursive: true });
  const script = join(binDir, 'unsquashfs');
  writeFileSync(
    script,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
// Parse -d <dest> from args (ignore -offset, -f, etc.)
let dest = null;
for (let i = 0; i < args.length - 1; i++) {
  if (args[i] === '-d') { dest = args[i + 1]; break; }
}
if (!dest) { console.error('unsquashfs: missing -d'); process.exit(1); }
fs.mkdirSync(path.join(dest, 'bin'), { recursive: true });
fs.writeFileSync(path.join(dest, 'bin', 'love'), '#!/bin/sh\\n');
fs.chmodSync(path.join(dest, 'bin', 'love'), 0o755);
fs.writeFileSync(path.join(dest, 'AppRun'), '#!/bin/sh\\nexec "$APPDIR/bin/love" "$@"\\n');
process.exit(0);
`,
  );
  chmodSync(script, 0o755);
  return binDir;
}

function writeFakeAppImageTool(dir) {
  const appImageTool = join(dir, 'appimagetool.AppImage');
  writeFileSync(
    appImageTool,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const out = process.argv[3];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, 'fake appimage');
`,
  );
  chmodSync(appImageTool, 0o755);
  return appImageTool;
}

function fakeMacosPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>love</string>
  <key>CFBundleIdentifier</key>
  <string>org.love2d.love</string>
  <key>CFBundleName</key>
  <string>love</string>
</dict>
</plist>
`;
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

export {
  ANSI_RE,
  LOCAL_SRC,
  assert,
  chmodSync,
  delimiter,
  dirname,
  envWithPath,
  existsSync,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  parseDoctorJson,
  parseDoctorJsonResult,
  readFileSync,
  resolve,
  rmSync,
  run,
  sha256,
  spawnCli,
  stopChild,
  symlinkSync,
  test,
  waitForOutput,
  writeBuildConfig,
  writeFakeAdb,
  writeFakeAppImageTool,
  writeFakeAppleLibrariesZip,
  writeFakeCommand,
  writeFakeDesktopRuntimeVendors,
  writeFakeDesktopTools,
  writeFakeLove,
  writeFakeLoveAndroid,
  writeFakeLoveIos,
  writeFakeLoveLinuxAppImage,
  writeFakeNonNativeElfAppImage,
  writeFakeUnsquashfs,
  writeFakeLoveMacosZip,
  writeFakeLoveWindowsZip,
  writeFakeLoveJs,
  writeFakeVendorGit,
  writeFakeXcrun,
  writeFileSync,
  writeGame,
  writeLocalPluginSource,
  writeLock,
  writeMinimalRuntime,
  readStoredZipEntries,
};
