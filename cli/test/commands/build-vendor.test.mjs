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
  writeFakeAppImageTool,
  writeFakeCommand,
  writeFakeDesktopRuntimeVendors,
  writeFakeLoveLinuxAppImage,
  writeFakeLoveMacosZip,
  writeFakeLoveWindowsZip,
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

test('build vendor add android --json: clones vendor and updates config', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Vendor Android', version: '1.0.0', loveVersion: '11.5' });
  const { binDir, recordPath } = writeFakeVendorGit(dir);

  const result = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--json'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].target, 'android');
  assert.equal(parsed.vendors[0].relativePath, 'vendor/love-android');
  assert.equal(parsed.vendors[0].configUpdated, true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-android', 'gradlew')), true);
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.android.loveAndroidDir, 'vendor/love-android');
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(records.some((record) => record.args.includes('--recurse-submodules')));
  assert.ok(
    records.some((record) =>
      record.args.some((arg) => {
        try {
          const url = new URL(arg);
          return (
            url.hostname === 'github.com' &&
            /^\/love2d\/love-android(?:\.git)?\/?$/.test(url.pathname)
          );
        } catch {
          return false;
        }
      }),
    ),
  );
});

test('build vendor add web --json: clones love.js vendor and updates config', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Vendor Web', version: '1.0.0', loveVersion: '11.5' });
  const { binDir, recordPath } = writeFakeVendorGit(dir);

  const result = run(['build', 'vendor', 'add', 'web', '--dir', dir, '--json'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].target, 'web');
  assert.equal(parsed.vendors[0].relativePath, 'vendor/love.js');
  assert.equal(parsed.vendors[0].ref, 'main');
  assert.equal(parsed.vendors[0].configUpdated, true);
  assert.equal(existsSync(join(dir, 'vendor', 'love.js', 'index.html')), true);
  assert.equal(existsSync(join(dir, 'vendor', 'love.js', 'player.js')), true);
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.web.loveJsDir, 'vendor/love.js');
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(records.some((record) => record.args.includes('https://github.com/2dengine/love.js')));
});

test('build vendor add ios --json: clones vendor, installs Apple libraries, and updates config', async () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Vendor iOS', version: '1.0.0', loveVersion: '11.5' });
  const { binDir, recordPath } = writeFakeVendorGit(dir);
  const zipPath = await writeFakeAppleLibrariesZip(dir);

  const result = run(['build', 'vendor', 'add', 'ios', '--dir', dir, '--json'], {
    env: envWithPath(binDir, { FEATHER_TEST_LOVE_APPLE_LIBRARIES_ZIP: zipPath }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].target, 'ios');
  assert.equal(parsed.vendors[0].relativePath, 'vendor/love-ios');
  assert.equal(existsSync(join(dir, 'vendor', 'love-ios', 'platform', 'xcode', 'ios', 'libraries', 'liblove-test.a')), true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-ios', 'platform', 'xcode', 'macosx', 'Frameworks', 'test.framework', 'test')), true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-ios', 'platform', 'xcode', 'ios', 'libraries', '._ignored')), false);
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.ios.loveIosDir, 'vendor/love-ios');
  const records = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(
    records.some((record) =>
      record.args.some((arg) => {
        try {
          const url = new URL(arg);
          return (
            url.protocol === 'https:' &&
            url.hostname === 'github.com' &&
            (url.pathname === '/love2d/love' || url.pathname === '/love2d/love.git' || url.pathname === '/love2d/love/')
          );
        } catch {
          return false;
        }
      })
    )
  );
});

test('build vendor add mobile --dry-run --json: reports planned vendors without writing', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['build', 'vendor', 'add', 'mobile', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.vendors.map((vendor) => vendor.target), ['android', 'ios']);
  assert.equal(existsSync(join(dir, 'vendor')), false);
  assert.equal(existsSync(join(dir, 'feather.build.json')), false);
});

test('build vendor add --dry-run --json: defaults to mobile vendors', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['build', 'vendor', 'add', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.vendors.map((vendor) => vendor.target), ['android', 'ios']);
});

test('build vendor add desktop --dry-run --json: includes desktop runtime vendors', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['build', 'vendor', 'add', 'desktop', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.vendors.map((vendor) => vendor.target), ['windows', 'macos', 'linux']);
  assert.equal(existsSync(join(dir, 'vendor')), false);
});

test('build vendor add all --dry-run --json: includes web, mobile, and desktop vendors', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['build', 'vendor', 'add', 'all', '--dir', dir, '--dry-run', '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.vendors.map((vendor) => vendor.target), ['android', 'ios', 'web', 'windows', 'macos', 'linux']);
  assert.equal(existsSync(join(dir, 'vendor')), false);
});

test('build vendor add desktop --json: installs runtime archives and updates config', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeBuildConfig(dir, { name: 'Vendor Desktop', version: '1.0.0', loveVersion: '11.5' });
  const windowsZip = writeFakeLoveWindowsZip(dir);
  const macosZip = writeFakeLoveMacosZip(dir);
  const linuxAppImage = writeFakeLoveLinuxAppImage(dir);
  const appImageTool = writeFakeAppImageTool(dir);

  const result = run(['build', 'vendor', 'add', 'desktop', '--dir', dir, '--json'], {
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      FEATHER_TEST_LOVE_WINDOWS_ZIP: windowsZip,
      FEATHER_TEST_LOVE_MACOS_ZIP: macosZip,
      FEATHER_TEST_LOVE_LINUX_APPIMAGE: linuxAppImage,
      FEATHER_TEST_APPIMAGETOOL: appImageTool,
    },
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.vendors.map((vendor) => vendor.target), ['windows', 'macos', 'linux']);
  assert.equal(existsSync(join(dir, 'vendor', 'love-windows', 'love.exe')), true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-macos', 'love.app', 'Contents', 'Info.plist')), true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-linux', 'squashfs-root', 'bin', 'love')), true);
  assert.equal(existsSync(join(dir, 'vendor', 'love-linux', 'appimagetool.AppImage')), true);
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.windows.loveRuntimeDir, 'vendor/love-windows');
  assert.equal(config.targets.macos.loveRuntimeDir, 'vendor/love-macos');
  assert.equal(config.targets.linux.loveRuntimeDir, 'vendor/love-linux');
});

test('build vendor add steamos --json: reuses configured Linux runtime vendor', () => {
  const dir = makeTmp();
  writeGame(dir);
  const vendors = writeFakeDesktopRuntimeVendors(dir);
  writeBuildConfig(dir, {
    name: 'Vendor SteamOS',
    version: '1.0.0',
    targets: { linux: { loveRuntimeDir: vendors.linux } },
  });

  const result = run(['build', 'vendor', 'add', 'steamos', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].target, 'steamos');
  assert.equal(parsed.vendors[0].skipped, true);
  assert.equal(parsed.vendors[0].installed, false);
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.steamos.loveRuntimeDir, 'vendor/love-linux');
});

test('build vendor add --no-config: fetches vendor without writing build config', () => {
  const dir = makeTmp();
  writeGame(dir);
  const { binDir } = writeFakeVendorGit(dir);

  const result = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--no-config', '--json'], { env: envWithPath(binDir) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(existsSync(join(dir, 'vendor', 'love-android', 'gradlew')), true);
  assert.equal(existsSync(join(dir, 'feather.build.json')), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.vendors[0].configUpdated, false);
});

test('build vendor add: existing directories and conflicting config require --force', () => {
  const dir = makeTmp();
  writeGame(dir);
  mkdirSync(join(dir, 'vendor', 'love-android'), { recursive: true });

  const existing = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--json']);
  assert.equal(existing.exitCode, 1);
  assert.ok(outputOf(existing).includes('--force'));

  writeBuildConfig(dir, { targets: { android: { loveAndroidDir: 'native/love-android' } } });
  const conflict = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--dry-run', '--json']);
  assert.equal(conflict.exitCode, 1);
  assert.ok(outputOf(conflict).includes('already configured'));

  const { binDir } = writeFakeVendorGit(dir);
  const forced = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--force', '--json'], { env: envWithPath(binDir) });
  assert.equal(forced.exitCode, 0, outputOf(forced));
  const config = JSON.parse(readFileSync(join(dir, 'feather.build.json'), 'utf8'));
  assert.equal(config.targets.android.loveAndroidDir, 'vendor/love-android');
});

test('build vendor list --json: reports configured, missing, and valid vendors', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveJs(dir);
  writeFakeLoveAndroid(dir);
  const vendors = writeFakeDesktopRuntimeVendors(dir);
  writeBuildConfig(dir, {
    targets: {
      web: { loveJsDir: 'love.js' },
      android: { loveAndroidDir: 'love-android' },
      ios: { loveIosDir: 'vendor/love-ios' },
      windows: { loveRuntimeDir: vendors.windows },
      macos: { loveRuntimeDir: vendors.macos },
      linux: { loveRuntimeDir: vendors.linux },
    },
  });

  const result = run(['build', 'vendor', 'list', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  const labels = new Map(parsed.vendors.map((vendor) => [vendor.target, vendor]));
  assert.equal(labels.get('web').valid, true);
  assert.equal(labels.get('android').valid, true);
  assert.equal(labels.get('ios').exists, false);
  assert.equal(labels.get('ios').detail, 'missing');
  assert.equal(labels.get('windows').valid, true);
  assert.equal(labels.get('macos').valid, true);
  assert.equal(labels.get('linux').valid, true);
  assert.equal(labels.get('steamos').valid, true);
});

test('build vendor add: missing git produces compact actionable error', () => {
  const dir = makeTmp();
  writeGame(dir);

  const result = run(['build', 'vendor', 'add', 'android', '--dir', dir, '--json'], {
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', PATH: '' },
  });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('git is required'));
});
