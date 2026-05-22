/* eslint-disable no-undef */
import {
  ANSI_RE,
  assert,
  existsSync,
  join,
  makeTmp,
  outputOf,
  readFileSync,
  rmSync,
  run,
  test,
  writeBuildConfig,
  writeFakeLoveAndroid,
  writeFileSync,
  writeGame,
  readStoredZipEntries,
} from './helpers.mjs';

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

  const result = run(['build', 'android', '--dir', dir, '--allow-unsafe', '--json']);
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

  const result = run(['build', 'android', '--dir', dir, '--allow-unsafe', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.target, 'android');
  assert.equal(existsSync(join(dir, 'builds', 'mobile-game-1.2.3.love')), true);
  assert.equal(existsSync(join(dir, 'builds', 'mobile-game-1.2.3-android.apk')), true);
  assert.equal(
    parsed.artifacts.some((artifact) => artifact.type === 'apk'),
    true,
  );
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(record.argv, ['assembleEmbedRecordDebug']);
  assert.equal(record.embeddedLoveExists, true);
  assert.ok(record.gradle.includes('applicationId "com.example.mobilegame"'));
  assert.ok(record.gradle.includes('versionCode 7'));
  assert.ok(record.gradle.includes('versionName "1.2.3-dev"'));
  assert.ok(record.gradleProperties.includes('app.application_id=com.example.mobilegame'));
  assert.ok(record.gradleProperties.includes('app.orientation=landscape'));
  assert.ok(record.gradleProperties.includes('app.version_code=7'));
  assert.ok(record.gradleProperties.includes('app.version_name=1.2.3-dev'));
  assert.equal(record.gradleProperties.includes('app.name='), false);
  assert.ok(record.gradleProperties.includes('app.name_byte_array='));
  assert.ok(record.manifest.includes('android:label="Mobile Game Dev"'));
  assert.ok(record.manifest.includes('android:screenOrientation="landscape"'));
  assert.ok(record.manifest.includes('android.permission.RECORD_AUDIO'));
  assert.ok(record.gameActivity.includes('Feather: forcing embedded game.love from assets'));
  const manifest = JSON.parse(readFileSync(join(dir, 'builds', 'feather-build-manifest.json'), 'utf8'));
  assert.equal(manifest.target, 'android');
  assert.equal(
    manifest.artifacts.some((artifact) => artifact.type === 'apk'),
    true,
  );
});

test('build android: embeds Feather debugger runtime and raw config in dev love archive', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  sessionName = "Nested Config",
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  debugOverlay = {
    enabled = true,
    visible = false,
  },
}
`,
  );
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Embedded Android',
    version: '1.0.0',
    productId: 'com.example.embeddedandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const result = run(['build', 'android', '--dir', dir, '--allow-unsafe', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const entries = readStoredZipEntries(join(dir, 'builds', 'embedded-android-1.0.0.love'));
  assert.equal(entries.has('main.lua'), true);
  assert.equal(entries.has('.feather-main.lua'), true);
  assert.equal(entries.has('feather/auto.lua'), true);
  assert.equal(entries.has('feather/core/debug_overlay.lua'), true);
  assert.equal(entries.has('plugins/profiler/manifest.lua'), true);
  assert.match(entries.get('main.lua').toString('utf8'), /require\("feather\.auto"\)/);
  assert.match(entries.get('feather.config.lua').toString('utf8'), /debugOverlay\s*=\s*\{/);
  assert.match(entries.get('feather.config.lua').toString('utf8'), /visible\s*=\s*false/);
});

test('build android --no-debugger: builds raw source without Feather embed', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Raw Android',
    version: '1.0.0',
    productId: 'com.example.rawandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const result = run(['build', 'android', '--dir', dir, '--no-debugger', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const entries = readStoredZipEntries(join(dir, 'builds', 'raw-android-1.0.0.love'));
  assert.equal(entries.has('main.lua'), true);
  assert.equal(entries.has('.feather-main.lua'), false);
  assert.equal(entries.has('feather/auto.lua'), false);
  assert.equal(entries.has('feather.config.lua'), false);
});

test('build android --release: does not auto-embed Feather debugger runtime', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Release Raw Android',
    version: '1.0.0',
    productId: 'com.example.releaserawandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const result = run(['build', 'android', '--dir', dir, '--release', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const entries = readStoredZipEntries(join(dir, 'builds', 'release-raw-android-1.0.0.love'));
  assert.equal(entries.has('.feather-main.lua'), false);
  assert.equal(entries.has('feather/auto.lua'), false);
  assert.equal(entries.has('feather/core/debug_overlay.lua'), false);
  assert.equal(entries.has('feather.config.lua'), false);
});

test('build android --release: ignores dev Feather config when runtime is excluded', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  include = { "console" },
  debugger = { hotReload = { enabled = true, allow = { "game.*" } } },
  writeToDisk = true,
}
`,
  );
  writeBuildConfig(dir, {
    name: 'Release Dev Config Android',
    version: '1.0.0',
    productId: 'com.example.releasedevconfigandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const result = run(['build', 'android', '--dir', dir, '--release', '--no-debugger', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const entries = readStoredZipEntries(join(dir, 'builds', 'release-dev-config-android-1.0.0.love'));
  assert.equal(entries.has('.feather-main.lua'), false);
  assert.equal(entries.has('feather/auto.lua'), false);
  assert.equal(entries.has('feather.config.lua'), false);
});

test('build android --release: blocks explicit Feather runtime inclusion', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Release Runtime Android',
    version: '1.0.0',
    includeRuntime: true,
    productId: 'com.example.releaseruntimeandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const result = run(['build', 'android', '--dir', dir, '--release', '--no-debugger', '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Feather runtime is included in the build output'));
});

test('build android: reuses dev native cache between builds', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { recordPath } = writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Cached Android',
    version: '1.0.0',
    productId: 'com.example.cachedandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const first = run(['build', 'android', '--dir', dir, '--json']);
  assert.equal(first.exitCode, 0, outputOf(first));
  const firstParsed = JSON.parse(first.stdout);
  assert.equal(firstParsed.cache.enabled, true);
  assert.equal(firstParsed.cache.hit, false);
  assert.ok(firstParsed.cache.path.includes(join('builds', '.feather-cache', 'android')));
  assert.equal(existsSync(firstParsed.cache.path), true);

  const second = run(['build', 'android', '--dir', dir, '--json']);
  assert.equal(second.exitCode, 0, outputOf(second));
  const secondParsed = JSON.parse(second.stdout);
  assert.equal(secondParsed.cache.enabled, true);
  assert.equal(secondParsed.cache.hit, true);
  assert.equal(secondParsed.cache.key, firstParsed.cache.key);
  assert.equal(secondParsed.cache.path, firstParsed.cache.path);

  const records = JSON.parse(readFileSync(recordPath, 'utf8')).records;
  assert.equal(records.length, 2);
  assert.equal(records[0].cwd, records[1].cwd);
  assert.ok(records[0].cwd.includes(join('builds', '.feather-cache', 'android')));
});

test('build android --no-cache uses fresh native workspaces', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { recordPath } = writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Uncached Android',
    version: '1.0.0',
    productId: 'com.example.uncachedandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const first = run(['build', 'android', '--dir', dir, '--no-cache', '--json']);
  const second = run(['build', 'android', '--dir', dir, '--no-cache', '--json']);
  assert.equal(first.exitCode, 0, outputOf(first));
  assert.equal(second.exitCode, 0, outputOf(second));
  assert.equal(JSON.parse(first.stdout).cache.enabled, false);
  assert.equal(JSON.parse(second.stdout).cache.enabled, false);
  assert.equal(existsSync(join(dir, 'builds', '.feather-cache')), false);
  const records = JSON.parse(readFileSync(recordPath, 'utf8')).records;
  assert.equal(records.length, 2);
  assert.notEqual(records[0].cwd, records[1].cwd);
  assert.equal(records[0].cwd.includes('.feather-cache'), false);
  assert.equal(records[1].cwd.includes('.feather-cache'), false);
});

test('build android: stale native cache missing Gradle wrapper is recopied', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { recordPath } = writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Stale Cached Android',
    version: '1.0.0',
    productId: 'com.example.stalecachedandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const first = run(['build', 'android', '--dir', dir, '--json']);
  assert.equal(first.exitCode, 0, outputOf(first));
  const firstParsed = JSON.parse(first.stdout);
  rmSync(join(firstParsed.cache.path, 'love-android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), {
    force: true,
  });

  const second = run(['build', 'android', '--dir', dir, '--json']);
  assert.equal(second.exitCode, 0, outputOf(second));
  const secondParsed = JSON.parse(second.stdout);
  assert.equal(secondParsed.cache.enabled, true);
  assert.equal(secondParsed.cache.hit, false);
  assert.equal(secondParsed.cache.path, firstParsed.cache.path);
  assert.equal(
    existsSync(join(secondParsed.cache.path, 'love-android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')),
    true,
  );
  const records = JSON.parse(readFileSync(recordPath, 'utf8')).records;
  assert.equal(records.length, 2);
});

test('build android --clean resets dev native cache', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Clean Cached Android',
    version: '1.0.0',
    productId: 'com.example.cleancachedandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const first = run(['build', 'android', '--dir', dir, '--json']);
  const second = run(['build', 'android', '--dir', dir, '--json']);
  const cleaned = run(['build', 'android', '--dir', dir, '--clean', '--json']);
  assert.equal(first.exitCode, 0, outputOf(first));
  assert.equal(second.exitCode, 0, outputOf(second));
  assert.equal(cleaned.exitCode, 0, outputOf(cleaned));
  assert.equal(JSON.parse(first.stdout).cache.hit, false);
  assert.equal(JSON.parse(second.stdout).cache.hit, true);
  assert.equal(JSON.parse(cleaned.stdout).cache.hit, false);
});

test('build android --verbose: shows native build steps and Gradle output', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Verbose Android',
    version: '1.0.0',
    productId: 'com.example.verboseandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const result = run(['build', 'android', '--dir', dir, '--verbose']);

  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('Building android in verbose mode'));
  assert.ok(result.stdout.includes('Staged'));
  assert.ok(result.stdout.includes('Android workspace'));
  assert.ok(result.stdout.includes('assembleEmbedNoRecordDebug'));
  assert.ok(result.stdout.includes('fake gradle assembleEmbedNoRecordDebug'));
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
  assert.equal(parsed.cache.enabled, false);
  assert.equal(
    parsed.artifacts.some((artifact) => artifact.type === 'aab'),
    true,
  );
  assert.equal(
    parsed.artifacts.some((artifact) => artifact.type === 'apk'),
    true,
  );
  assert.equal(existsSync(join(dir, 'builds', 'store-android-3.0.0-android.aab')), true);
  assert.equal(existsSync(join(dir, 'builds', 'store-android-3.0.0-android.apk')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(
    record.records.map((entry) => entry.argv[0]),
    [':app:bundleStoreRelease', ':app:assembleStoreRelease'],
  );
  assert.ok(record.signingProperties.includes('keyAlias=release-key'));
  assert.ok(record.signingProperties.includes('storePassword=store-secret'));
});
