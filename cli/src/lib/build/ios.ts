import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { artifactBaseName, copyDirectory, writeLoveArchive, type BuildArtifact } from './files.js';
import type { ResolvedBuildConfig } from './config.js';
import { createNativeWorkspace, findFirstPath } from './native.js';
import { iosBundleIdentifier } from './validation.js';

export type IosBuildModeOptions = {
  release?: boolean;
};

export function buildIos(config: ResolvedBuildConfig, stageDir: string, options: IosBuildModeOptions = {}): BuildArtifact[] {
  if (process.platform !== 'darwin' && process.env.FEATHER_TEST_ALLOW_IOS_BUILD !== '1') {
    throw new Error('iOS builds require macOS with Xcode. Run `feather doctor --build-target ios` for setup guidance.');
  }

  const iosConfig = config.targets.ios ?? {};
  const loveIosDir = iosConfig.loveIosDir ? resolve(config.projectDir, iosConfig.loveIosDir) : '';
  if (!loveIosDir || !existsSync(loveIosDir)) {
    throw new Error('iOS build requires targets.ios.loveIosDir in feather.build.json.');
  }

  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  const workspace = createNativeWorkspace('feather-ios-', loveIosDir, 'love-ios');
  const derivedDataPath = iosConfig.derivedDataPath
    ? resolve(config.projectDir, iosConfig.derivedDataPath)
    : join(workspace.root, 'DerivedData');

  try {
    const xcodeProject = join(workspace.dir, 'platform', 'xcode', 'love.xcodeproj');
    if (!existsSync(xcodeProject)) {
      throw new Error('iOS build requires platform/xcode/love.xcodeproj in targets.ios.loveIosDir.');
    }

    const gameLovePath = join(workspace.dir, 'platform', 'xcode', 'game.love');
    mkdirSync(dirname(gameLovePath), { recursive: true });
    cpSync(lovePath, gameLovePath, { force: true });
    patchIosProject(join(xcodeProject, 'project.pbxproj'));

    if (options.release) {
      const releaseArtifacts = buildIosRelease(config, workspace.dir, xcodeProject, base, lovePath);
      return releaseArtifacts;
    }

    const args = xcodebuildArgs(config, xcodeProject, derivedDataPath);
    runXcodebuild(args, workspace.dir);

    const appSource = findFirstPath(derivedDataPath, (_path, entry) => entry.isDirectory() && entry.name.endsWith('.app'));
    if (!appSource || !existsSync(appSource)) {
      throw new Error('iOS build completed but no .app artifact was found. Check targets.ios.derivedDataPath or Xcode build settings.');
    }
    const appPath = join(config.outDir, `${base}-ios.app`);
    copyDirectory(appSource, appPath);

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

  runXcodebuild(xcodeArchiveArgs(config, xcodeProject, archiveSource), workDir);
  if (!existsSync(archiveSource)) {
    throw new Error('iOS archive completed but no .xcarchive was found. Check targets.ios.release.archivePath or Xcode archive settings.');
  }
  runXcodebuild(xcodeExportArchiveArgs(archiveSource, exportPath, exportOptionsPlist), workDir);
  const ipaSource = findFirstPath(exportPath, (_path, entry) => entry.isFile() && entry.name.endsWith('.ipa'));
  if (!ipaSource || !existsSync(ipaSource)) {
    throw new Error('iOS export completed but no .ipa artifact was found. Check targets.ios.release.exportPath or export options.');
  }

  const archivePath = join(config.outDir, `${base}-ios.xcarchive`);
  const ipaPath = join(config.outDir, `${base}-ios.ipa`);
  copyDirectory(archiveSource, archivePath);
  cpSync(ipaSource, ipaPath, { force: true });
  return [
    { target: 'ios', type: 'love', path: lovePath },
    { target: 'ios', type: 'xcarchive', path: archivePath },
    { target: 'ios', type: 'ipa', path: ipaPath },
  ];
}

export function xcodebuildArgs(config: ResolvedBuildConfig, xcodeProject: string, derivedDataPath: string): string[] {
  const iosConfig = config.targets.ios ?? {};
  const args = [
    '-project',
    xcodeProject,
    '-scheme',
    iosConfig.scheme ?? 'love-ios',
    '-configuration',
    iosConfig.configuration ?? 'Debug',
    '-sdk',
    iosConfig.sdk ?? 'iphonesimulator',
    '-derivedDataPath',
    derivedDataPath,
    `PRODUCT_BUNDLE_IDENTIFIER=${iosBundleIdentifier(config)}`,
    `INFOPLIST_KEY_CFBundleDisplayName=${iosConfig.displayName ?? config.name}`,
  ];
  if (iosConfig.teamId) args.push(`DEVELOPMENT_TEAM=${iosConfig.teamId}`);
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
    '-archivePath',
    archivePath,
    `PRODUCT_BUNDLE_IDENTIFIER=${iosBundleIdentifier(config)}`,
    `INFOPLIST_KEY_CFBundleDisplayName=${iosConfig.displayName ?? config.name}`,
  ];
  if (teamId) args.push(`DEVELOPMENT_TEAM=${teamId}`);
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

function runXcodebuild(args: string[], workDir: string): void {
  const result = spawnSync('xcodebuild', args, { cwd: workDir, encoding: 'utf8' });
  if (result.error) throw new Error('xcodebuild not found. Run `feather doctor --build-target ios`.');
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'xcodebuild failed').trim());
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

export function patchIosProject(projectPath: string): void {
  if (!existsSync(projectPath)) return;
  const source = readFileSync(projectPath, 'utf8');
  if (source.includes('game.love')) return;
  const buildFileId = 'FEATHERGAMELOVE000000000001';
  const fileRefId = 'FEATHERGAMELOVE000000000002';
  let next = source;
  if (next.includes('/* Begin PBXBuildFile section */')) {
    next = next.replace(
      /\/\* Begin PBXBuildFile section \*\/\n/,
      `/* Begin PBXBuildFile section */\n\t\t${buildFileId} /* game.love in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* game.love */; };\n`,
    );
  }
  if (next.includes('/* Begin PBXFileReference section */')) {
    next = next.replace(
      /\/\* Begin PBXFileReference section \*\/\n/,
      `/* Begin PBXFileReference section */\n\t\t${fileRefId} /* game.love */ = {isa = PBXFileReference; lastKnownFileType = archive.love; name = game.love; path = game.love; sourceTree = "<group>"; };\n`,
    );
  }
  next = next.replace(
    /(isa = PBXResourcesBuildPhase;[\s\S]*?files = \(\n)/,
    `$1\t\t\t\t${buildFileId} /* game.love in Resources */,\n`,
  );
  if (next === source) next = `${source}\n/* Feather: include game.love in the app resources. */\n`;
  writeFileSync(projectPath, next);
}
