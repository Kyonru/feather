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

test('build web: creates love archive, love.js html package, zip, and manifest', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
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
  assert.equal(index.includes('href="/play/"'), false);
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
  const { validateAndroidBuildConfig, validateIosBuildConfig } = await import('../../dist/lib/build/validation.js');
  const { resolveWorkspacePath } = await import('../../dist/lib/build/native.js');
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

test('build mobile: missing native template paths fail with actionable errors', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, {
    name: 'Missing Mobile Template',
    version: '1.0.0',
    productId: 'com.example.missingmobiletemplate',
  });

  const android = run(['build', 'android', '--dir', dir, '--allow-unsafe', '--json']);
  assert.equal(android.exitCode, 1);
  assert.ok(outputOf(android).includes('targets.android.loveAndroidDir'));

  const ios = run(['build', 'ios', '--dir', dir, '--allow-unsafe', '--json'], { env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', FEATHER_TEST_ALLOW_IOS_BUILD: '1' } });
  assert.equal(ios.exitCode, 1);
  assert.ok(outputOf(ios).includes('targets.ios.loveIosDir'));
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
