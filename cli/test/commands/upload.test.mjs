/* eslint-disable no-undef */
import {
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
  writeFakeAppleLibrariesZip,
  writeFakeCommand,
  writeFakeLove,
  writeFakeLoveAndroid,
  writeFakeLoveIos,
  writeFakeLoveJs,
  writeFakeVendorGit,
  writeFakeXcrun,
  writeFileSync,
  writeGame,
  writeLocalPluginSource,
  writeLock,
  writeMinimalRuntime,
  readStoredZipEntries,
} from './helpers.mjs';

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
  writeFileSync(join(builds, 'feather-build-manifest.json'), `${JSON.stringify({
    name: 'Desktop Upload',
    version: '5.0.0',
    target: 'windows',
    createdAt: '2026-05-16T00:00:00.000Z',
    artifacts,
  }, null, 2)}\n`);

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
  const result = run(['upload', 'steam', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('planned but not supported yet'));
});
