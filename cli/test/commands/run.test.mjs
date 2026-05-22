/* eslint-disable no-undef */
import {
  LOCAL_SRC,
  assert,
  delimiter,
  dirname,
  envWithPath,
  existsSync,
  join,
  makeTmp,
  mkdirSync,
  outputOf,
  readFileSync,
  resolve,
  run,
  spawnCli,
  stopChild,
  test,
  waitForOutput,
  writeBuildConfig,
  writeFakeAdb,
  writeFakeCommand,
  writeFakeDesktopRuntimeVendors,
  writeFakeDesktopTools,
  writeFakeLove,
  writeFakeLoveAndroid,
  writeFakeLoveIos,
  writeFakeLoveJs,
  writeFakeXcrun,
  writeFileSync,
  writeGame,
  readStoredZipEntries,
} from './helpers.mjs';

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
  assert.equal(record.featherAutoExists, true);
  assert.equal(existsSync(record.argv[0]), false, 'shim should be cleaned after love exits');
  assert.deepEqual(record.argv.slice(1), ['--level', '2']);
});

test('run: source checkout build exposes feather.auto without a bundled cli/lua directory', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const { fakePath, recordPath } = writeFakeLove(dir);

  const result = run(['run', '--love', fakePath, gameDir]);

  assert.equal(result.exitCode, 0, outputOf(result));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.featherAutoExists, true);
  assert.ok(
    [join(dirname(LOCAL_SRC), 'cli', 'lua'), LOCAL_SRC].some((root) =>
      record.shimMain.includes(`${root.replace(/\\/g, '/')}/?.lua`),
    ),
  );
});

test('run: accepts configPath aliases and recovers npm-stripped config path argument', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const configPath = join(gameDir, 'feather.config.lua');
  writeFileSync(configPath, 'return { sessionName = "From Config Alias" }\n');

  const alias = writeFakeLove(dir, { recordPath: join(dir, 'alias-record.json') });
  const aliasResult = run(['run', '--love', alias.fakePath, '--configPath', configPath, gameDir]);
  assert.equal(aliasResult.exitCode, 0, outputOf(aliasResult));
  const aliasRecord = JSON.parse(readFileSync(alias.recordPath, 'utf8'));
  assert.equal(aliasRecord.env.FEATHER_SESSION_NAME, 'From Config Alias');
  assert.deepEqual(aliasRecord.argv.slice(1), []);

  const stripped = writeFakeLove(dir, { recordPath: join(dir, 'stripped-record.json') });
  const strippedResult = run(['run', '--love', stripped.fakePath, gameDir, configPath]);
  assert.equal(strippedResult.exitCode, 0, outputOf(strippedResult));
  const strippedRecord = JSON.parse(readFileSync(stripped.recordPath, 'utf8'));
  assert.equal(strippedRecord.env.FEATHER_SESSION_NAME, 'From Config Alias');
  assert.deepEqual(strippedRecord.argv.slice(1), []);
});

test('run: shim preloads config before requiring feather.auto', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const configPath = join(gameDir, 'feather.config.lua');
  writeFileSync(configPath, 'return { __DANGEROUS_INSECURE_CONNECTION__ = true, sessionName = "Security Config" }\n');
  const { fakePath, recordPath } = writeFakeLove(dir);

  const result = run(['run', '--love', fakePath, gameDir, '--config', configPath]);

  assert.equal(result.exitCode, 0, outputOf(result));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(record.shimMain.includes('FEATHER_AUTO_CONFIG = {'));
  assert.ok(record.shimMain.includes('__DANGEROUS_INSECURE_CONNECTION__ = true'));
  assert.equal(record.shimMain.includes('require("feather.auto").setup'), false);
  assert.ok(record.shimMain.includes('require("feather.auto")'));
});

test('run: serializes nested plugin options for any plugin into the CLI shim', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const configPath = join(gameDir, 'feather.config.lua');
  writeFileSync(
    configPath,
    `return {
  sessionName = "Plugin Config",
  include = { "session-replay", "hot-reload", "console" },
  pluginOptions = {
    ["session-replay"] = {
      captureJoystickAxis = true,
      keyframeInterval = 2,
    },
    ["hot-reload"] = {
      enabled = true,
      allow = { "gameplay", "systems.player" },
      persistToDisk = false,
    },
    console = {
      evalEnabled = true,
    },
  },
}
`,
  );
  const { fakePath, recordPath } = writeFakeLove(dir);

  const result = run(['run', '--love', fakePath, gameDir]);

  assert.equal(result.exitCode, 0, outputOf(result));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.match(record.shimMain, /pluginOptions\s*=\s*\{/);
  assert.match(record.shimMain, /\["session-replay"\]\s*=\s*\{/);
  assert.match(record.shimMain, /captureJoystickAxis\s*=\s*true/);
  assert.match(record.shimMain, /keyframeInterval\s*=\s*2/);
  assert.match(record.shimMain, /\["hot-reload"\]\s*=\s*\{/);
  assert.match(record.shimMain, /allow\s*=\s*\{\s*"gameplay",\s*"systems\.player"\s*\}/);
  assert.match(record.shimMain, /persistToDisk\s*=\s*false/);
  assert.match(record.shimMain, /console\s*=\s*\{/);
  assert.match(record.shimMain, /evalEnabled\s*=\s*true/);
});

test('run: shim auto-drives DEBUGGER update after loading the game', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const { fakePath, recordPath } = writeFakeLove(dir);

  const result = run(['run', '--love', fakePath, gameDir]);

  assert.equal(result.exitCode, 0, outputOf(result));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(record.shimMain.includes('not DEBUGGER.__cliAutoUpdateInstalled'));
  assert.ok(record.shimMain.includes('local gameUpdate = love.update'));
  assert.ok(record.shimMain.includes('gameUpdate(dt)'));
  assert.ok(record.shimMain.includes('featherUpdate(DEBUGGER, dt)'));
});

test('run: config parser ignores commented example options', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const configPath = join(gameDir, 'feather.config.lua');
  writeFileSync(configPath, `
return {
  sessionName = "Real Config",
  include = { "console" },
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  apiKey = "real-key",

  -- appId = "feather-app-commented-placeholder",
  -- include = { "hot-reload" },
  -- exclude = { "hump.signal" },
  -- mode = "disk",
  -- debugger = {
  --   enabled = true,
  -- },
}
`);
  const { fakePath, recordPath } = writeFakeLove(dir);

  const result = run(['run', '--love', fakePath, gameDir, '--config', configPath]);

  assert.equal(result.exitCode, 0, outputOf(result));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.env.FEATHER_SESSION_NAME, 'Real Config');
  assert.ok(record.shimMain.includes('sessionName = "Real Config"'));
  assert.ok(record.shimMain.includes('include = { "console" }'));
  assert.equal(record.shimMain.includes('feather-app-commented-placeholder'), false);
  assert.equal(record.shimMain.includes('include = { "hot-reload" }'), false);
  assert.equal(record.shimMain.includes('mode = "disk"'), false);
});

test('run --no-debugger: launches game directly without Feather shim', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const { fakePath, recordPath } = writeFakeLove(dir);

  const result = run(['run', '--love', fakePath, '--no-debugger', gameDir, '--', '--plain']);

  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('Debugger  disabled'));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.argv[0], resolve(gameDir));
  assert.deepEqual(record.argv.slice(1), ['--plain']);
  assert.equal(record.featherAutoExists, false);
  assert.equal(record.shimMain, readFileSync(join(gameDir, 'main.lua'), 'utf8'));
});

test('run --disable-debugger: aliases debugger-disabled desktop launch', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const { fakePath, recordPath } = writeFakeLove(dir);

  const result = run(['run', '--love', fakePath, '--disable-debugger', gameDir]);

  assert.equal(result.exitCode, 0, outputOf(result));
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.argv[0], resolve(gameDir));
});

test('run --target android: builds, installs, sets adb reverse, launches, and supports device selection', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Run Android',
    version: '1.0.0',
    productId: 'com.example.runandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  writeFileSync(join(dir, 'feather.config.lua'), 'return { port = 4010 }\n');
  const { binDir, recordPath } = writeFakeAdb(dir);

  const result = run(['run', dir, '--target', 'android', '--device', 'emulator-5554'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('Launched android'));
  assert.ok(outputOf(result).includes('com.example.runandroid'));
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(
    records.map((entry) => entry.args),
    [
      ['-s', 'emulator-5554', 'version'],
      ['-s', 'emulator-5554', 'shell', 'rm', '-f', '/sdcard/Android/data/com.example.runandroid/files/game.love'],
      ['-s', 'emulator-5554', 'install', '-r', join(dir, 'builds', 'run-android-1.0.0-android.apk')],
      ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'com.example.runandroid'],
      ['-s', 'emulator-5554', 'reverse', 'tcp:4010', 'tcp:4010'],
      [
        '-s',
        'emulator-5554',
        'shell',
        'monkey',
        '-p',
        'com.example.runandroid',
        '-c',
        'android.intent.category.LAUNCHER',
        '1',
      ],
    ],
  );
  const entries = readStoredZipEntries(join(dir, 'builds', 'run-android-1.0.0.love'));
  assert.equal(entries.has('feather/auto.lua'), true);
  assert.match(entries.get('feather.config.lua').toString('utf8'), /port\s*=\s*4010/);
});

test('run --target android --config: embeds selected raw Feather config in mobile love archive', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'game');
  writeGame(gameDir);
  const configPath = join(gameDir, 'custom-feather.config.lua');
  writeFileSync(
    configPath,
    `return {
  sessionName = "Mobile Custom",
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  debugger = {
    hotReload = {
      enabled = true,
      allow = { "game.*" },
    },
  },
}
`,
  );
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Run Android Config',
    version: '1.0.0',
    productId: 'com.example.runandroidconfig',
    sourceDir: 'game',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir } = writeFakeAdb(dir);

  const result = run(['run', gameDir, '--target', 'android', '--config', configPath, '--no-adb-reverse'], {
    cwd: dir,
    env: envWithPath(binDir),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  const entries = readStoredZipEntries(join(dir, 'builds', 'run-android-config-1.0.0.love'));
  assert.equal(entries.has('main.lua'), true);
  assert.equal(entries.has('.feather-main.lua'), true);
  assert.equal(entries.has('feather/core/debug_overlay.lua'), true);
  const config = entries.get('feather.config.lua').toString('utf8');
  assert.match(config, /sessionName\s*=\s*"Mobile Custom"/);
  assert.match(config, /hotReload\s*=\s*\{/);
  assert.match(config, /allow\s*=\s*\{\s*"game\.\*"\s*\}/);
});

test('run --target android: uses root build config for a nested game path', () => {
  const dir = makeTmp();
  const gameDir = join(dir, 'src-lua', 'example', 'test_cli');
  writeGame(gameDir);
  const { recordPath: gradleRecordPath } = writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Nested Android',
    version: '1.0.0',
    productId: 'com.example.nestedandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir } = writeFakeAdb(dir);

  const result = run(['run', gameDir, '--target', 'android', '--no-adb-reverse'], {
    cwd: dir,
    env: envWithPath(binDir),
  });

  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('Launched android'));
  assert.ok(outputOf(result).includes(gameDir));
  assert.ok(existsSync(join(dir, 'builds', 'nested-android-1.0.0-android.apk')));
  const gradleRecord = JSON.parse(readFileSync(gradleRecordPath, 'utf8'));
  assert.equal(gradleRecord.embeddedLoveExists, true);
});

test('run --target android --no-adb-reverse skips reverse setup', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'No Reverse',
    version: '1.0.0',
    productId: 'com.example.noreverse',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir, recordPath } = writeFakeAdb(dir);

  const result = run(['run', dir, '--target', 'android', '--no-adb-reverse'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(
    records.some((entry) => entry.args.includes('reverse')),
    false,
  );
});

test('run --target android --no-debugger skips adb reverse setup', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'No Debugger Android',
    version: '1.0.0',
    productId: 'com.example.nodebuggerandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir, recordPath } = writeFakeAdb(dir);

  const result = run(['run', dir, '--target', 'android', '--no-debugger'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(
    records.some((entry) => entry.args.includes('reverse')),
    false,
  );
  assert.equal(outputOf(result).includes('ADB reverse  disabled'), true);
  const entries = readStoredZipEntries(join(dir, 'builds', 'no-debugger-android-1.0.0.love'));
  assert.equal(entries.has('feather/auto.lua'), false);
  assert.equal(entries.has('.feather-main.lua'), false);
});

test('run --target android --no-cache forwards cache option to mobile build', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { recordPath: gradleRecordPath } = writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Run No Cache',
    version: '1.0.0',
    productId: 'com.example.runnocache',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir } = writeFakeAdb(dir);

  const first = run(['run', dir, '--target', 'android', '--no-adb-reverse', '--no-cache'], {
    env: envWithPath(binDir),
  });
  const second = run(['run', dir, '--target', 'android', '--no-adb-reverse', '--no-cache'], {
    env: envWithPath(binDir),
  });
  assert.equal(first.exitCode, 0, outputOf(first));
  assert.equal(second.exitCode, 0, outputOf(second));
  assert.equal(existsSync(join(dir, 'builds', '.feather-cache')), false);
  const records = JSON.parse(readFileSync(gradleRecordPath, 'utf8')).records;
  assert.equal(records.length, 2);
  assert.notEqual(records[0].cwd, records[1].cwd);
});

test('run --target android: missing adb produces doctor guidance', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Missing Adb',
    version: '1.0.0',
    productId: 'com.example.missingadb',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });

  const result = run(['run', dir, '--target', 'android'], {
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      PATH: dirname(process.execPath),
    },
  });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('adb not found'));
  assert.ok(outputOf(result).includes('feather doctor --target android'));
});

test('run --target android: failed install exits with compact error', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Install Fail',
    version: '1.0.0',
    productId: 'com.example.installfail',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir } = writeFakeAdb(dir, { failInstall: true });

  const result = run(['run', dir, '--target', 'android'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Android install failed'));
  assert.ok(outputOf(result).includes('install failed'));
});

test('run --target ios: builds app, installs simulator app, and launches bundle id', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Run iOS',
    version: '1.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.runios',
        derivedDataPath: 'builds/ios-run-derived-data',
      },
    },
  });
  const recordPath = join(dir, 'xcodebuild-run-record.json');
  const { binDir } = writeFakeCommand(
    dir,
    'xcodebuild',
    `
if (process.argv.includes('-version')) {
  console.log('Xcode 99.0');
  process.exit(0);
}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const derivedData = args[args.indexOf('-derivedDataPath') + 1];
const configuration = args[args.indexOf('-configuration') + 1] || 'Release';
const sdk = args[args.indexOf('-sdk') + 1] || 'iphonesimulator';
const sdkFolder = sdk.startsWith('iphoneos') ? 'iphoneos' : 'iphonesimulator';
const app = path.join(derivedData, 'Build', 'Products', configuration + '-' + sdkFolder, 'love-ios.app');
fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(path.join(app, 'Info.plist'), 'fake app');
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ argv: args }, null, 2));
process.exit(0);
`,
  );
  const xcrun = writeFakeXcrun(dir);

  const result = run(['run', dir, '--target', 'ios', '--device', 'SIM-123'], {
    env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('Launched ios'));
  const records = JSON.parse(readFileSync(xcrun.recordPath, 'utf8'));
  assert.deepEqual(
    records.map((entry) => entry.args),
    [
      ['simctl', 'terminate', 'SIM-123', 'com.example.runios'],
      ['simctl', 'uninstall', 'SIM-123', 'com.example.runios'],
      ['simctl', 'install', 'SIM-123', join(dir, 'builds', 'run-ios-1.0.0-ios.app')],
      ['simctl', 'launch', 'SIM-123', 'com.example.runios'],
    ],
  );
  assert.equal(existsSync(join(dir, 'builds', 'run-ios-1.0.0-ios.app', 'game.love')), true);
});

test('run --target ios: missing xcrun produces doctor guidance', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Missing Xcrun',
    version: '1.0.0',
    targets: { ios: { loveIosDir: 'love-ios', bundleIdentifier: 'com.example.missingxcrun' } },
  });
  const { binDir } = writeFakeCommand(
    dir,
    'xcodebuild',
    `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const derivedData = args[args.indexOf('-derivedDataPath') + 1];
const configuration = args[args.indexOf('-configuration') + 1] || 'Release';
const sdk = args[args.indexOf('-sdk') + 1] || 'iphonesimulator';
const sdkFolder = sdk.startsWith('iphoneos') ? 'iphoneos' : 'iphonesimulator';
const app = path.join(derivedData, 'Build', 'Products', configuration + '-' + sdkFolder, 'love-ios.app');
fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(path.join(app, 'Info.plist'), 'fake app');
process.exit(0);
`,
  );

  const result = run(['run', dir, '--target', 'ios'], {
    env: envWithPath(binDir, {
      FEATHER_TEST_ALLOW_IOS_BUILD: '1',
      PATH: `${binDir}${delimiter}${dirname(process.execPath)}`,
    }),
  });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('xcrun not found'));
  assert.ok(outputOf(result).includes('feather doctor --target ios'));
});

test('run --target steamos: builds and attempts SteamOS Devkit Client notification', () => {
  const dir = makeTmp();
  writeGame(dir);
  const vendors = writeFakeDesktopRuntimeVendors(dir);
  const { binDir } = writeFakeDesktopTools(dir);
  writeBuildConfig(dir, {
    name: 'Run Steam Deck',
    version: '1.0.0',
    targets: {
      linux: { loveRuntimeDir: vendors.linux },
    },
  });

  const result = run(['run', '--target', 'steamos', dir], {
    env: envWithPath(binDir, { FEATHER_STEAMOS_DEVKIT_URL: 'http://127.0.0.1:1/post_event' }),
  });

  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(outputOf(result).includes('Built SteamOS package'));
  assert.ok(outputOf(result).includes('SteamOS Devkit notification pings local server'));
  assert.ok(outputOf(result).includes('SteamOS Devkit Client was not reachable'));
  assert.equal(existsSync(join(dir, 'builds', 'run-steam-deck-1.0.0-steamos.tar.gz')), true);
});

test('run mobile: forwarded game arguments are rejected', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['run', dir, '--target', 'android', '--', '--level', 'dev']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Mobile run does not support forwarded game arguments yet'));
});

test('run --target web: builds, embeds Feather, serves generated html, and stays running', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeFileSync(
    join(dir, 'feather.config.lua'),
    `return {
  sessionName = "Web Custom",
  __DANGEROUS_INSECURE_CONNECTION__ = true,
  debugOverlay = { visible = false },
}
`,
  );
  writeBuildConfig(dir, {
    name: 'Run Web',
    version: '1.0.0',
    targets: { web: { loveJsDir: 'love.js' } },
  });

  const child = spawnCli(
    ['run', dir, '--target', 'web', '--web-port', '0', '--config', join(dir, 'feather.config.lua')],
    {
      env: envWithPath('', { FEATHER_TEST_WEB_RUN_NO_SERVER: '1' }),
    },
  );
  try {
    const output = await waitForOutput(child, /Debugger\s+enabled/);
    assert.match(output, /Serving web build/);
    assert.match(output, /Debugger\s+enabled/);
    assert.equal(existsSync(join(dir, 'builds', 'run-web-1.0.0-html', 'index.html')), true);
    const entries = readStoredZipEntries(join(dir, 'builds', 'run-web-1.0.0.love'));
    assert.equal(entries.has('main.lua'), true);
    assert.equal(entries.has('.feather-main.lua'), true);
    assert.equal(entries.has('feather/auto.lua'), true);
    assert.equal(entries.has('feather/core/debug_overlay.lua'), true);
    assert.match(entries.get('feather.config.lua').toString('utf8'), /sessionName\s*=\s*"Web Custom"/);
    assert.match(entries.get('feather.config.lua').toString('utf8'), /debugOverlay\s*=\s*\{/);
  } finally {
    await stopChild(child);
  }
});

test('run --target web --no-debugger: builds and serves raw source', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Run Web Raw',
    version: '1.0.0',
    targets: { web: { loveJsDir: 'love.js' } },
  });

  const child = spawnCli(['run', dir, '--target', 'web', '--web-port', '0', '--no-debugger'], {
    env: envWithPath('', { FEATHER_TEST_WEB_RUN_NO_SERVER: '1' }),
  });
  try {
    const output = await waitForOutput(child, /Debugger\s+disabled/);
    assert.match(output, /Debugger\s+disabled/);
    const entries = readStoredZipEntries(join(dir, 'builds', 'run-web-raw-1.0.0.love'));
    assert.equal(entries.has('main.lua'), true);
    assert.equal(entries.has('.feather-main.lua'), false);
    assert.equal(entries.has('feather/auto.lua'), false);
  } finally {
    await stopChild(child);
  }
});

test('run --target web: rejects forwarded game arguments', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeBuildConfig(dir, {
    name: 'Run Web Args',
    version: '1.0.0',
    targets: { web: { loveJsDir: 'love.js' } },
  });

  const result = run(['run', dir, '--target', 'web', '--', '--foo']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Web run does not support forwarded game arguments yet.'));
});

test('run --target web: missing love.js config exits with web build guidance', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['run', dir, '--target', 'web']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Web build requires targets.web.loveJsDir'));
});
