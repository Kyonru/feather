/* eslint-disable no-undef */
import {
  ANSI_RE,
  assert,
  envWithPath,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  readFileSync,
  run,
  test,
  writeBuildConfig,
  writeFakeCommand,
  writeFakeLoveJs,
  writeFileSync,
  writeGame,
} from './helpers.mjs';

function writeUnsafeUploadManifest(
  dir,
  { name = 'Unsafe Upload', project = 'tester/unsafe-upload', channel = 'html5' } = {},
) {
  const artifact = join(dir, 'builds', 'unsafe-web');
  mkdirSync(join(artifact, 'feather'), { recursive: true });
  writeFileSync(join(artifact, 'index.html'), '<!doctype html><title>Unsafe</title>');
  writeFileSync(join(artifact, 'feather', 'debugger.lua'), 'return {}\n');
  writeBuildConfig(dir, {
    name,
    version: '1.0.0',
    upload: { itch: { project, channels: { web: channel } } },
  });
  writeFileSync(
    join(dir, 'builds', 'feather-build-manifest.json'),
    `${JSON.stringify(
      {
        name,
        version: '1.0.0',
        target: 'web',
        createdAt: '2026-05-17T00:00:00.000Z',
        artifacts: [{ target: 'web', type: 'html', path: artifact }],
      },
      null,
      2,
    )}\n`,
  );
  return artifact;
}

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
  const { binDir } = writeFakeCommand(
    dir,
    'butler',
    `
if (process.argv.includes('--version')) {
  console.log('butler test');
  process.exit(0);
}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ argv: process.argv.slice(2) }, null, 2));
process.exit(0);
`,
  );

  const result = run(['upload', 'itch', 'web', '--dir', dir, '--if-changed', '--hidden', '--yes', '--json'], {
    env: envWithPath(binDir),
  });
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

test('upload itch: desktop targets prefer installer-style artifacts over .love', () => {
  const dir = makeTmp();
  writeGame(dir);
  const builds = join(dir, 'builds');
  mkdirSync(builds, { recursive: true });
  writeBuildConfig(dir, {
    name: 'Desktop Upload',
    version: '5.0.0',
    upload: {
      itch: {
        project: 'tester/desktop-upload',
        channels: { windows: 'win', macos: 'mac', linux: 'linux' },
      },
    },
  });
  const artifacts = [
    { target: 'windows', type: 'love', path: join(builds, 'desktop-upload-5.0.0.love') },
    { target: 'windows', type: 'zip', path: join(builds, 'desktop-upload-5.0.0-windows.zip') },
    { target: 'windows', type: 'installer', path: join(builds, 'desktop-upload-5.0.0-windows-installer.exe') },
    { target: 'macos', type: 'love', path: join(builds, 'desktop-upload-5.0.0.love') },
    { target: 'macos', type: 'zip', path: join(builds, 'desktop-upload-5.0.0-macos.app.zip') },
    { target: 'macos', type: 'dmg', path: join(builds, 'desktop-upload-5.0.0-macos.dmg') },
    { target: 'linux', type: 'love', path: join(builds, 'desktop-upload-5.0.0.love') },
    { target: 'linux', type: 'tar.gz', path: join(builds, 'desktop-upload-5.0.0-linux.tar.gz') },
    { target: 'linux', type: 'appimage', path: join(builds, 'desktop-upload-5.0.0-linux.AppImage') },
  ];
  for (const artifact of artifacts) writeFileSync(artifact.path, artifact.type);
  writeFileSync(
    join(builds, 'feather-build-manifest.json'),
    `${JSON.stringify(
      {
        name: 'Desktop Upload',
        version: '5.0.0',
        target: 'windows',
        createdAt: '2026-05-16T00:00:00.000Z',
        artifacts,
      },
      null,
      2,
    )}\n`,
  );

  for (const [target, expected] of [
    ['windows', 'desktop-upload-5.0.0-windows-installer.exe'],
    ['macos', 'desktop-upload-5.0.0-macos.dmg'],
    ['linux', 'desktop-upload-5.0.0-linux.AppImage'],
  ]) {
    const result = run(['upload', 'itch', target, '--dir', dir, '--dry-run', '--json']);
    assert.equal(result.exitCode, 0, outputOf(result));
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.artifact.endsWith(expected), true);
  }
});

test('upload steam: planned target fails cleanly', () => {
  const dir = makeTmp();
  writeGame(dir);
  const result = run(['upload', 'steam', '--dir', dir, '--yes', '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('planned but not supported yet'));
});

test('upload itch: non-interactive real upload requires --yes', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Confirm Upload',
    version: '1.0.0',
    targets: { web: { loveJsDir: 'love.js' } },
    upload: { itch: { project: 'tester/confirm-upload', channels: { web: 'html5' } } },
  });
  const build = run(['build', 'web', '--dir', dir, '--json']);
  assert.equal(build.exitCode, 0, outputOf(build));

  const result = run(['upload', 'itch', 'web', '--dir', dir]);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('--yes'));
});

test('upload itch: --build --dry-run builds an artifact and returns upload JSON without uploading', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Build Upload',
    version: '1.0.0',
    targets: { web: { loveJsDir: 'love.js' } },
    upload: { itch: { project: 'tester/build-upload', channels: { web: 'html5' } } },
  });

  const result = run(['upload', 'itch', 'web', '--dir', dir, '--build', '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.project, 'tester/build-upload');
  assert.equal(parsed.safety.status, 'safe');
});

test('upload itch: missing project reports a clear headless error', () => {
  const dir = makeTmp();
  writeGame(dir);
  const builds = join(dir, 'builds');
  mkdirSync(builds, { recursive: true });
  const artifact = join(builds, 'game.love');
  writeFileSync(artifact, 'not-a-real-upload');
  writeBuildConfig(dir, { name: 'Missing Project', version: '1.0.0' });
  writeFileSync(
    join(builds, 'feather-build-manifest.json'),
    `${JSON.stringify(
      {
        name: 'Missing Project',
        version: '1.0.0',
        target: 'love',
        createdAt: '2026-05-17T00:00:00.000Z',
        artifacts: [{ target: 'love', type: 'love', path: artifact }],
      },
      null,
      2,
    )}\n`,
  );

  const result = run(['upload', 'itch', 'love', '--dir', dir, '--dry-run']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('upload.itch.project'));
});

test('upload itch: Feather runtime blocks headless upload unless explicitly allowed', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeUnsafeUploadManifest(dir);

  const blocked = run(['upload', 'itch', 'web', '--dir', dir, '--yes', '--json']);
  assert.equal(blocked.exitCode, 1);
  const parsed = JSON.parse(blocked.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.safety.status, 'unsafe');
  assert.ok(parsed.safety.detectedFiles.some((file) => file.startsWith('feather/')));
});

test('upload itch: uninspectable artifact blocks headless upload unless explicitly allowed', () => {
  const dir = makeTmp();
  writeGame(dir);
  const builds = join(dir, 'builds');
  mkdirSync(builds, { recursive: true });
  const artifact = join(builds, 'game.exe');
  writeFileSync(artifact, 'opaque');
  writeBuildConfig(dir, {
    name: 'Opaque Upload',
    version: '1.0.0',
    upload: { itch: { project: 'tester/opaque-upload', channels: { windows: 'windows' } } },
  });
  writeFileSync(
    join(builds, 'feather-build-manifest.json'),
    `${JSON.stringify(
      {
        name: 'Opaque Upload',
        version: '1.0.0',
        target: 'windows',
        createdAt: '2026-05-17T00:00:00.000Z',
        artifacts: [{ target: 'windows', type: 'installer', path: artifact }],
      },
      null,
      2,
    )}\n`,
  );

  const blocked = run(['upload', 'itch', 'windows', '--dir', dir, '--yes', '--json']);
  assert.equal(blocked.exitCode, 1);
  const parsed = JSON.parse(blocked.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.safety.status, 'unknown');
});

test('upload itch: unsafe override uploads and prints a large warning in text mode', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeUnsafeUploadManifest(dir, {
    name: 'Warn Upload',
    project: 'tester/warn-upload',
    channel: 'html5',
  });
  const recordPath = join(dir, 'butler-record.json');
  const { binDir } = writeFakeCommand(
    dir,
    'butler',
    `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ argv: process.argv.slice(2) }, null, 2));
process.exit(0);
`,
  );

  const result = run(['upload', 'itch', 'web', '--dir', dir, '--yes', '--allow-feather-runtime'], {
    env: envWithPath(binDir),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('UPLOAD SAFETY WARNING'));
  assert.ok(outputOf(result).includes('feather/'));
});

test('upload itch: unsafe override in json includes warning without non-json stdout', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeUnsafeUploadManifest(dir, {
    name: 'Json Warn Upload',
    project: 'tester/json-warn-upload',
    channel: 'html5',
  });
  const { binDir } = writeFakeCommand(dir, 'butler', 'process.exit(0);');

  const result = run(['upload', 'itch', 'web', '--dir', dir, '--yes', '--allow-feather-runtime', '--json'], {
    env: envWithPath(binDir),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.safety.status, 'unsafe');
  assert.ok(parsed.warning.includes('Feather runtime'));
});
