import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { writeZip, type ZipEntry } from './archive.js';
import { artifactBaseName, copyDirectory, writeLoveArchive, type BuildArtifact } from './files.js';
import type { ResolvedBuildConfig } from './config.js';
import {
  createNativeWorkspace,
  findFirstPath,
  logNativeCommand,
  logNativeOutput,
  logNativeStep,
  type NativeCacheInfo,
  type NativeBuildLogger,
} from './native.js';
import { iosBundleIdentifier } from './validation.js';

const XCODEBUILD_MAX_BUFFER = 64 * 1024 * 1024;

export type IosBuildModeOptions = {
  release?: boolean;
  cache?: boolean;
  debuggerSignature?: string;
  verbose?: boolean;
  log?: NativeBuildLogger;
  onCache?: (cache: NativeCacheInfo) => void;
};

export function buildIos(config: ResolvedBuildConfig, stageDir: string, options: IosBuildModeOptions = {}): BuildArtifact[] {
  if (process.platform !== 'darwin' && process.env.FEATHER_TEST_ALLOW_IOS_BUILD !== '1') {
    throw new Error('iOS builds require macOS with Xcode. Run `feather doctor --target ios` for setup guidance.');
  }

  const iosConfig = config.targets.ios ?? {};
  const loveIosDir = iosConfig.loveIosDir ? resolve(config.projectDir, iosConfig.loveIosDir) : '';
  if (!iosConfig.loveIosDir) {
    throw new Error('iOS build requires targets.ios.loveIosDir in feather.build.json.');
  }
  if (!existsSync(loveIosDir)) {
    throw new Error(`iOS template not found at ${loveIosDir}. Run \`feather build vendor add ios --dir ${config.projectDir}\` or update targets.ios.loveIosDir in feather.build.json.`);
  }

  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  logNativeStep(options.log, `Created .love archive: ${lovePath}`);
  if (options.release || options.cache === false) {
    logNativeStep(options.log, `Build cache: ${options.release ? 'disabled for release build' : 'disabled by --no-cache'}`);
  }
  const cacheEnabled = !options.release && options.cache !== false;
  logNativeStep(options.log, `iOS template: ${loveIosDir}`);
  const sdk = iosConfig.sdk ?? 'iphonesimulator';
  const workspace = createNativeWorkspace('feather-ios-', loveIosDir, 'love-ios', {
    enabled: cacheEnabled,
    target: 'ios',
    outDir: config.outDir,
    log: options.log,
    requiredPaths: ['platform/xcode/love.xcodeproj'],
    keyParts: {
      bundleIdentifier: iosBundleIdentifier(config),
      displayName: iosConfig.displayName ?? config.name,
      scheme: iosConfig.scheme ?? 'love-ios',
      configuration: iosConfiguration(config),
      sdk,
      simulatorArch: sdk.startsWith('iphonesimulator') ? iosSimulatorArch(config) : undefined,
      deploymentTarget: iosConfig.deploymentTarget ?? '12.0',
      teamId: iosConfig.teamId,
      gameLoveResourcePatch: 4,
      debuggerSignature: options.debuggerSignature,
    },
  });
  options.onCache?.(workspace.cache);
  logNativeStep(options.log, `iOS workspace: ${workspace.dir}`);
  const derivedDataPath = cacheEnabled
    ? join(workspace.root, 'DerivedData')
    : iosConfig.derivedDataPath
      ? resolve(config.projectDir, iosConfig.derivedDataPath)
      : join(workspace.root, 'DerivedData');

  try {
    const appPath = join(config.outDir, `${base}-ios.app`);

    if (!options.release && options.cache !== false && workspace.cache.hit && existsSync(appPath)) {
      cpSync(lovePath, join(appPath, 'game.love'), { force: true });
      logNativeStep(options.log, `Cache hit: updated game.love in app`);
      maybeAdHocCodesign(appPath, options.log);
      const workspaceLove = join(workspace.dir, 'platform', 'xcode', 'game.love');
      if (existsSync(workspaceLove)) cpSync(lovePath, workspaceLove, { force: true });
      return [
        { target: 'ios', type: 'love', path: lovePath },
        { target: 'ios', type: 'app', path: appPath },
      ];
    }

    const xcodeProject = join(workspace.dir, 'platform', 'xcode', 'love.xcodeproj');
    if (!existsSync(xcodeProject)) {
      throw new Error('iOS build requires platform/xcode/love.xcodeproj in targets.ios.loveIosDir.');
    }

    const gameLovePath = join(workspace.dir, 'platform', 'xcode', 'game.love');
    mkdirSync(dirname(gameLovePath), { recursive: true });
    cpSync(lovePath, gameLovePath, { force: true });
    logNativeStep(options.log, `Embedded game.love: ${gameLovePath}`);
    patchIosPlist(join(workspace.dir, 'platform', 'xcode', 'ios', 'love-ios.plist'), config);
    logNativeStep(options.log, 'Patched iOS plist metadata');
    patchIosProject(join(xcodeProject, 'project.pbxproj'), config, base);
    logNativeStep(options.log, 'Patched Xcode project resources');

    if (options.release) {
      const releaseArtifacts = buildIosRelease(config, workspace.dir, xcodeProject, base, lovePath, options.log);
      return releaseArtifacts;
    }

    const args = xcodebuildArgs(config, xcodeProject, derivedDataPath);
    runXcodebuild(args, workspace.dir, options.log);

    const appSource = findIosAppArtifact(config, derivedDataPath);
    if (!appSource || !existsSync(appSource)) {
      throw new Error('iOS build completed but no .app artifact was found. Check targets.ios.derivedDataPath or Xcode build settings.');
    }
    copyDirectory(appSource, appPath);
    ensureLoveInAppBundle(appPath, lovePath, options.log);
    logNativeStep(options.log, `Copied app artifact: ${appPath}`);

    return [
      { target: 'ios', type: 'love', path: lovePath },
      { target: 'ios', type: 'app', path: appPath },
    ];
  } finally {
    workspace.cleanup();
  }
}

function buildIosRelease(
  config: ResolvedBuildConfig,
  workDir: string,
  xcodeProject: string,
  base: string,
  lovePath: string,
  log?: NativeBuildLogger,
): BuildArtifact[] {
  const release = config.targets.ios?.release ?? {};
  const archiveSource = release.archivePath
    ? resolve(config.projectDir, release.archivePath)
    : join(workDir, '..', `${base}.xcarchive`);
  const exportPath = release.exportPath
    ? resolve(config.projectDir, release.exportPath)
    : join(workDir, '..', 'Export');
  const exportOptionsPlist = release.exportOptionsPlist
    ? resolve(config.projectDir, release.exportOptionsPlist)
    : writeGeneratedExportOptions(config, join(workDir, '..', 'ExportOptions.plist'));

  runXcodebuild(xcodeArchiveArgs(config, xcodeProject, archiveSource), workDir, log);
  if (!existsSync(archiveSource)) {
    throw new Error('iOS archive completed but no .xcarchive was found. Check targets.ios.release.archivePath or Xcode archive settings.');
  }

  let ipaSource: string | null;
  if (shouldPackageUnsignedIpa(config)) {
    ipaSource = packageUnsignedIpaFromArchive(archiveSource, exportPath, base, log);
  } else {
    runXcodebuild(xcodeExportArchiveArgs(archiveSource, exportPath, exportOptionsPlist), workDir, log);
    ipaSource = findFirstPath(exportPath, (_path, entry) => entry.isFile() && entry.name.endsWith('.ipa'));
  }
  if (!ipaSource || !existsSync(ipaSource)) {
    throw new Error('iOS export completed but no .ipa artifact was found. Check targets.ios.release.exportPath or export options.');
  }

  const archivePath = join(config.outDir, `${base}-ios.xcarchive`);
  const ipaPath = join(config.outDir, `${base}-ios.ipa`);
  copyDirectory(archiveSource, archivePath);
  cpSync(ipaSource, ipaPath, { force: true });
  logNativeStep(log, `Copied archive artifact: ${archivePath}`);
  logNativeStep(log, `Copied IPA artifact: ${ipaPath}`);
  return [
    { target: 'ios', type: 'love', path: lovePath },
    { target: 'ios', type: 'xcarchive', path: archivePath },
    { target: 'ios', type: 'ipa', path: ipaPath },
  ];
}

function shouldPackageUnsignedIpa(config: ResolvedBuildConfig): boolean {
  const iosConfig = config.targets.ios ?? {};
  const release = iosConfig.release ?? {};
  const teamId = release.teamId ?? iosConfig.teamId;
  return !teamId && !release.exportOptionsPlist && !release.provisioningProfileSpecifier;
}

function packageUnsignedIpaFromArchive(archivePath: string, exportPath: string, base: string, log?: NativeBuildLogger): string {
  const appSource = findArchiveApp(archivePath);
  if (!appSource) {
    throw new Error('iOS archive completed but no .app was found in Products/Applications.');
  }

  const payloadRoot = mkdtempSync(join(tmpdir(), 'feather-ios-payload-'));
  const payloadDir = join(payloadRoot, 'Payload');
  const payloadApp = join(payloadDir, appSource.split('/').pop() ?? `${base}.app`);
  mkdirSync(payloadDir, { recursive: true });
  copyDirectory(appSource, payloadApp);

  const ipaPath = join(exportPath, `${base}.ipa`);
  mkdirSync(exportPath, { recursive: true });
  const ditto = spawnSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', 'Payload', ipaPath], {
    cwd: payloadRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (ditto.status === 0) {
    logNativeStep(log, `Packaged unsigned IPA: ${ipaPath}`);
    return ipaPath;
  }

  if (process.platform === 'darwin') {
    throw new Error(`Failed to package unsigned IPA with ditto: ${spawnOutput(ditto)}`);
  }

  writeZip(ipaPath, collectZipEntries(payloadRoot, 'Payload'));
  logNativeStep(log, `Packaged unsigned IPA: ${ipaPath}`);
  return ipaPath;
}

function findArchiveApp(archivePath: string): string | null {
  const applicationsDir = join(archivePath, 'Products', 'Applications');
  return findFirstPath(applicationsDir, (_path, entry) => entry.isDirectory() && entry.name.endsWith('.app'))
    ?? findFirstPath(archivePath, (_path, entry) => entry.isDirectory() && entry.name.endsWith('.app'));
}

function collectZipEntries(root: string, relativePath: string): ZipEntry[] {
  const absolute = join(root, relativePath);
  const stat = statSync(absolute);
  if (stat.isFile()) {
    return [{ name: relativePath, data: readFileSync(absolute) }];
  }
  if (!stat.isDirectory()) return [];
  return readdirSync(absolute).flatMap((name) => collectZipEntries(root, join(relativePath, name)));
}

function ensureLoveInAppBundle(appPath: string, lovePath: string, log?: NativeBuildLogger): void {
  if (!existsSync(appPath)) {
    throw new Error(`iOS app bundle not found at ${appPath}.`);
  }
  const bundledLovePath = join(appPath, 'game.love');
  if (existsSync(bundledLovePath)) {
    logNativeStep(log, `Bundled game.love in app: ${bundledLovePath}`);
    return;
  }
  cpSync(lovePath, bundledLovePath, { force: true });
  logNativeStep(log, `Bundled missing game.love in app: ${bundledLovePath}`);
  maybeAdHocCodesign(appPath, log);
}

export function maybeAdHocCodesign(appPath: string, log?: NativeBuildLogger): void {
  if (process.platform !== 'darwin') return;
  const result = spawnSync('codesign', ['--force', '--sign', '-', appPath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status === 0) {
    logNativeStep(log, `Ad-hoc signed app bundle: ${appPath}`);
    return;
  }
  logNativeStep(log, 'Ad-hoc codesign skipped; simulator installs may still work, but device installs require signing.');
}

function iosConfiguration(config: ResolvedBuildConfig): string {
  const iosConfig = config.targets.ios ?? {};
  if (iosConfig.configuration) return iosConfig.configuration;
  const sdk = iosConfig.sdk ?? 'iphonesimulator';
  return sdk.startsWith('iphonesimulator') ? 'Debug' : 'Release';
}

function iosSimulatorArch(config: ResolvedBuildConfig): string {
  const defaultArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  return config.targets.ios?.simulatorArch ?? defaultArch;
}

function iosSdkBuildFolder(sdk: string): string {
  if (sdk.startsWith('iphonesimulator')) return 'iphonesimulator';
  if (sdk.startsWith('iphoneos')) return 'iphoneos';
  return sdk;
}

function findIosAppArtifact(config: ResolvedBuildConfig, derivedDataPath: string): string | null {
  const sdk = config.targets.ios?.sdk ?? 'iphonesimulator';
  const configuration = iosConfiguration(config);
  const productsDir = join(derivedDataPath, 'Build', 'Products');
  const expectedDir = join(productsDir, `${configuration}-${iosSdkBuildFolder(sdk)}`);
  const expected = findFirstPath(expectedDir, (_path, entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  if (expected) return expected;

  const matchingConfiguration = findFirstPath(productsDir, (path, entry) => (
    entry.isDirectory()
    && entry.name.endsWith('.app')
    && path.includes(`${configuration}-`)
  ));
  if (matchingConfiguration) return matchingConfiguration;

  return findFirstPath(derivedDataPath, (_path, entry) => entry.isDirectory() && entry.name.endsWith('.app'));
}

function patchIosPlist(path: string, config: ResolvedBuildConfig): void {
  if (!existsSync(path)) return;
  if (process.platform === 'darwin') {
    patchIosPlistWithPlistBuddy(path, config);
    validateIosPlist(path);
    return;
  }

  const iosConfig = config.targets.ios ?? {};
  let source = readFileSync(path, 'utf8');
  source = upsertPlistString(source, 'CFBundleName', iosConfig.displayName ?? config.name);
  source = upsertPlistString(source, 'CFBundleDisplayName', iosConfig.displayName ?? config.name);
  source = upsertPlistString(source, 'CFBundleIdentifier', iosBundleIdentifier(config));
  source = upsertPlistString(source, 'CFBundleExecutable', artifactBaseName(config));
  source = upsertPlistString(source, 'CFBundleShortVersionString', config.version);
  source = upsertPlistString(source, 'CFBundleVersion', config.version);
  source = upsertPlistBool(source, 'ITSAppUsesNonExemptEncryption', false);
  source = upsertPlistBool(source, 'UIApplicationSupportsIndirectInputEvents', true);
  source = upsertPlistBool(source, 'UIRequiresFullScreen', true);
  source = upsertPlistBool(source, 'UIStatusBarHidden', true);
  if (config.copyright) source = upsertPlistString(source, 'NSHumanReadableCopyright', config.copyright);
  source = removePlistKey(source, 'CFBundleDocumentTypes');
  source = removePlistKey(source, 'UTExportedTypeDeclarations');
  writeFileSync(path, source);
}

function patchIosPlistWithPlistBuddy(path: string, config: ResolvedBuildConfig): void {
  const iosConfig = config.targets.ios ?? {};
  const executable = artifactBaseName(config);
  setPlistBuddyString(path, 'CFBundleName', iosConfig.displayName ?? config.name);
  setPlistBuddyString(path, 'CFBundleDisplayName', iosConfig.displayName ?? config.name);
  setPlistBuddyString(path, 'CFBundleIdentifier', iosBundleIdentifier(config));
  setPlistBuddyString(path, 'CFBundleExecutable', executable);
  setPlistBuddyString(path, 'CFBundleShortVersionString', config.version);
  setPlistBuddyString(path, 'CFBundleVersion', config.version);
  setPlistBuddyBool(path, 'ITSAppUsesNonExemptEncryption', false);
  setPlistBuddyBool(path, 'UIApplicationSupportsIndirectInputEvents', true);
  setPlistBuddyBool(path, 'UIRequiresFullScreen', true);
  setPlistBuddyBool(path, 'UIStatusBarHidden', true);
  if (config.copyright) setPlistBuddyString(path, 'NSHumanReadableCopyright', config.copyright);
  deletePlistBuddyKey(path, 'CFBundleDocumentTypes');
  deletePlistBuddyKey(path, 'UTExportedTypeDeclarations');
}

function setPlistBuddyString(path: string, key: string, value: string): void {
  setPlistBuddyValue(path, key, 'string', value);
}

function setPlistBuddyBool(path: string, key: string, value: boolean): void {
  setPlistBuddyValue(path, key, 'bool', value ? 'true' : 'false');
}

function setPlistBuddyValue(path: string, key: string, type: 'bool' | 'string', value: string): void {
  const set = runPlistBuddy(path, `Set :${key} ${value}`);
  if (set.status === 0) return;

  const add = runPlistBuddy(path, `Add :${key} ${type} ${value}`);
  if (add.status !== 0) {
    throw new Error(`Failed to update iOS plist key ${key}: ${spawnOutput(add) || spawnOutput(set)}`);
  }
}

function deletePlistBuddyKey(path: string, key: string): void {
  runPlistBuddy(path, `Delete :${key}`);
}

function runPlistBuddy(path: string, command: string): ReturnType<typeof spawnSync> {
  return spawnSync('/usr/libexec/PlistBuddy', ['-c', command, path], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function validateIosPlist(path: string): void {
  const result = spawnSync('/usr/bin/plutil', ['-lint', path], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`iOS plist validation failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`);
  }
}

function spawnOutput(result: ReturnType<typeof spawnSync>): string {
  const output = result.stderr || result.stdout || result.error?.message || '';
  return output.toString().trim();
}

function upsertPlistString(source: string, key: string, value: string): string {
  return upsertPlistValue(source, key, `<string>${escapeXml(value)}</string>`);
}

function upsertPlistBool(source: string, key: string, value: boolean): string {
  return upsertPlistValue(source, key, value ? '<true/>' : '<false/>');
}

function upsertPlistValue(source: string, key: string, valueXml: string): string {
  const pattern = new RegExp(`(\\s*<key>${escapeRegExp(key)}</key>\\s*)<[^>]+>[^<]*</[^>]+>|(\\s*<key>${escapeRegExp(key)}</key>\\s*)<(?:true|false)\\/>`);
  if (pattern.test(source)) {
    return source.replace(pattern, `$1$2${valueXml}`);
  }
  return source.replace('</dict>', `\t<key>${key}</key>\n\t${valueXml}\n</dict>`);
}

function removePlistKey(source: string, key: string): string {
  const escaped = escapeRegExp(key);
  return source.replace(new RegExp(`\\n\\t<key>${escaped}</key>[\\s\\S]*?(?=\\n\\t<key>|\\n<\\/dict>)`, 'g'), '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function xcodebuildArgs(config: ResolvedBuildConfig, xcodeProject: string, derivedDataPath: string): string[] {
  const iosConfig = config.targets.ios ?? {};
  const sdk = iosConfig.sdk ?? 'iphonesimulator';
  const args = [
    '-project',
    xcodeProject,
    '-scheme',
    iosConfig.scheme ?? 'love-ios',
    '-configuration',
    iosConfiguration(config),
    '-sdk',
    sdk,
    '-destination',
    sdk.startsWith('iphoneos') ? 'generic/platform=iOS' : 'generic/platform=iOS Simulator',
    '-derivedDataPath',
    derivedDataPath,
    `PRODUCT_BUNDLE_IDENTIFIER=${iosBundleIdentifier(config)}`,
    `INFOPLIST_KEY_CFBundleDisplayName=${iosConfig.displayName ?? config.name}`,
    'OTHER_CFLAGS=-Wno-everything',
  ];

  if (iosConfig.deploymentTarget) {
    args.push(`IPHONEOS_DEPLOYMENT_TARGET=${iosConfig.deploymentTarget}`);
  }

  if (sdk.startsWith('iphonesimulator')) {
    args.push(`ARCHS=${iosSimulatorArch(config)}`, 'ONLY_ACTIVE_ARCH=NO');
  }
  if (iosConfig.teamId) args.push(`DEVELOPMENT_TEAM=${iosConfig.teamId}`);
  if (sdk.startsWith('iphonesimulator') && !iosConfig.teamId) {
    args.push('CODE_SIGN_IDENTITY=', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGNING_ALLOWED=NO');
  }
  args.push('build');
  return args;
}

export function xcodeArchiveArgs(config: ResolvedBuildConfig, xcodeProject: string, archivePath: string): string[] {
  const iosConfig = config.targets.ios ?? {};
  const release = iosConfig.release ?? {};
  const teamId = release.teamId ?? iosConfig.teamId;
  const args = [
    '-project',
    xcodeProject,
    '-scheme',
    iosConfig.scheme ?? 'love-ios',
    '-configuration',
    release.configuration ?? 'Release',
    '-sdk',
    release.sdk ?? 'iphoneos',
    '-destination',
    'generic/platform=iOS',
    '-archivePath',
    archivePath,
    `PRODUCT_BUNDLE_IDENTIFIER=${iosBundleIdentifier(config)}`,
    `INFOPLIST_KEY_CFBundleDisplayName=${iosConfig.displayName ?? config.name}`,
    `IPHONEOS_DEPLOYMENT_TARGET=${iosConfig.deploymentTarget ?? '12.0'}`,
    'OTHER_CFLAGS=-Wno-everything',
  ];
  if (teamId) args.push(`DEVELOPMENT_TEAM=${teamId}`);
  if (!teamId) {
    args.push('CODE_SIGN_IDENTITY=', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGNING_ALLOWED=NO');
  }
  args.push('archive');
  return args;
}

export function xcodeExportArchiveArgs(archivePath: string, exportPath: string, exportOptionsPlist: string): string[] {
  return [
    '-exportArchive',
    '-archivePath',
    archivePath,
    '-exportPath',
    exportPath,
    '-exportOptionsPlist',
    exportOptionsPlist,
  ];
}

function runXcodebuild(args: string[], workDir: string, log?: NativeBuildLogger): void {
  logNativeCommand(log, 'xcodebuild', args, workDir);
  const streamOutput = Boolean(log);
  const result = spawnSync('xcodebuild', args, {
    cwd: workDir,
    encoding: streamOutput ? undefined : 'utf8',
    stdio: streamOutput ? 'inherit' : 'pipe',
    maxBuffer: XCODEBUILD_MAX_BUFFER,
  });
  if (!streamOutput) logNativeOutput(log, result.stdout, result.stderr);
  if (result.error) {
    const err = result.error as Error & { code?: string };
    if (err.code === 'ENOENT') {
      throw new Error('xcodebuild not found. Run `feather doctor --target ios`.');
    }
    const output = spawnOutput(result);
    throw new Error([`xcodebuild failed to run: ${err.message}`, output].filter(Boolean).join('\n'));
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `xcodebuild failed with exit code ${result.status ?? 'unknown'}`).toString().trim());
  }
}

function writeGeneratedExportOptions(config: ResolvedBuildConfig, path: string): string {
  const release = config.targets.ios?.release ?? {};
  const teamId = release.teamId ?? config.targets.ios?.teamId;
  const entries: string[] = [
    plistEntry('method', release.exportMethod ?? 'development'),
    plistEntry('signingStyle', release.signingStyle ?? 'automatic'),
  ];
  if (teamId) entries.push(plistEntry('teamID', teamId));
  if (release.provisioningProfileSpecifier) {
    entries.push(
      '<key>provisioningProfiles</key>',
      '<dict>',
      plistEntry(iosBundleIdentifier(config), release.provisioningProfileSpecifier),
      '</dict>',
    );
  }
  const plist = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    ...entries,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
  writeFileSync(path, plist);
  return path;
}

function plistEntry(key: string, value: string): string {
  return `<key>${escapeXml(key)}</key>\n<string>${escapeXml(value)}</string>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  }[char]!));
}

export function patchIosProject(projectPath: string, config?: ResolvedBuildConfig, productFile?: string): void {
  if (!existsSync(projectPath)) return;
  const source = readFileSync(projectPath, 'utf8');
  const buildFileId = 'FEATHERGAMELOVE000000000001';
  const fileRefId = 'FEATHERGAMELOVE000000000002';
  const fileRef = `\t\t${fileRefId} /* game.love */ = {isa = PBXFileReference; lastKnownFileType = file; name = game.love; path = game.love; sourceTree = SOURCE_ROOT; };\n`;
  const buildFile = `\t\t${buildFileId} /* game.love in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* game.love */; };\n`;
  let next = source;
  if (config && productFile) {
    next = patchIosProjectMetadata(next, config, productFile);
  }

  if (next.includes(`${buildFileId} /* game.love in Resources */`)) {
    next = next.replace(
      new RegExp(`\\t\\t${buildFileId} /\\* game\\.love in Resources \\*/ = \\{[^\\n]+\\};\\n`),
      buildFile,
    );
  } else if (next.includes('/* Begin PBXBuildFile section */')) {
    next = next.replace(
      /\/\* Begin PBXBuildFile section \*\/\n/,
      `/* Begin PBXBuildFile section */\n${buildFile}`,
    );
  }

  if (next.includes(`${fileRefId} /* game.love */`)) {
    next = next.replace(
      new RegExp(`\\t\\t${fileRefId} /\\* game\\.love \\*/ = \\{[^\\n]+\\};\\n`),
      fileRef,
    );
  } else if (next.includes('/* Begin PBXFileReference section */')) {
    next = next.replace(
      /\/\* Begin PBXFileReference section \*\/\n/,
      `/* Begin PBXFileReference section */\n${fileRef}`,
    );
  }

  const resourcesPhaseId = findIosResourcesPhaseId(next);
  if (resourcesPhaseId) {
    next = ensureResourceBuildFile(next, resourcesPhaseId, buildFileId);
  }

  if (next === source) next = `${source}\n/* Feather: include game.love in the app resources. */\n`;
  writeFileSync(projectPath, next);
}

function patchIosProjectMetadata(project: string, config: ResolvedBuildConfig, productFile: string): string {
  const bundleIdentifier = iosBundleIdentifier(config);
  return project
    .replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${bundleIdentifier};`)
    .replace(/PRODUCT_NAME = "?love"?;/g, `PRODUCT_NAME = ${productFile};`)
    .replace(/productName = "?love"?;/g, `productName = ${productFile};`)
    .replace(/path = love\.app;/g, `path = ${productFile}.app;`)
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${config.version};`);
}

function findIosResourcesPhaseId(project: string): string | null {
  const targetMatch = project.match(/([A-Z0-9]{10,}) \/\* love-ios \*\/ = \{[\s\S]*?buildPhases = \(([\s\S]*?)\);[\s\S]*?name = "?love-ios"?;/);
  if (targetMatch) {
    const resourcesMatch = targetMatch[2]?.match(/([A-Z0-9]{10,}) \/\* Resources \*\//);
    if (resourcesMatch?.[1]) return resourcesMatch[1];
  }

  const phaseWithLaunchScreen = project.match(/([A-Z0-9]{10,}) \/\* Resources \*\/ = \{[\s\S]*?files = \([\s\S]*?Launch Screen\.xib in Resources[\s\S]*?\);/);
  if (phaseWithLaunchScreen?.[1]) return phaseWithLaunchScreen[1];

  const firstResourcesPhase = project.match(/([A-Z0-9]{10,}) \/\* Resources \*\/ = \{[\s\S]*?isa = PBXResourcesBuildPhase;/);
  return firstResourcesPhase?.[1] ?? null;
}

function ensureResourceBuildFile(project: string, resourcesPhaseId: string, buildFileId: string): string {
  const phasePattern = new RegExp(`(${escapeRegExp(resourcesPhaseId)} /\\* Resources \\*/ = \\{[\\s\\S]*?files = \\(\\n)([\\s\\S]*?)(\\n\\s*\\);)`);
  return project.replace(phasePattern, (match, prefix: string, files: string, suffix: string) => {
    if (files.includes(`${buildFileId} /* game.love in Resources */`)) return match;
    return `${prefix}\t\t\t\t${buildFileId} /* game.love in Resources */,\n${files}${suffix}`;
  });
}
