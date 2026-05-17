import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  artifactBaseName,
  buildSlug,
  copyDirectory,
  removePath,
  writeDirectoryZip,
  writeLoveArchive,
  type BuildArtifact,
} from './files.js';
import type { ResolvedBuildConfig, SupportedBuildTarget } from './config.js';

export type DesktopBuildTarget = Exclude<SupportedBuildTarget, 'love' | 'web' | 'android' | 'ios'>;

export function buildLove(config: ResolvedBuildConfig, stageDir: string): BuildArtifact[] {
  const lovePath = writeLoveArchive(stageDir, config.outDir, artifactBaseName(config));
  return [{ target: 'love', type: 'love', path: lovePath }];
}

export function buildDesktop(config: ResolvedBuildConfig, target: DesktopBuildTarget, stageDir: string): BuildArtifact[] {
  const base = artifactBaseName(config);
  const lovePath = writeLoveArchive(stageDir, config.outDir, base);
  if (target === 'windows') return buildWindows(config, lovePath, base);
  if (target === 'macos') return buildMacos(config, lovePath, base);
  return buildLinuxLike(config, target, lovePath, base);
}

function buildWindows(config: ResolvedBuildConfig, lovePath: string, base: string): BuildArtifact[] {
  const runtimeDir = desktopRuntimeDir(config, 'windows');
  const sourceExe = join(runtimeDir, 'love.exe');
  if (!existsSync(sourceExe)) {
    throw new Error(`Windows LÖVE runtime is incomplete at ${runtimeDir}. Run \`feather build vendor add windows --dir ${config.projectDir}\`.`);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'feather-windows-'));
  const appSlug = buildSlug(config.name);
  const bundleDir = join(workDir, appSlug);
  const zipPath = join(config.outDir, `${base}-windows.zip`);
  const installerPath = join(config.outDir, `${base}-windows-installer.exe`);
  try {
    copyDirectory(runtimeDir, bundleDir);
    const appExe = join(bundleDir, `${appSlug}.exe`);
    renameSync(join(bundleDir, 'love.exe'), appExe);
    appendFileSync(appExe, readFileSync(lovePath));
    writeDirectoryZip(bundleDir, zipPath);
    writeWindowsInstallerScript(join(workDir, 'installer.nsi'), config, bundleDir, installerPath);
    runTool('makensis', [join(workDir, 'installer.nsi')], workDir, 'makensis not found. Run `feather doctor --build-target windows`.');
  } finally {
    removePath(workDir);
  }

  return [
    { target: 'windows', type: 'love', path: lovePath },
    { target: 'windows', type: 'zip', path: zipPath },
    { target: 'windows', type: 'installer', path: installerPath },
  ];
}

function buildMacos(config: ResolvedBuildConfig, lovePath: string, base: string): BuildArtifact[] {
  const runtimeDir = desktopRuntimeDir(config, 'macos');
  const runtimeApp = join(runtimeDir, 'love.app');
  if (!existsSync(runtimeApp)) {
    throw new Error(`macOS LÖVE runtime is incomplete at ${runtimeDir}. Run \`feather build vendor add macos --dir ${config.projectDir}\`.`);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'feather-macos-'));
  const appSlug = buildSlug(config.name);
  const appBundle = join(workDir, `${appSlug}.app`);
  const zipPath = join(config.outDir, `${base}-macos.app.zip`);
  const dmgPath = join(config.outDir, `${base}-macos.dmg`);
  try {
    copyDirectory(runtimeApp, appBundle);
    const resourcesDir = join(appBundle, 'Contents', 'Resources');
    mkdirSync(resourcesDir, { recursive: true });
    writeFileSync(join(resourcesDir, 'game.love'), readFileSync(lovePath));
    patchMacosPlist(config, join(appBundle, 'Contents', 'Info.plist'), appSlug);
    const ditto = spawnSync('ditto', ['-c', '-k', '--keepParent', appBundle, zipPath], { encoding: 'utf8' });
    if (ditto.error) {
      writeDirectoryZip(appBundle, zipPath);
    } else if (ditto.status !== 0) {
      throw new Error((ditto.stderr || ditto.stdout || 'ditto failed').trim());
    }
    runTool('hdiutil', ['create', '-volname', appSlug, '-srcfolder', appBundle, '-ov', '-format', 'UDZO', dmgPath], workDir, 'hdiutil not found. Run `feather doctor --build-target macos`.');
  } finally {
    removePath(workDir);
  }

  return [
    { target: 'macos', type: 'love', path: lovePath },
    { target: 'macos', type: 'zip', path: zipPath },
    { target: 'macos', type: 'dmg', path: dmgPath },
  ];
}

function buildLinuxLike(config: ResolvedBuildConfig, target: 'linux' | 'steamos', lovePath: string, base: string): BuildArtifact[] {
  const runtimeDir = desktopRuntimeDir(config, target);
  const runtimeRoot = join(runtimeDir, 'squashfs-root');
  const appImageTool = join(runtimeDir, 'appimagetool.AppImage');
  if (!existsSync(join(runtimeRoot, 'bin', 'love')) || !existsSync(appImageTool)) {
    throw new Error(`${target} LÖVE runtime is incomplete at ${runtimeDir}. Run \`feather build vendor add ${target} --dir ${config.projectDir}\`.`);
  }

  const workDir = mkdtempSync(join(tmpdir(), `feather-${target}-`));
  const appSlug = buildSlug(config.name);
  const appDir = join(workDir, 'squashfs-root');
  const appImagePath = join(config.outDir, `${base}-${target}.AppImage`);
  const tarPath = join(config.outDir, `${base}-${target}.tar.gz`);
  try {
    copyDirectory(runtimeRoot, appDir);
    patchLinuxRuntime(appDir, appSlug, config.description);
    const appBinary = join(appDir, 'bin', appSlug);
    appendFileSync(appBinary, readFileSync(lovePath));
    chmodSync(appBinary, 0o755);
    chmodSync(appImageTool, 0o755);
    runTool(appImageTool, [appDir, appImagePath], workDir, `appimagetool failed. Run \`feather doctor --build-target ${target}\`.`);
    runTool('tar', ['-czf', tarPath, '-C', appDir, '.'], workDir, `tar not found. Run \`feather doctor --build-target ${target}\`.`);
  } finally {
    removePath(workDir);
  }

  return [
    { target, type: 'love', path: lovePath },
    { target, type: 'appimage', path: appImagePath },
    { target, type: 'tar.gz', path: tarPath },
  ];
}

function desktopRuntimeDir(config: ResolvedBuildConfig, target: DesktopBuildTarget): string {
  const configured = target === 'steamos'
    ? config.targets.steamos?.loveRuntimeDir ?? config.targets.linux?.loveRuntimeDir
    : config.targets[target]?.loveRuntimeDir;
  if (!configured) {
    const field = target === 'steamos' ? 'targets.steamos.loveRuntimeDir or targets.linux.loveRuntimeDir' : `targets.${target}.loveRuntimeDir`;
    throw new Error(`${target} build requires ${field} in feather.build.json. Run \`feather build vendor add ${target} --dir ${config.projectDir}\`.`);
  }
  const runtimeDir = resolve(config.projectDir, configured);
  if (!existsSync(runtimeDir)) {
    throw new Error(`${target} LÖVE runtime not found at ${runtimeDir}. Run \`feather build vendor add ${target} --dir ${config.projectDir}\`.`);
  }
  return runtimeDir;
}

function patchLinuxRuntime(appDir: string, appSlug: string, description: string | undefined): void {
  const loveBin = join(appDir, 'bin', 'love');
  const appBin = join(appDir, 'bin', appSlug);
  mkdirSync(dirname(appBin), { recursive: true });
  renameSync(loveBin, appBin);
  const appRun = join(appDir, 'AppRun');
  if (existsSync(appRun)) {
    writeFileSync(appRun, readFileSync(appRun, 'utf8').replace(/bin\/love/g, `bin/${appSlug}`));
    chmodSync(appRun, 0o755);
  }
  const desktop = [
    '[Desktop Entry]',
    `Name=${appSlug}`,
    `Comment=${description ?? appSlug}`,
    'Type=Application',
    'Categories=Game;',
    `Exec=${appSlug} %f`,
    `Icon=${appSlug}`,
    'Terminal=false',
    'NoDisplay=false',
    '',
  ].join('\n');
  writeFileSync(join(appDir, `${appSlug}.desktop`), desktop);
  mkdirSync(join(appDir, 'share', 'applications'), { recursive: true });
  writeFileSync(join(appDir, 'share', 'applications', `${appSlug}.desktop`), desktop);
}

function patchMacosPlist(config: ResolvedBuildConfig, plistPath: string, appSlug: string): void {
  if (!existsSync(plistPath)) {
    throw new Error(`macOS LÖVE runtime is missing Contents/Info.plist. Run \`feather build vendor add macos --dir ${config.projectDir} --force\`.`);
  }
  const bundleId = config.productId ?? `org.feather.${appSlug.replace(/[^a-z0-9]+/g, '.')}.macos`;
  for (const [key, value] of [
    ['CFBundleIdentifier', bundleId],
    ['CFBundleName', config.name],
    ['CFBundleDisplayName', config.name],
    ['CFBundleShortVersionString', config.version],
    ['CFBundleVersion', config.version],
    ['NSHumanReadableCopyright', config.copyright ?? ''],
  ] as const) {
    runTool('plutil', ['-replace', key, '-string', value, plistPath], dirname(plistPath), 'plutil not found. Run `feather doctor --build-target macos`.');
  }
}

function writeWindowsInstallerScript(path: string, config: ResolvedBuildConfig, bundleDir: string, installerPath: string): void {
  const appSlug = buildSlug(config.name);
  const sourceGlob = `${bundleDir.replace(/\\/g, '/')}/*`;
  const script = [
    `Name "${nsis(config.name)}"`,
    `OutFile "${nsis(installerPath)}"`,
    `InstallDir "$LOCALAPPDATA\\${nsis(config.company ?? 'Feather')}\\${nsis(config.name)}"`,
    'RequestExecutionLevel user',
    'Section',
    '  SetOutPath "$INSTDIR"',
    `  File /r "${nsis(sourceGlob)}"`,
    `  CreateShortcut "$SMPROGRAMS\\${nsis(config.name)}.lnk" "$INSTDIR\\${nsis(appSlug)}.exe"`,
    '  WriteUninstaller "$INSTDIR\\uninstall.exe"',
    'SectionEnd',
    'Section "Uninstall"',
    '  Delete "$INSTDIR\\*.*"',
    '  RMDir "$INSTDIR"',
    'SectionEnd',
    '',
  ].join('\n');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, script);
}

function nsis(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runTool(command: string, args: string[], cwd: string, missingMessage: string): void {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw new Error(missingMessage);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
}
