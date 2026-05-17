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
  spawnCli,
  stopChild,
  test,
  waitForOutput,
  writeBuildConfig,
  writeFakeAdb,
  writeFakeCommand,
  writeFakeLoveAndroid,
  writeFakeLoveIos,
  writeFakeXcrun,
  writeFileSync,
  writeGame,
} from './helpers.mjs';

test('watch: missing main.lua exits with error', () => {
  const dir = makeTmp();
  const result = run(['watch', dir, '--target', 'android', '--no-adb-reverse']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('No main.lua found in:'));
});

test('watch: invalid target exits with error', () => {
  const dir = makeTmp();
  writeGame(dir);
  const result = run(['watch', dir, '--target', 'web']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Watch target must be one of: desktop, android, ios'));
});

test('watch: invalid debounce value exits with error', () => {
  const dir = makeTmp();
  writeGame(dir);
  const result = run(['watch', dir, '--target', 'android', '--debounce', '-1']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Debounce must be a non-negative integer'));
});

test('watch: defaults to desktop target and restarts love on file change', async () => {
  const dir = makeTmp();
  writeGame(dir);
  const recordPath = join(dir, 'desktop-watch-record.json');
  const { binDir, commandPath } = writeFakeCommand(
    dir,
    'love',
    `
const fs = require('node:fs');
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : [];
previous.push({
  argv: process.argv.slice(2),
  env: {
    FEATHER_GAME_PATH: process.env.FEATHER_GAME_PATH,
    FEATHER_SESSION_NAME: process.env.FEATHER_SESSION_NAME,
  },
});
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
setInterval(() => {}, 1000);
`,
  );

  const child = spawnCli(['watch', dir, '--love', commandPath, '--debounce', '100'], { env: envWithPath(binDir) });
  try {
    await waitForOutput(child, /Watching/);

    writeFileSync(join(dir, 'main.lua'), 'function love.update(dt) end\nfunction love.draw() end\n-- desktop-watch\n');

    await waitForOutput(child, /Restarted game/);
    await new Promise((resolve) => setTimeout(resolve, 200));
  } finally {
    await stopChild(child);
  }

  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(records.length >= 2, 'desktop watch should launch once and relaunch after change');
  assert.ok(records[0].argv[0].includes('feather-'), 'default desktop watch should launch the Feather shim');
  assert.equal(records[0].env.FEATHER_GAME_PATH, dir);
});

test('watch --target android: runs initial build, starts watching, pushes game.love on file change', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Watch Android',
    version: '1.0.0',
    productId: 'com.example.watchandroid',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir, recordPath } = writeFakeAdb(dir);

  const child = spawnCli(['watch', dir, '--target', 'android', '--no-adb-reverse', '--debounce', '100'], {
    env: envWithPath(binDir),
  });
  try {
    await waitForOutput(child, /Watching/);

    // Trigger file change
    writeFileSync(join(dir, 'main.lua'), 'function love.update(dt) end\nfunction love.draw() end\n-- changed\n');

    await waitForOutput(child, /Pushed game\.love/);
  } finally {
    await stopChild(child);
  }

  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  const commands = records.map((entry) => entry.args.filter((a) => !a.startsWith('-s')));

  // Initial install sequence
  assert.ok(
    commands.some((c) => c[0] === 'install'),
    'initial APK install expected',
  );

  // Watch push sequence
  const pushIdx = commands.findIndex((c) => c[0] === 'push');
  assert.ok(pushIdx !== -1, 'adb push expected after file change');
  assert.ok(commands[pushIdx][1].endsWith('.love'), 'pushed file should be a .love archive');
  assert.ok(
    commands[pushIdx][2].includes('/sdcard/Android/data/com.example.watchandroid/files/game.love'),
    'push destination',
  );

  // Restart sequence after push
  const postPush = commands.slice(pushIdx + 1);
  assert.ok(
    postPush.some((c) => c[0] === 'shell' && c.includes('force-stop')),
    'force-stop after push',
  );
  assert.ok(
    postPush.some((c) => c[0] === 'shell' && c.includes('monkey')),
    'launch after push',
  );
});

test('watch --target android --no-restart: pushes game.love without restarting app', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Watch No Restart',
    version: '1.0.0',
    productId: 'com.example.watchnorestart',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir, recordPath } = writeFakeAdb(dir);

  const child = spawnCli(
    ['watch', dir, '--target', 'android', '--no-adb-reverse', '--no-restart', '--debounce', '100'],
    { env: envWithPath(binDir) },
  );
  try {
    await waitForOutput(child, /Watching/);

    writeFileSync(join(dir, 'main.lua'), 'function love.update(dt) end\nfunction love.draw() end\n-- no-restart\n');

    await waitForOutput(child, /Pushed game\.love/);
  } finally {
    await stopChild(child);
  }

  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  const commands = records.map((entry) => entry.args.filter((a) => !a.startsWith('-s')));

  const pushIdx = commands.findIndex((c) => c[0] === 'push');
  assert.ok(pushIdx !== -1, 'adb push expected');

  const postPush = commands.slice(pushIdx + 1);
  assert.equal(
    postPush.some((c) => c[0] === 'shell' && c.includes('force-stop')),
    false,
    'no force-stop when --no-restart',
  );
  assert.equal(
    postPush.some((c) => c[0] === 'shell' && c.includes('monkey')),
    false,
    'no launch when --no-restart',
  );
});

test('watch --target android: fast path after cache hit + app installed skips Gradle on 2nd run', async () => {
  const dir = makeTmp();
  writeGame(dir);
  const { recordPath: gradleRecordPath } = writeFakeLoveAndroid(dir);
  writeBuildConfig(dir, {
    name: 'Watch Fast Path',
    version: '1.0.0',
    productId: 'com.example.watchfastpath',
    targets: { android: { loveAndroidDir: 'love-android' } },
  });
  const { binDir, recordPath: adbRecordPath } = writeFakeAdb(dir, {
    installedPackages: ['com.example.watchfastpath'],
  });

  // First watch run: cache miss → Gradle runs → installs APK
  const firstChild = spawnCli(['watch', dir, '--target', 'android', '--no-adb-reverse', '--debounce', '100'], {
    env: envWithPath(binDir),
  });
  await waitForOutput(firstChild, /Watching/);
  await stopChild(firstChild);

  // Second watch run: cache hit + app installed → fast path (no APK, just push)
  const secondChild = spawnCli(['watch', dir, '--target', 'android', '--no-adb-reverse', '--debounce', '100'], {
    env: envWithPath(binDir),
  });
  try {
    await waitForOutput(secondChild, /Watching/);
  } finally {
    await stopChild(secondChild);
  }

  const gradleRecords = JSON.parse(readFileSync(gradleRecordPath, 'utf8')).records;
  // Gradle should only have run once (on first watch run)
  assert.equal(gradleRecords.length, 1, 'Gradle runs only on first watch (cache miss)');

  const adbRecords = JSON.parse(readFileSync(adbRecordPath, 'utf8'));
  const adbCommands = adbRecords.map((entry) => entry.args);
  // Second watch run fast path should use push instead of install
  const secondRunInstall = adbCommands.slice(5).some((c) => c.includes('install'));
  assert.equal(secondRunInstall, false, 'fast path should not install APK on second run');
  const secondRunPush = adbCommands.slice(5).some((c) => c.includes('push') && c.some((a) => a.includes('game.love')));
  assert.ok(secondRunPush, 'fast path should push game.love instead of installing APK');
});

test('watch --target ios: runs initial build, starts watching, updates app on file change', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Watch iOS',
    version: '1.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.watchio',
        derivedDataPath: 'builds/ios-watch-derived-data',
      },
    },
  });

  const { binDir: xcrunBinDir, recordPath: xcrunRecordPath } = writeFakeXcrun(dir);
  writeFakeCommand(
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
const configuration = args[args.indexOf('-configuration') + 1] || 'Debug';
const sdk = args[args.indexOf('-sdk') + 1] || 'iphonesimulator';
const sdkFolder = sdk.startsWith('iphoneos') ? 'iphoneos' : 'iphonesimulator';
const app = path.join(derivedData, 'Build', 'Products', configuration + '-' + sdkFolder, 'love-ios.app');
fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(path.join(app, 'Info.plist'), 'fake app');
process.exit(0);
`,
  );

  const child = spawnCli(['watch', dir, '--target', 'ios', '--device', 'SIM-WATCH', '--debounce', '100'], {
    env: envWithPath(xcrunBinDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }),
  });
  try {
    await waitForOutput(child, /Watching/);

    writeFileSync(join(dir, 'main.lua'), 'function love.update(dt) end\nfunction love.draw() end\n-- ios-watch\n');

    await waitForOutput(child, /Pushed game\.love/);
  } finally {
    await stopChild(child);
  }

  const xcrunRecords = JSON.parse(readFileSync(xcrunRecordPath, 'utf8'));
  const xcrunCommands = xcrunRecords.map((entry) => entry.args);

  // Watch push should relaunch the simulator app
  assert.ok(
    xcrunCommands.some((c) => c[0] === 'simctl' && c[1] === 'launch' && c[2] === 'SIM-WATCH'),
    'simctl launch after watch push',
  );

  // game.love should be inside the .app
  const appPath = join(dir, 'builds', 'watch-ios-1.0.0-ios.app');
  assert.ok(existsSync(join(appPath, 'game.love')), 'game.love pushed into .app');
});
