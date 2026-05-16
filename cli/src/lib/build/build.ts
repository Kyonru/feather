import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, type Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertNoSymlinkEscape } from '../path-safety.js';
import {
  artifactBaseName,
  buildSlug,
  copyDirectory,
  fileSize,
  latestManifestPath,
  listProjectFiles,
  stageProject,
  writeDirectoryZip,
  writeJson,
  writeLoveArchive,
  type BuildArtifact,
  type BuildManifest,
} from './files.js';
import {
  isSupportedBuildTarget,
  loadBuildConfig,
  type BuildTarget,
  type LoadBuildConfigOptions,
  type ResolvedBuildConfig,
  type SupportedBuildTarget,
} from './config.js';

type DesktopBuildTarget = Exclude<SupportedBuildTarget, 'web' | 'android' | 'ios'>;

export type BuildOptions = LoadBuildConfigOptions & {
  target: BuildTarget;
  clean?: boolean;
  dryRun?: boolean;
  allowUnsafe?: boolean;
};

export type BuildResult = {
  ok: true;
  dryRun: boolean;
  target: BuildTarget;
  projectDir: string;
  outDir: string;
  name: string;
  version: string;
  artifacts: BuildArtifact[];
  files: string[];
  manifestPath?: string;
  command?: string[];
} | {
  ok: false;
  error: string;
};

export function assertBuildTargetSupported(target: BuildTarget): asserts target is SupportedBuildTarget {
  if (!isSupportedBuildTarget(target)) {
    throw new Error(`Build target "${target}" is planned but not supported yet. Run \`feather doctor --build-target ${target}\` for setup guidance.`);
  }
}

export function assertProductionBuildSafe(config: ResolvedBuildConfig, allowUnsafe = false): void {
  if (allowUnsafe) return;
  const configPath = join(config.projectDir, 'feather.config.lua');
  if (!existsSync(configPath)) return;
  const source = readFileSync(configPath, 'utf8');
  const socketMode = !/mode\s*=\s*["']disk["']/.test(source);
  const hasAppId = /appId\s*=\s*["'][^"']+["']/.test(source);
  const host = source.match(/host\s*=\s*["']([^"']+)["']/)?.[1] ?? '127.0.0.1';
  const unsafe = [
    /__DANGEROUS_INSECURE_CONNECTION__\s*=\s*true/.test(source) ? '__DANGEROUS_INSECURE_CONNECTION__ is enabled' : '',
    socketMode && !hasAppId ? 'appId is missing for socket/network mode' : '',
    host === '0.0.0.0' || host === '::' ? `network host is exposed (${host})` : '',
    /include\s*=\s*\{[\s\S]*["']console["']/.test(source) ? 'console plugin is included' : '',
    /hotReload\s*=\s*\{[\s\S]*enabled\s*=\s*true/.test(source) ? 'hot reload is enabled' : '',
    /allow\s*=\s*\{[\s\S]*["'][^"']+\.\*["']/.test(source) ? 'hot reload allowlist contains a wildcard' : '',
    /debugger\s*=\s*(true|\{[\s\S]*enabled\s*=\s*true)/.test(source) ? 'debugger is enabled' : '',
    /captureScreenshot\s*=\s*true/.test(source) ? 'captureScreenshot is enabled' : '',
    /writeToDisk\s*=\s*true/.test(source) ? 'writeToDisk is enabled' : '',
  ].filter(Boolean);
  if (unsafe.length > 0) {
    throw new Error(`Production build preflight failed. Run \`feather doctor --production\` or pass --allow-unsafe.\n${unsafe.join('\n')}`);
  }
}

export function planBuild(options: BuildOptions): Omit<Extract<BuildResult, { ok: true }>, 'artifacts'> & { artifacts: BuildArtifact[] } {
  const config = loadBuildConfig(options);
  return {
    ok: true,
    dryRun: true,
    target: options.target,
    projectDir: config.projectDir,
    outDir: config.outDir,
    name: config.name,
    version: config.version,
    files: listProjectFiles(config),
    artifacts: plannedArtifacts(config, options.target),
    manifestPath: latestManifestPath(config.outDir),
  };
}

export function runBuild(options: BuildOptions): BuildResult {
  try {
    assertBuildTargetSupported(options.target);
    const config = loadBuildConfig(options);
    assertProductionBuildSafe(config, options.allowUnsafe);
    assertNoSymlinkEscape(config.projectDir, config.outDir, 'Build output directory');

    if (options.dryRun) return planBuild(options);
    if (options.clean) rmSync(config.outDir, { recursive: true, force: true });
    mkdirSync(config.outDir, { recursive: true });

    const staged = stageProject(config);
    try {
      const artifacts = options.target === 'web'
        ? buildWeb(config, staged.dir)
        : options.target === 'android'
          ? buildAndroid(config, staged.dir)
          : options.target === 'ios'
            ? buildIos(config, staged.dir)
            : buildDesktop(config, options.target, staged.dir);
      const manifest: BuildManifest = {
        name: config.name,
        version: config.version,
        target: options.target,
        createdAt: new Date().toISOString(),
        artifacts,
      };
      writeJson(latestManifestPath(config.outDir), manifest);
      return {
        ok: true,
        dryRun: false,
        target: options.target,
        projectDir: config.projectDir,
        outDir: config.outDir,
        name: config.name,
        version: config.version,
        files: staged.files,
        artifacts,
        manifestPath: latestManifestPath(config.outDir),
      };
    } finally {
      staged.cleanup();
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function plannedArtifacts(config: ResolvedBuildConfig, target: BuildTarget): BuildArtifact[] {
  const base = artifactBaseName(config);
  if (target === 'web') {
    return [
      { target, type: 'love', path: join(config.outDir, `${base}.love`) },
      { target, type: 'html', path: join(config.outDir, `${base}-html`) },
      { target, type: 'zip', path: join(config.outDir, `${base}-html.zip`) },
    ];
  }
  if (target === 'android') {
    return [
      { target, type: 'love', path: join(config.outDir, `${base}.love`) },
      { target, type: 'apk', path: join(config.outDir, `${base}-android.apk`) },
    ];
  }
  if (target === 'ios') {
    return [
      { target, type: 'love', path: join(config.outDir, `${base}.love`) },
      { target, type: 'app', path: join(config.outDir, `${base}-ios.app`) },
    ];
  }
  return [
    { target, type: 'love', path: join(config.outDir, `${base}.love`) },
    { target, type: 'external', path: config.outDir },
  ];
}

function buildWeb(config: ResolvedBuildConfig, stageDir: string): BuildArtifact[] {
  const webConfig = config.targets.web ?? {};
  const loveJsDir = webConfig.loveJsDir ? resolve(config.projectDir, webConfig.loveJsDir) : '';
  if (!loveJsDir || !existsSync(loveJsDir)) {
    throw new Error('Web build requires targets.web.loveJsDir in feather.build.json.');
  }
  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  const htmlDir = join(config.outDir, webConfig.outputName ?? `${base}-html`);
  copyDirectory(loveJsDir, htmlDir);
  const gameLovePath = join(htmlDir, 'game.love');
  writeFileSync(gameLovePath, readFileSync(lovePath));
  patchLoveJsIndex(join(htmlDir, 'index.html'), webConfig.title ?? config.name);
  const zipPath = writeDirectoryZip(htmlDir, join(config.outDir, `${base}-html.zip`));
  return [
    { target: 'web', type: 'love', path: lovePath },
    { target: 'web', type: 'html', path: htmlDir },
    { target: 'web', type: 'zip', path: zipPath },
  ];
}

function patchLoveJsIndex(indexPath: string, title: string): void {
  const fallback = [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"><title>löve.js</title></head>',
    '<body><canvas id="canvas"></canvas><script src="player.min.js?g=game.love"></script></body>',
    '</html>',
    '',
  ].join('\n');
  const existing = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : fallback;
  let next = existing.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  if (next === existing && !/<title>/i.test(next)) {
    next = next.replace(/<head[^>]*>/i, (match) => `${match}<title>${escapeHtml(title)}</title>`);
  }
  next = next.replace(/player(?:\.min)?\.js(?:\?g=[^"']*)?/g, (match) => {
    const script = match.startsWith('player.min') ? 'player.min.js' : 'player.js';
    return `${script}?g=game.love`;
  });
  if (!/\?g=game\.love/.test(next)) {
    next = next.replace('</body>', '<script src="player.min.js?g=game.love"></script></body>');
  }
  writeFileSync(indexPath, next);
}

function buildAndroid(config: ResolvedBuildConfig, stageDir: string): BuildArtifact[] {
  const androidConfig = config.targets.android ?? {};
  const loveAndroidDir = androidConfig.loveAndroidDir ? resolve(config.projectDir, androidConfig.loveAndroidDir) : '';
  if (!loveAndroidDir || !existsSync(loveAndroidDir)) {
    throw new Error('Android build requires targets.android.loveAndroidDir in feather.build.json.');
  }

  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  const workRoot = mkdtempSync(join(tmpdir(), 'feather-android-'));
  const workDir = join(workRoot, 'love-android');

  try {
    copyDirectory(loveAndroidDir, workDir);
    const embeddedLovePath = join(workDir, 'app', 'src', 'embed', 'assets', 'game.love');
    mkdirSync(dirname(embeddedLovePath), { recursive: true });
    cpSync(lovePath, embeddedLovePath, { force: true });

    patchAndroidProject(config, workDir);

    const gradleCommand = process.platform === 'win32' ? join(workDir, 'gradlew.bat') : join(workDir, 'gradlew');
    if (!existsSync(gradleCommand)) {
      throw new Error('Android build requires a Gradle wrapper in targets.android.loveAndroidDir.');
    }
    const gradleTask = androidConfig.gradleTask
      ?? (androidConfig.recordAudio ? 'assembleEmbedRecordDebug' : 'assembleEmbedNoRecordDebug');
    const result = spawnSync(gradleCommand, [gradleTask], {
      cwd: workDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.error) throw new Error(`Gradle wrapper failed to start: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `Gradle task ${gradleTask} failed`).trim());
    }

    const apkSource = androidConfig.artifactPath
      ? resolveWorkspacePath(workDir, androidConfig.artifactPath, 'Android artifact path')
      : findFirstPath(join(workDir, 'app', 'build', 'outputs'), (_path, entry) => entry.isFile() && entry.name.endsWith('.apk'));
    if (!apkSource || !existsSync(apkSource)) {
      throw new Error('Android build completed but no APK artifact was found. Set targets.android.artifactPath if your template writes elsewhere.');
    }
    const apkPath = join(config.outDir, `${base}-android.apk`);
    cpSync(apkSource, apkPath, { force: true });

    return [
      { target: 'android', type: 'love', path: lovePath },
      { target: 'android', type: 'apk', path: apkPath },
    ];
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

function buildIos(config: ResolvedBuildConfig, stageDir: string): BuildArtifact[] {
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
  const workRoot = mkdtempSync(join(tmpdir(), 'feather-ios-'));
  const workDir = join(workRoot, 'love-ios');
  const derivedDataPath = iosConfig.derivedDataPath
    ? resolve(config.projectDir, iosConfig.derivedDataPath)
    : join(workRoot, 'DerivedData');

  try {
    copyDirectory(loveIosDir, workDir);
    const xcodeProject = join(workDir, 'platform', 'xcode', 'love.xcodeproj');
    if (!existsSync(xcodeProject)) {
      throw new Error('iOS build requires platform/xcode/love.xcodeproj in targets.ios.loveIosDir.');
    }

    const gameLovePath = join(workDir, 'platform', 'xcode', 'game.love');
    mkdirSync(dirname(gameLovePath), { recursive: true });
    cpSync(lovePath, gameLovePath, { force: true });
    patchIosProject(join(xcodeProject, 'project.pbxproj'));

    const bundleIdentifier = iosConfig.bundleIdentifier ?? iosConfig.productId ?? config.productId ?? defaultProductId(config, 'ios');
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
      `PRODUCT_BUNDLE_IDENTIFIER=${bundleIdentifier}`,
      `INFOPLIST_KEY_CFBundleDisplayName=${iosConfig.displayName ?? config.name}`,
    ];
    if (iosConfig.teamId) args.push(`DEVELOPMENT_TEAM=${iosConfig.teamId}`);
    args.push('build');

    const result = spawnSync('xcodebuild', args, { cwd: workDir, encoding: 'utf8' });
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
    rmSync(workRoot, { recursive: true, force: true });
  }
}

function buildDesktop(config: ResolvedBuildConfig, target: DesktopBuildTarget, stageDir: string): BuildArtifact[] {
  const normalizedTarget = target === 'steamos' ? 'linux' : target;
  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  const args = [
    '--output',
    config.outDir,
    '--name',
    config.name,
    '--version',
    config.version,
    '--target',
    normalizedTarget,
    stageDir,
  ];
  const result = spawnSync('love-release', args, { encoding: 'utf8' });
  if (result.error) throw new Error(`love-release not found. Run \`feather doctor --build-target ${target}\`.`);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `love-release failed for ${target}`).trim());
  }
  return [
    { target, type: 'love', path: lovePath },
    { target, type: 'external', path: config.outDir },
  ];
}

function patchAndroidProject(config: ResolvedBuildConfig, workDir: string): void {
  const androidConfig = config.targets.android ?? {};
  const productId = androidConfig.productId ?? config.productId ?? defaultProductId(config, 'android');
  const versionName = androidConfig.versionName ?? config.version;
  const versionCode = androidConfig.versionCode ?? 1;
  const displayName = androidConfig.displayName ?? config.name;
  const orientation = androidConfig.orientation ?? 'landscape';

  for (const file of ['app/build.gradle', 'app/build.gradle.kts', 'build.gradle', 'build.gradle.kts']) {
    patchTextFile(join(workDir, file), (source) => source
      .replace(/applicationId\s*(?:=)?\s*["'][^"']+["']/g, (match) => assignmentValue(match, 'applicationId', productId))
      .replace(/namespace\s*(?:=)?\s*["'][^"']+["']/g, (match) => assignmentValue(match, 'namespace', productId))
      .replace(/versionName\s*(?:=)?\s*["'][^"']+["']/g, (match) => assignmentValue(match, 'versionName', versionName))
      .replace(/versionCode\s*(?:=)?\s*\d+/g, (match) => assignmentValue(match, 'versionCode', String(versionCode), false)));
  }

  for (const file of ['app/src/main/res/values/strings.xml', 'app/src/embed/res/values/strings.xml']) {
    patchTextFile(join(workDir, file), (source) => source.replace(
      /<string\s+name=["']app_name["']>[\s\S]*?<\/string>/,
      `<string name="app_name">${escapeXml(displayName)}</string>`,
    ));
  }

  for (const file of ['app/src/main/AndroidManifest.xml', 'app/src/embed/AndroidManifest.xml']) {
    patchTextFile(join(workDir, file), (source) => {
      let next = source
        .replace(/android:label=["'][^"']*["']/g, `android:label="${escapeXml(displayName)}"`)
        .replace(/android:screenOrientation=["'][^"']*["']/g, `android:screenOrientation="${escapeXml(orientation)}"`);
      if (!/android:label=/.test(next)) {
        next = next.replace(/<application\b([^>]*)>/, `<application$1 android:label="${escapeXml(displayName)}">`);
      }
      if (!/android:screenOrientation=/.test(next)) {
        next = next.replace(/<activity\b([^>]*)>/, `<activity$1 android:screenOrientation="${escapeXml(orientation)}">`);
      }
      if (androidConfig.recordAudio) {
        if (!/android\.permission\.RECORD_AUDIO/.test(next)) {
          next = next.replace(/<manifest\b[^>]*>/, (match) => `${match}\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />`);
        }
      } else {
        next = next
          .split('\n')
          .filter((line) => !line.includes('android.permission.RECORD_AUDIO'))
          .join('\n');
      }
      return next;
    });
  }
}

function patchIosProject(projectPath: string): void {
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

function patchTextFile(path: string, update: (source: string) => string): void {
  if (!existsSync(path)) return;
  const source = readFileSync(path, 'utf8');
  const next = update(source);
  if (next !== source) writeFileSync(path, next);
}

function assignmentValue(match: string, key: string, value: string, quote = true): string {
  const separator = match.includes('=') ? ' = ' : ' ';
  return `${key}${separator}${quote ? `"${value}"` : value}`;
}

function defaultProductId(config: ResolvedBuildConfig, target: 'android' | 'ios'): string {
  const slug = buildSlug(config.name)
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    || 'game';
  return `org.feather.${slug}.${target}`;
}

function resolveWorkspacePath(root: string, path: string, label: string): string {
  const absolute = resolve(root, path);
  const normalizedRoot = resolve(root);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`${label} must stay inside the native build workspace.`);
  }
  return absolute;
}

function findFirstPath(root: string, predicate: (path: string, entry: Dirent) => boolean): string | null {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (predicate(path, entry)) return path;
    if (entry.isDirectory()) {
      const found = findFirstPath(path, predicate);
      if (found) return found;
    }
  }
  return null;
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]!));
}

export function describeArtifact(artifact: BuildArtifact): string {
  const size = existsSync(artifact.path) && artifact.type !== 'html' && artifact.type !== 'external'
    ? ` (${fileSize(artifact.path)} bytes)`
    : '';
  return `${artifact.type}: ${artifact.path}${size}`;
}
