import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { artifactBaseName, copyDirectory, writeLoveArchive, type BuildArtifact } from './files.js';
import type { ResolvedBuildConfig } from './config.js';
import { createNativeWorkspace, findFirstPath } from './native.js';
import { iosBundleIdentifier } from './validation.js';

export function buildIos(config: ResolvedBuildConfig, stageDir: string): BuildArtifact[] {
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

    const args = xcodebuildArgs(config, xcodeProject, derivedDataPath);
    const result = spawnSync('xcodebuild', args, { cwd: workspace.dir, encoding: 'utf8' });
    if (result.error) throw new Error('xcodebuild not found. Run `feather doctor --build-target ios`.');
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || 'xcodebuild failed').trim());
    }

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
