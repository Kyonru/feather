import {
  assert,
  envWithPath,
  existsSync,
  join,
  mkdirSync,
  makeTmp,
  outputOf,
  readFileSync,
  readStoredZipEntries,
  run,
  spawnCli,
  stopChild,
  test,
  waitForOutput,
  writeBuildConfig,
  writeFakeDesktopRuntimeVendors,
  writeFakeDesktopTools,
  writeFakeAdb,
  writeFakeCommand,
  writeFakeLoveAndroid,
  writeFakeLoveIos,
  writeFakeXcrun,
  writeFileSync,
  writeGame,
} from './helpers.mjs';
import { realpathSync } from 'node:fs';

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
  assert.ok(outputOf(result).includes('Watch target must be one of: desktop, android, ios, steamos'));
});

test('watch: invalid debounce value exits with error', () => {
  const dir = makeTmp();
  writeGame(dir);
  const result = run(['watch', dir, '--target', 'android', '--debounce', '-1']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Debounce must be a non-negative integer'));
});

test('watch: invalid port exits with error before starting a watcher', () => {
  const dir = makeTmp();
  writeGame(dir);
  const result = run(['watch', dir, '--port', '65536']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Port must be a number between 1 and 65535'));
});

async function waitForRecordCount(recordPath, count, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(recordPath)) {
      const records = JSON.parse(readFileSync(recordPath, 'utf8'));
      if (records.length >= count) {
        return records;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const seen = existsSync(recordPath) ? readFileSync(recordPath, 'utf8') : '<missing>';
  throw new Error(`Timed out waiting for ${count} records in ${recordPath}. Saw:\n${seen}`);
}

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
  let records;
  try {
    await waitForOutput(child, /Watching/);

    writeFileSync(join(dir, 'main.lua'), 'function love.update(dt) end\nfunction love.draw() end\n-- desktop-watch\n');

    await waitForOutput(child, /Restarted game/);
    records = await waitForRecordCount(recordPath, 2);
  } finally {
    await stopChild(child);
  }

  assert.ok(records.length >= 2, 'desktop watch should launch once and relaunch after change');
  assert.ok(records[0].argv[0].includes('feather-'), 'default desktop watch should launch the Feather shim');
  assert.equal(records[0].env.FEATHER_GAME_PATH, dir);
});

test('watch desktop forwards debugger and plugin path options into the shim', async () => {
  const dir = makeTmp();
  writeGame(dir);
  const customFeather = join(dir, 'custom-feather', 'feather');
  const customPlugins = join(dir, 'custom-plugins');
  mkdirSync(customFeather, { recursive: true });
  mkdirSync(join(customPlugins, 'sample-plugin'), { recursive: true });
  writeFileSync(join(customFeather, 'auto.lua'), '-- custom runtime\n');
  writeFileSync(join(customPlugins, 'sample-plugin', 'manifest.lua'), 'return {}\n');
  const recordPath = join(dir, 'shim-record.json');
  const { binDir, commandPath } = writeFakeCommand(
    dir,
    'love',
    `
const fs = require('node:fs');
const shim = process.argv[2];
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({
  main: fs.readFileSync(require('node:path').join(shim, 'main.lua'), 'utf8'),
  feather: fs.realpathSync(require('node:path').join(shim, 'feather')),
  plugins: fs.existsSync(require('node:path').join(shim, 'plugins'))
    ? fs.realpathSync(require('node:path').join(shim, 'plugins'))
    : null,
}));
console.log('FAKE-LOVE-STARTED');
setInterval(() => {}, 1000);
`,
  );

  const runWatch = async (extraArgs) => {
    const child = spawnCli(
      ['watch', dir, '--love', commandPath, '--feather-path', customFeather, '--plugins-dir', customPlugins, '--debounce', '100', ...extraArgs],
      { env: envWithPath(binDir) },
    );
    try {
      await waitForOutput(child, /FAKE-LOVE-STARTED/);
    } finally {
      await stopChild(child);
    }
    return JSON.parse(readFileSync(recordPath, 'utf8'));
  };

  const record = await runWatch([]);
  assert.equal(record.feather, realpathSync(customFeather));
  assert.equal(record.plugins, realpathSync(customPlugins));
  assert.ok(record.main.includes('"sample-plugin"'), '--plugins-dir supplies plugin discovery');

  const noPluginsRecord = await runWatch(['--no-plugins']);
  assert.equal(noPluginsRecord.plugins, null);
  assert.equal(noPluginsRecord.main.includes('FEATHER_PLUGIN_LIST'), false, '--no-plugins suppresses plugin discovery');
});

test('watch --disable-debugger launches Love directly without a shim', async () => {
  const dir = makeTmp();
  writeGame(dir);
  const recordPath = join(dir, 'direct-watch-record.json');
  const { binDir, commandPath } = writeFakeCommand(
    dir,
    'love',
    `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ argv: process.argv.slice(2) }));
console.log('FAKE-LOVE-STARTED');
setInterval(() => {}, 1000);
`,
  );
  const child = spawnCli(
    ['watch', dir, '--love', commandPath, '--disable-debugger', '--debounce', '100'],
    { env: envWithPath(binDir) },
  );
  try {
    await waitForOutput(child, /FAKE-LOVE-STARTED/);
  } finally {
    await stopChild(child);
  }
  assert.deepEqual(JSON.parse(readFileSync(recordPath, 'utf8')).argv, [dir]);
});

test('watch --target steamos: builds SteamOS package and attempts Devkit notification', async () => {
  const dir = makeTmp();
  writeGame(dir);
  const vendors = writeFakeDesktopRuntimeVendors(dir);
  const { binDir } = writeFakeDesktopTools(dir);
  writeBuildConfig(dir, {
    name: 'Steam Deck Watch',
    version: '1.0.0',
    targets: {
      linux: { loveRuntimeDir: vendors.linux },
    },
  });

  const child = spawnCli(
    ['watch', dir, '--target', 'steamos', '--debounce', '100'],
    { env: envWithPath(binDir) },
  );
  try {
    await waitForOutput(child, /Built SteamOS package/);
  } finally {
    await stopChild(child);
  }

  assert.equal(existsSync(join(dir, 'builds', 'steam-deck-watch-1.0.0-steamos.tar.gz')), true);
});

test('watch steamos notification posts SteamOS Devkit payload', async () => {
  const { notifySteamosDevkitBuild, steamosDevkitBuildName } = await import('../../dist/lib/run/watch.js');
  const calls = [];
  const ok = await notifySteamosDevkitBuild('Steam-Deck-Watch', 'http://devkit.test/post_event', async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  });

  assert.equal(ok, true);
  assert.equal(steamosDevkitBuildName('Steam Deck Watch'), 'Steam-Deck-Watch');
  assert.equal(calls[0].url, 'http://devkit.test/post_event');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    type: 'build',
    status: 'success',
    name: 'Steam-Deck-Watch',
  });
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

test('watch android honors build config, output directory, and verbose build output', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveAndroid(dir);
  const configPath = join(dir, 'watch-build.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      name: 'Custom Watch',
      version: '1.0.0',
      productId: 'com.example.customwatch',
      targets: { android: { loveAndroidDir: 'love-android' } },
    }),
  );
  const { binDir } = writeFakeAdb(dir);
  const outDir = 'builds/custom-watch';
  const runtimeConfigPath = join(dir, 'watch-runtime-config.lua');
  writeFileSync(runtimeConfigPath, 'return { sessionName = "Watch Runtime Config" }\n');
  const child = spawnCli(
    [
      'watch', dir, '--target', 'android', '--build-config', configPath, '--out-dir', outDir,
      '--runtime-config', runtimeConfigPath, '--verbose', '--no-adb-reverse', '--debounce', '100',
    ],
    { env: envWithPath(binDir) },
  );
  try {
    await waitForOutput(child, /Watching/);
  } finally {
    await stopChild(child);
  }

  assert.equal(existsSync(join(dir, outDir, 'custom-watch-1.0.0-android.apk')), true);
  const archive = readStoredZipEntries(join(dir, outDir, 'custom-watch-1.0.0.love'));
  assert.match(archive.get('feather.config.lua').toString('utf8'), /sessionName\s*=\s*"Watch Runtime Config"/);
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
