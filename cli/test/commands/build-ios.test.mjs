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

test('build ios: invalid bundle id fails before xcodebuild', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Bad iOS Game',
    version: '1.0.0',
    targets: { ios: { loveIosDir: 'love-ios', bundleIdentifier: 'bad id' } },
  });
  const recordPath = join(dir, 'xcodebuild-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(recordPath)}, 'ran');
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--json'], { env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }) });
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('Invalid ios build config'));
  assert.equal(existsSync(recordPath), false);
});

test('build ios: injects game.love, runs xcodebuild, copies app, and writes manifest', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'iOS Game',
    version: '5.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.iosgame',
        displayName: 'iOS Game Dev',
        scheme: 'FeatherGame',
        configuration: 'Release',
        sdk: 'iphonesimulator',
        derivedDataPath: 'builds/ios-derived-data',
        teamId: 'ABC123XYZ',
      },
    },
  });
  const recordPath = join(dir, 'xcodebuild-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
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
const project = fs.readFileSync(path.join(process.cwd(), 'platform', 'xcode', 'love.xcodeproj', 'project.pbxproj'), 'utf8');
const plist = fs.readFileSync(path.join(process.cwd(), 'platform', 'xcode', 'ios', 'love-ios.plist'), 'utf8');
const iosResources = project.match(/666666666666666666666666 \\/\\* Resources \\*\\/ = \\{[\\s\\S]*?\\n    \\};/)?.[0] || '';
const macosResources = project.match(/222222222222222222222222 \\/\\* Resources \\*\\/ = \\{[\\s\\S]*?\\n    \\};/)?.[0] || '';
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({
  argv: args,
  gameLoveExists: fs.existsSync(path.join(process.cwd(), 'platform', 'xcode', 'game.love')),
  projectContainsGameLove: project.includes('game.love'),
  iosResourcesContainGameLove: iosResources.includes('FEATHERGAMELOVE000000000001 /* game.love in Resources */'),
  macosResourcesContainGameLove: macosResources.includes('FEATHERGAMELOVE000000000001 /* game.love in Resources */'),
  plistSupportsIndirectInput: plist.includes('UIApplicationSupportsIndirectInputEvents') && plist.includes('<true/>'),
}, null, 2));
console.log('fake xcodebuild ' + args.join(' '));
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--no-cache', '--json'], { env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }) });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.target, 'ios');
  assert.equal(existsSync(join(dir, 'builds', 'ios-game-5.0.0.love')), true);
  assert.equal(existsSync(join(dir, 'builds', 'ios-game-5.0.0-ios.app')), true);
  assert.equal(existsSync(join(dir, 'builds', 'ios-game-5.0.0-ios.app', 'game.love')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(record.argv.includes('-scheme'));
  assert.ok(record.argv.includes('FeatherGame'));
  assert.ok(record.argv.includes('-configuration'));
  assert.ok(record.argv.includes('Release'));
  assert.ok(record.argv.includes('-sdk'));
  assert.ok(record.argv.includes('iphonesimulator'));
  assert.ok(record.argv.includes(join(dir, 'builds', 'ios-derived-data')));
  assert.ok(record.argv.includes('PRODUCT_BUNDLE_IDENTIFIER=com.example.iosgame'));
  assert.ok(record.argv.includes('INFOPLIST_KEY_CFBundleDisplayName=iOS Game Dev'));
  assert.ok(record.argv.includes('DEVELOPMENT_TEAM=ABC123XYZ'));
  assert.equal(record.gameLoveExists, true);
  assert.equal(record.projectContainsGameLove, true);
  assert.equal(record.iosResourcesContainGameLove, true);
  assert.equal(record.macosResourcesContainGameLove, false);
  assert.equal(record.plistSupportsIndirectInput, true);
  const entries = readStoredZipEntries(join(dir, 'builds', 'ios-game-5.0.0.love'));
  assert.equal(entries.has('main.lua'), true);
  assert.equal(entries.has('.feather-main.lua'), true);
  assert.equal(entries.has('feather/auto.lua'), true);
  assert.equal(entries.has('feather/core/debug_overlay.lua'), true);
  const manifest = JSON.parse(readFileSync(join(dir, 'builds', 'feather-build-manifest.json'), 'utf8'));
  assert.equal(manifest.target, 'ios');
  assert.equal(manifest.artifacts.some((artifact) => artifact.type === 'app'), true);
});

test('build ios: reuses dev native cache and cached DerivedData between builds', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Cached iOS',
    version: '1.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.cachedios',
      },
    },
  });
  const recordPath = join(dir, 'xcodebuild-cache-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
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
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : { records: [] };
previous.records.push({
  argv: args,
  cwd: process.cwd(),
  derivedData,
  gameLoveExists: fs.existsSync(path.join(process.cwd(), 'platform', 'xcode', 'game.love')),
});
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
process.exit(0);
`);
  const env = envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' });

  const first = run(['build', 'ios', '--dir', dir, '--json'], { env });
  assert.equal(first.exitCode, 0, outputOf(first));
  const firstParsed = JSON.parse(first.stdout);
  assert.equal(firstParsed.cache.enabled, true);
  assert.equal(firstParsed.cache.hit, false);

  const second = run(['build', 'ios', '--dir', dir, '--json'], { env });
  assert.equal(second.exitCode, 0, outputOf(second));
  const secondParsed = JSON.parse(second.stdout);
  assert.equal(secondParsed.cache.enabled, true);
  assert.equal(secondParsed.cache.hit, true);
  assert.equal(secondParsed.cache.path, firstParsed.cache.path);

  const records = JSON.parse(readFileSync(recordPath, 'utf8')).records;
  assert.equal(records.length, 2);
  assert.equal(records[0].cwd, records[1].cwd);
  assert.equal(records[0].derivedData, records[1].derivedData);
  assert.ok(records[0].cwd.includes(join('builds', '.feather-cache', 'ios')));
  assert.ok(records[0].derivedData.includes(join('builds', '.feather-cache', 'ios')));
  assert.equal(records[0].gameLoveExists, true);
  assert.equal(records[1].gameLoveExists, true);
});

test('build ios --verbose: shows native build steps and xcodebuild output', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Verbose iOS',
    version: '1.0.0',
    targets: { ios: { loveIosDir: 'love-ios', bundleIdentifier: 'com.example.verboseios' } },
  });
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
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
console.log('fake xcodebuild ' + args.join(' '));
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--verbose'], {
    env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }),
  });

  assert.equal(result.exitCode, 0, outputOf(result));
  assert.ok(result.stdout.includes('Building ios in verbose mode'));
  assert.ok(result.stdout.includes('iOS workspace'));
  assert.ok(result.stdout.includes('xcodebuild'));
  assert.ok(result.stdout.includes('fake xcodebuild'));
});

test('build ios --release: archives, exports IPA, and writes release manifest artifacts', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Release iOS',
    version: '6.0.0',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.releaseios',
        displayName: 'Release iOS',
        scheme: 'ReleaseGame',
        release: {
          archivePath: 'builds/native-release.xcarchive',
          exportPath: 'builds/native-export',
          exportMethod: 'app-store-connect',
          signingStyle: 'manual',
          provisioningProfileSpecifier: 'Release Profile',
          teamId: 'TEAM12345',
          configuration: 'Release',
          sdk: 'iphoneos',
        },
      },
    },
  });
  const recordPath = join(dir, 'xcodebuild-release-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
if (process.argv.includes('-version')) {
  console.log('Xcode 99.0');
  process.exit(0);
}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : { records: [] };
if (args.includes('archive')) {
  const archivePath = args[args.indexOf('-archivePath') + 1];
  fs.mkdirSync(archivePath, { recursive: true });
  fs.writeFileSync(path.join(archivePath, 'Info.plist'), 'fake archive');
}
if (args.includes('-exportArchive')) {
  const exportPath = args[args.indexOf('-exportPath') + 1];
  const exportOptions = args[args.indexOf('-exportOptionsPlist') + 1];
  fs.mkdirSync(exportPath, { recursive: true });
  fs.writeFileSync(path.join(exportPath, 'Release iOS.ipa'), 'fake ipa');
  previous.exportOptions = fs.readFileSync(exportOptions, 'utf8');
}
previous.records.push({ argv: args });
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--release', '--json'], {
    env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }),
  });
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.equal(ANSI_RE.test(result.stdout), false);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.cache.enabled, false);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'xcarchive'), true);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'ipa'), true);
  assert.equal(existsSync(join(dir, 'builds', 'release-ios-6.0.0-ios.xcarchive')), true);
  assert.equal(existsSync(join(dir, 'builds', 'release-ios-6.0.0-ios.ipa')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.ok(record.records[0].argv.includes('archive'));
  assert.ok(record.records[0].argv.includes('DEVELOPMENT_TEAM=TEAM12345'));
  assert.ok(record.records[1].argv.includes('-exportArchive'));
  assert.ok(record.exportOptions.includes('<string>app-store-connect</string>'));
  assert.ok(record.exportOptions.includes('<string>manual</string>'));
  assert.ok(record.exportOptions.includes('Release Profile'));
});

test('build ios --release: packages unsigned IPA from archive when no signing team is configured', () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Unsigned iOS',
    version: '1.2.3',
    targets: {
      ios: {
        loveIosDir: 'love-ios',
        bundleIdentifier: 'com.example.unsignedios',
        release: {
          archivePath: 'builds/unsigned.xcarchive',
          exportPath: 'builds/unsigned-export',
        },
      },
    },
  });
  const recordPath = join(dir, 'xcodebuild-unsigned-record.json');
  const { binDir } = writeFakeCommand(dir, 'xcodebuild', `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const previous = fs.existsSync(${JSON.stringify(recordPath)})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(recordPath)}, 'utf8'))
  : { records: [] };
if (args.includes('archive')) {
  const archivePath = args[args.indexOf('-archivePath') + 1];
  const app = path.join(archivePath, 'Products', 'Applications', 'love-ios.app');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(archivePath, 'Info.plist'), 'fake archive');
  fs.writeFileSync(path.join(app, 'Info.plist'), 'fake app');
  fs.writeFileSync(path.join(app, 'love-ios'), 'fake executable');
}
if (args.includes('-exportArchive')) {
  throw new Error('unsigned release should not call -exportArchive');
}
previous.records.push({ argv: args });
fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(previous, null, 2));
process.exit(0);
`);

  const result = run(['build', 'ios', '--dir', dir, '--release', '--json'], {
    env: envWithPath(binDir, { FEATHER_TEST_ALLOW_IOS_BUILD: '1' }),
  });

  assert.equal(result.exitCode, 0, outputOf(result));
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.artifacts.some((artifact) => artifact.type === 'ipa'), true);
  assert.equal(existsSync(join(dir, 'builds', 'unsigned-ios-1.2.3-ios.ipa')), true);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.records.length, 1);
  assert.ok(record.records[0].argv.includes('archive'));
  assert.ok(record.records[0].argv.includes('CODE_SIGNING_ALLOWED=NO'));
});

test('build ios: non-macOS hosts fail with setup guidance', { skip: process.platform === 'darwin' }, () => {
  const dir = makeTmp();
  writeGame(dir);
  writeFakeLoveIos(dir);
  writeBuildConfig(dir, {
    name: 'Non Mac iOS',
    version: '1.0.0',
    targets: { ios: { loveIosDir: 'love-ios', bundleIdentifier: 'com.example.nonmacios' } },
  });

  const result = run(['build', 'ios', '--dir', dir, '--json']);
  assert.equal(result.exitCode, 1);
  assert.ok(outputOf(result).includes('iOS builds require macOS with Xcode'));
});
