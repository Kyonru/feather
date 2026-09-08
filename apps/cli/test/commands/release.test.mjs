/* eslint-disable no-undef */
import {
  assert,
  envWithPath,
  existsSync,
  join,
  makeTmp,
  outputOf,
  readFileSync,
  run,
  test,
  writeBuildConfig,
  writeFakeCommand,
  writeFakeLoveAndroid,
  writeFileSync,
  writeGame,
  readStoredZipEntries,
} from './helpers.mjs';

function parseJson(result) {
  assert.equal(result.stdout.trim().startsWith('{'), true, outputOf(result));
  return JSON.parse(result.stdout);
}

function writeFakeFastlane(dir) {
  const recordPath = join(dir, 'fastlane-record.json');
  const { binDir } = writeFakeCommand(dir, 'fastlane', `
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('fastlane 2.220.0');
  process.exit(0);
}
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : [];
previous.push({
  argv: args,
  env: {
    FEATHER_RELEASE_TARGET: process.env.FEATHER_RELEASE_TARGET,
    FEATHER_RELEASE_LANE: process.env.FEATHER_RELEASE_LANE,
    FEATHER_ANDROID_PROJECT_DIR: process.env.FEATHER_ANDROID_PROJECT_DIR,
    FEATHER_ANDROID_AAB: process.env.FEATHER_ANDROID_AAB,
    FEATHER_ANDROID_APK: process.env.FEATHER_ANDROID_APK,
    FEATHER_ANDROID_PACKAGE_NAME: process.env.FEATHER_ANDROID_PACKAGE_NAME,
    FEATHER_ANDROID_SERVICE_ACCOUNT_JSON: process.env.FEATHER_ANDROID_SERVICE_ACCOUNT_JSON,
    FEATHER_ANDROID_TRACK: process.env.FEATHER_ANDROID_TRACK,
    FEATHER_ANDROID_RELEASE_STATUS: process.env.FEATHER_ANDROID_RELEASE_STATUS,
    FEATHER_BUILD_MANIFEST: process.env.FEATHER_BUILD_MANIFEST,
  },
  aabExists: process.env.FEATHER_ANDROID_AAB ? fs.existsSync(process.env.FEATHER_ANDROID_AAB) : false,
});
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
process.exit(0);
`);
  return { binDir, recordPath };
}

test('release init: dry-run reports standard Fastlane files without writing them', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Release Init', version: '1.0.0' });

  const result = run(['release', 'init', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = parseJson(result);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.files.some((file) => file.path.endsWith('fastlane/Fastfile') && file.action === 'create'), true);
  assert.equal(existsSync(join(dir, 'fastlane', 'Fastfile')), false);
});

test('release init: creates editable Fastlane scaffold', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Release Init', version: '1.0.0' });

  const result = run(['release', 'init', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = parseJson(result);
  assert.equal(parsed.ok, true);
  assert.equal(existsSync(join(dir, 'fastlane', 'Fastfile')), true);
  assert.equal(existsSync(join(dir, 'fastlane', 'Appfile')), true);
  assert.equal(existsSync(join(dir, 'fastlane', '.env.example')), true);
  assert.ok(readFileSync(join(dir, 'fastlane', 'Fastfile'), 'utf8').includes('upload_to_testflight'));
  assert.ok(readFileSync(join(dir, 'fastlane', 'Fastfile'), 'utf8').includes('upload_to_play_store'));
});

test('release android beta: builds Feather-free release artifacts and invokes Fastlane with env', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Release Android',
    version: '1.0.0',
    productId: 'com.example.releaseandroid',
    targets: {
      android: {
        loveAndroidDir: 'love-android',
        release: {
          fastlane: {
            packageName: 'com.example.releaseandroid',
            serviceAccountJsonEnv: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
            track: 'internal',
            releaseStatus: 'completed',
          },
        },
      },
    },
  });
  const fastlane = writeFakeFastlane(dir);
  const init = run(['release', 'init', '--dir', dir, '--json']);
  assert.equal(init.exitCode, 0, outputOf(init));

  const result = run(['release', 'android', 'beta', '--dir', dir, '--json'], {
    env: envWithPath(fastlane.binDir, { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: join(dir, 'play.json') }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = parseJson(result);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.target, 'android');
  assert.equal(parsed.lane, 'beta');
  assert.equal(parsed.command.join(' '), 'fastlane android beta');

  const record = JSON.parse(readFileSync(fastlane.recordPath, 'utf8'))[0];
  assert.deepEqual(record.argv, ['android', 'beta']);
  assert.equal(record.env.FEATHER_RELEASE_TARGET, 'android');
  assert.equal(record.env.FEATHER_RELEASE_LANE, 'beta');
  assert.equal(record.env.FEATHER_ANDROID_PACKAGE_NAME, 'com.example.releaseandroid');
  assert.equal(record.env.FEATHER_ANDROID_SERVICE_ACCOUNT_JSON, join(dir, 'play.json'));
  assert.equal(record.env.FEATHER_ANDROID_TRACK, 'internal');
  assert.equal(record.env.FEATHER_ANDROID_RELEASE_STATUS, 'completed');
  assert.equal(record.aabExists, true);

  const entries = readStoredZipEntries(join(dir, 'builds', 'release-android-1.0.0.love'));
  assert.equal(entries.has('.feather-main.lua'), false);
  assert.equal(entries.has('feather/auto.lua'), false);
  assert.equal(entries.has('feather.config.lua'), false);
});

test('release android: invalid Fastlane release config fails validation', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Bad Release Android',
    version: '1.0.0',
    productId: 'com.example.badreleaseandroid',
    targets: {
      android: {
        loveAndroidDir: 'love-android',
        release: {
          fastlane: {
            releaseStatus: 'ship-it',
            serviceAccountJsonEnv: '1_BAD',
          },
        },
      },
    },
  });
  const init = run(['release', 'init', '--dir', dir, '--json']);
  assert.equal(init.exitCode, 0, outputOf(init));
  const fastlane = writeFakeFastlane(dir);

  const result = run(['release', 'android', 'beta', '--dir', dir, '--json'], {
    env: envWithPath(fastlane.binDir),
  });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('targets.android.release.fastlane.releaseStatus'));
  assert.ok(outputOf(result).includes('targets.android.release.fastlane.serviceAccountJsonEnv'));
});

test('doctor android --release: checks Fastlane and release env when configured', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeFileSync(join(dir, 'upload.keystore'), 'fake keystore');
  writeBuildConfig(dir, {
    name: 'Doctor Fastlane Android',
    version: '1.0.0',
    productId: 'com.example.doctorfastlaneandroid',
    release: { fastlane: { path: 'fastlane' } },
    targets: {
      android: {
        loveAndroidDir: 'love-android',
        release: {
          fastlane: {
            packageName: 'com.example.doctorfastlaneandroid',
            serviceAccountJsonEnv: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
            keystorePath: 'upload.keystore',
            keyAlias: 'upload',
            storePasswordEnv: 'ANDROID_STORE_PASSWORD',
            keyPasswordEnv: 'ANDROID_KEY_PASSWORD',
          },
        },
      },
    },
  });
  const init = run(['release', 'init', '--dir', dir, '--json']);
  assert.equal(init.exitCode, 0, outputOf(init));
  const fastlane = writeFakeFastlane(dir);

  const result = run(['doctor', dir, '--target', 'android', '--release', '--json'], {
    env: envWithPath(fastlane.binDir, {
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: join(dir, 'play.json'),
      ANDROID_STORE_PASSWORD: 'store-secret',
      ANDROID_KEY_PASSWORD: 'key-secret',
    }),
  });
  assert.equal(result.stdout.trim().startsWith('{'), true, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  const byLabel = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(byLabel.get('Fastlane directory')?.severity, 'pass');
  assert.equal(byLabel.get('Fastlane')?.severity, 'pass');
  assert.equal(byLabel.get('Google Play service account')?.severity, 'pass');
  assert.equal(byLabel.get('Android Fastlane signing env')?.severity, 'pass');
});
