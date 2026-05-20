/* eslint-disable no-undef */
import {
  ANSI_RE,
  LOCAL_SRC,
  assert,
  envWithPath,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  parseDoctorJson,
  parseDoctorJsonResult,
  run,
  symlinkSync,
  test,
  writeBuildConfig,
  writeFakeCommand,
  writeFakeDesktopRuntimeVendors,
  writeFakeDesktopTools,
  writeFakeLoveAndroid,
  writeFakeLoveIos,
  writeFakeLoveJs,
  writeFileSync,
  writeGame,
  writeLocalPluginSource,
  writeMinimalRuntime,
} from './helpers.mjs';

test('doctor --json reports unknown installed plugin trust', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeMinimalRuntime(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
  const parsed = parseDoctorJson(dir);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Plugin directory').severity, 'info');
  assert.equal(labels.get('Plugin directory').detail, 'not installed');
});

test('doctor --json treats included plugins as bundled in cli mode', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `-- mode: cli
-- installDir: feather
return {
  appId = "feather-app-test-1234567890",
  managed = "cli",
  include = { "console", "shader-graph" },
}
`,
  );

  const parsed = parseDoctorJson(dir);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Embedded Feather runtime').severity, 'info');
  assert.equal(labels.get('CLI-managed plugins').severity, 'pass');
  assert.equal(labels.get('CLI-managed plugins').detail, '2 included from bundled runtime');
  assert.equal(labels.has('Plugin console'), false);
  assert.equal(labels.has('Plugin shader-graph'), false);
});

test('doctor --json reports malformed plugin manifests with recovery text', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeMinimalRuntime(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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

test('doctor --json warns for missing Desktop App ID when insecure dev override is enabled', () => {
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
  assert.equal(labels.get('Desktop App ID')?.severity, 'warn');
  assert.equal(labels.get('Desktop App ID')?.detail, 'missing; insecure development override enabled');
  assert.equal(labels.get('__DANGEROUS_INSECURE_CONNECTION__')?.severity, 'warn');
  assert.equal(labels.get('Console API key')?.severity, 'warn');
  assert.equal(labels.get('Network host exposure')?.severity, 'warn');
});

test('doctor --json keeps missing Desktop App ID non-failing in disk mode', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { mode = "disk" }\n');

  const { result, parsed } = parseDoctorJsonResult(dir);
  assert.equal(result.exitCode, 0, outputOf(result));
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Desktop App ID')?.severity, 'pass');
  assert.equal(labels.get('Desktop App ID')?.detail, 'not needed for disk mode');
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
  assert.ok(
    parsed.checks.every((check) => ['Safety', 'Plugins', 'Packages', 'Runtime', 'Project'].includes(check.group)),
  );
  assert.equal(
    parsed.checks.some((check) => check.label === 'Node.js'),
    false,
  );
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

test('doctor: build and upload target checks report missing and configured dependencies', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
  writeBuildConfig(dir, {
    name: 'Doctor Build Game',
    version: '1.0.0',
    upload: { itch: { project: 'tester/doctor-build-game' } },
  });
  const { parsed: missing } = parseDoctorJsonResult(dir, ['--target', 'web', '--upload-target', 'itch']);
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
  const configured = run(['doctor', dir, '--json', '--target', 'web', '--upload-target', 'itch'], {
    env: envWithPath(binDir, { BUTLER_API_KEY: 'test-key' }),
  });
  assert.equal(configured.exitCode, 0, outputOf(configured));
  const parsed = JSON.parse(configured.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('love.js player')?.severity, 'pass');
  assert.equal(labels.get('butler')?.severity, 'pass');
  assert.equal(labels.get('BUTLER_API_KEY')?.severity, 'pass');
});

test('doctor: discovers upload dependency checks from feather.build.json', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
  writeBuildConfig(dir, {
    name: 'Doctor Upload Game',
    version: '1.0.0',
    upload: { itch: { project: 'tester/doctor-upload-game' } },
  });
  const { binDir } = writeFakeCommand(dir, 'butler', `console.log('butler test'); process.exit(0);`);

  const result = run(['doctor', dir, '--json'], {
    env: envWithPath(binDir, { BUTLER_API_KEY: 'test-key' }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('feather.build.json')?.severity, 'pass');
  assert.equal(labels.get('Itch project')?.severity, 'pass');
  assert.equal(labels.get('butler')?.severity, 'pass');
  assert.equal(labels.get('BUTLER_API_KEY')?.severity, 'pass');
});

test('doctor: reports optional upload readiness when build config has no upload block', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
  writeBuildConfig(dir, {
    name: 'Doctor Optional Upload Game',
    version: '1.0.0',
  });

  const result = run(['doctor', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('feather.build.json')?.severity, 'pass');
  assert.equal(labels.get('Itch project')?.severity, 'info');
  assert.equal(labels.get('butler')?.severity, labels.get('butler')?.detail === 'not found' ? 'info' : 'pass');
  assert.equal(labels.get('BUTLER_API_KEY')?.severity, process.env.BUTLER_API_KEY ? 'pass' : 'info');
});

test('doctor: desktop build targets report runtime vendors and packaging tools', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
  writeBuildConfig(dir, { name: 'Desktop Doctor Game', version: '1.0.0' });

  const { parsed: missing } = parseDoctorJsonResult(dir, ['--build-target', 'windows']);
  const missingLabels = new Map(missing.checks.map((check) => [check.label, check]));
  assert.equal(missingLabels.get('Windows LÖVE runtime')?.severity, 'fail');
  assert.ok(missingLabels.get('Windows LÖVE runtime')?.fix.includes('feather build vendor add windows'));

  const vendors = writeFakeDesktopRuntimeVendors(dir);
  writeBuildConfig(dir, {
    name: 'Desktop Doctor Game',
    version: '1.0.0',
    targets: {
      windows: { loveRuntimeDir: vendors.windows },
      macos: { loveRuntimeDir: vendors.macos },
      linux: { loveRuntimeDir: vendors.linux },
    },
  });
  const { binDir } = writeFakeDesktopTools(dir);

  for (const target of ['windows', 'macos', 'linux', 'steamos']) {
    const result = run(['doctor', dir, '--json', '--build-target', target], { env: envWithPath(binDir) });
    assert.equal(result.stdout.trim().startsWith('{'), true, outputOf(result));
    const parsed = JSON.parse(result.stdout);
    const labels = new Map(parsed.checks.map((check) => [check.label, check]));
    const runtimeLabel =
      target === 'macos'
        ? 'macOS LÖVE runtime'
        : target === 'steamos'
          ? 'SteamOS LÖVE runtime'
          : `${target[0].toUpperCase()}${target.slice(1)} LÖVE runtime`;
    assert.equal(labels.get(runtimeLabel)?.severity, 'pass');
    if (target === 'windows') assert.equal(labels.get('NSIS makensis')?.severity, 'pass');
    if (target === 'macos') assert.equal(labels.get('hdiutil')?.severity, 'pass');
    if (target === 'linux' || target === 'steamos') assert.equal(labels.get('appimagetool')?.severity, 'pass');
    if (target === 'steamos') {
      assert.ok(['pass', 'warn'].includes(labels.get('SteamOS Devkit Client')?.severity));
      assert.ok(labels.get('SteamOS Devkit Client')?.detail.includes('localhost:32010'));
    }
  }
});

test('doctor: build target all reports every platform with prefixed labels', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
  writeFakeLoveJs(dir);
  writeFakeLoveAndroid(dir);
  writeFakeLoveIos(dir);
  const vendors = writeFakeDesktopRuntimeVendors(dir);
  writeBuildConfig(dir, {
    name: 'All Platforms Doctor Game',
    version: '1.0.0',
    productId: 'com.example.allplatformsdoctor',
    targets: {
      web: { loveJsDir: 'love.js' },
      android: { loveAndroidDir: 'love-android' },
      ios: { loveIosDir: 'love-ios', bundleIdentifier: 'com.example.allplatformsdoctor.ios' },
      windows: { loveRuntimeDir: vendors.windows },
      macos: { loveRuntimeDir: vendors.macos },
      linux: { loveRuntimeDir: vendors.linux },
    },
  });
  const { binDir } = writeFakeDesktopTools(dir);
  writeFakeCommand(dir, 'java', `console.error('java version "17.0.0"'); process.exit(0);`);
  writeFakeCommand(dir, 'xcodebuild', `console.log('Xcode 99.0'); process.exit(0);`);

  const result = run(['doctor', dir, '--json', '--build-target', 'all'], {
    env: envWithPath(binDir, { ANDROID_HOME: join(dir, 'android-sdk') }),
  });
  assert.equal(result.stdout.trim().startsWith('{'), true, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Build target')?.detail, 'all');
  assert.equal(labels.get('Build target')?.fix, 'checking love, web, android, ios, windows, macos, linux, steamos');
  assert.equal(labels.get('LÖVE package')?.severity, 'pass');
  assert.equal(labels.get('Web love.js player')?.severity, 'pass');
  assert.equal(labels.get('Android config')?.severity, 'pass');
  assert.equal(labels.get('Android love-android template')?.severity, 'pass');
  assert.equal(labels.get('Android JDK')?.severity, 'pass');
  assert.equal(labels.get('Android SDK')?.severity, 'pass');
  assert.equal(labels.get('iOS config')?.severity, 'pass');
  assert.equal(labels.get('iOS LÖVE template')?.severity, 'pass');
  assert.equal(labels.get('iOS xcodebuild')?.severity, 'pass');
  assert.equal(labels.get('Windows LÖVE runtime')?.severity, 'pass');
  assert.equal(labels.get('Windows NSIS makensis')?.severity, 'pass');
  assert.equal(labels.get('macOS LÖVE runtime')?.severity, 'pass');
  assert.equal(labels.get('macOS hdiutil')?.severity, 'pass');
  assert.equal(labels.get('Linux LÖVE runtime')?.severity, 'pass');
  assert.equal(labels.get('Linux appimagetool')?.severity, 'pass');
  assert.equal(labels.get('SteamOS LÖVE runtime')?.severity, 'pass');
  assert.equal(labels.get('SteamOS appimagetool')?.severity, 'pass');
  assert.ok(['pass', 'warn'].includes(labels.get('SteamOS Devkit Client')?.severity));
});

test('doctor: invalid build target mentions doctor-only all target', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');

  const { result, parsed } = parseDoctorJsonResult(dir, ['--build-target', 'badtarget']);
  assert.equal(result.exitCode, 1);
  const labels = new Map(parsed.checks.map((check) => [check.label, check]));
  assert.equal(labels.get('Build target')?.severity, 'fail');
  assert.ok(labels.get('Build target')?.fix.includes('all'));
});

test('doctor: android build target reports template and local tool setup', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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
  writeFileSync(join(dir, 'feather.config.lua'), 'return { appId = "feather-app-test-1234567890" }\n');
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
