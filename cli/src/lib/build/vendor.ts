import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join, relative, resolve } from 'node:path';
import {
  buildConfigPath,
  loadBuildConfig,
  readBuildConfig,
  type FeatherBuildConfig,
} from './config.js';
import { removePath } from './files.js';
import { assertNoSymlinkEscape, assertSafeRelativePath, isPathInside } from '../path-safety.js';

export const buildVendorTargets = ['web', 'android', 'ios', 'mobile', 'desktop', 'windows', 'macos', 'linux', 'steamos', 'all'] as const;
export type BuildVendorTargetInput = typeof buildVendorTargets[number];
export type ConcreteBuildVendorTarget = 'web' | 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'steamos';

export type BuildVendorAddOptions = {
  projectDir?: string;
  configPath?: string;
  vendorDir?: string;
  ref?: string;
  webRef?: string;
  androidRef?: string;
  iosRef?: string;
  force?: boolean;
  dryRun?: boolean;
  updateConfig?: boolean;
};

export type BuildVendorListOptions = {
  projectDir?: string;
  configPath?: string;
  vendorDir?: string;
};

export type BuildVendorResult = {
  target: ConcreteBuildVendorTarget;
  path: string;
  relativePath: string;
  ref: string;
  repo: string;
  installed: boolean;
  skipped: boolean;
  /** True when skipped because the vendor directory already exists (not --force, not SteamOS reuse). */
  alreadyExists: boolean;
  configUpdated: boolean;
  actions: string[];
};

export type BuildVendorAddResult = {
  ok: true;
  projectDir: string;
  configPath: string;
  loveVersion: string;
  vendors: BuildVendorResult[];
  skippedTargets: ConcreteBuildVendorTarget[];
};

export type BuildVendorListEntry = {
  target: ConcreteBuildVendorTarget;
  path: string;
  relativePath: string;
  configuredPath?: string;
  configured: boolean;
  exists: boolean;
  valid: boolean;
  detail: string;
};

export type BuildVendorListResult = {
  ok: true;
  projectDir: string;
  configPath: string;
  vendors: BuildVendorListEntry[];
};

const DEFAULT_LOVE_VERSION = '11.5';
const DEFAULT_LOVE_JS_REF = 'main';
const LOVE_JS_REPO = 'https://github.com/2dengine/love.js';
const LOVE_ANDROID_REPO = 'https://github.com/love2d/love-android';
const LOVE_REPO = 'https://github.com/love2d/love';
const LOVE_RELEASE_BASE = 'https://github.com/love2d/love/releases/download';
const APPIMAGETOOL_URL = 'https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage';

export function isBuildVendorTarget(value: string): value is BuildVendorTargetInput {
  return (buildVendorTargets as readonly string[]).includes(value);
}

export async function addBuildVendors(targets: BuildVendorTargetInput[], options: BuildVendorAddOptions = {}): Promise<BuildVendorAddResult> {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  let raw = readBuildConfig(projectDir, options.configPath);
  const configPath = buildConfigPath(projectDir, options.configPath);
  const config = loadBuildConfig({ projectDir, configPath: options.configPath });
  const loveVersion = sanitizeRef(options.ref ?? config.loveVersion ?? DEFAULT_LOVE_VERSION, 'LÖVE version');
  const vendorDir = resolveVendorDir(projectDir, options.vendorDir ?? 'vendor');
  const expanded = expandVendorTargets(targets);
  const results: BuildVendorResult[] = [];

  for (const target of expanded) {
    const result = await addSingleVendor({
      target,
      projectDir,
      raw,
      configPath,
      vendorDir,
      loveVersion,
      ref: vendorRef(target, options, config.loveVersion),
      force: Boolean(options.force),
      dryRun: Boolean(options.dryRun),
      updateConfig: options.updateConfig !== false,
    });
    results.push(result);
    if (result.configUpdated) {
      raw = readBuildConfig(projectDir, options.configPath);
    }
  }

  return {
    ok: true,
    projectDir,
    configPath,
    loveVersion,
    vendors: results,
    skippedTargets: results.filter((r) => r.alreadyExists).map((r) => r.target),
  };
}

export function listBuildVendors(options: BuildVendorListOptions = {}): BuildVendorListResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const raw = readBuildConfig(projectDir, options.configPath);
  const configPath = buildConfigPath(projectDir, options.configPath);
  const vendorDir = resolveVendorDir(projectDir, options.vendorDir ?? 'vendor');
  const vendors = (['web', 'android', 'ios', 'windows', 'macos', 'linux', 'steamos'] as const).map((target) => vendorStatus(projectDir, raw, vendorDir, target));
  return { ok: true, projectDir, configPath, vendors };
}

function expandVendorTargets(targets: BuildVendorTargetInput[]): ConcreteBuildVendorTarget[] {
  const requested: BuildVendorTargetInput[] = targets.length > 0 ? targets : ['mobile'];
  const expanded = new Set<ConcreteBuildVendorTarget>();
  for (const target of requested) {
    if (target === 'mobile' || target === 'all') {
      expanded.add('android');
      expanded.add('ios');
      if (target === 'all') expanded.add('web');
      if (target === 'all') {
        expanded.add('windows');
        expanded.add('macos');
        expanded.add('linux');
      }
    } else if (target === 'desktop') {
      expanded.add('windows');
      expanded.add('macos');
      expanded.add('linux');
    } else {
      expanded.add(target);
    }
  }
  return [...expanded];
}

type AddSingleVendorInput = {
  target: ConcreteBuildVendorTarget;
  projectDir: string;
  raw: FeatherBuildConfig;
  configPath: string;
  vendorDir: string;
  loveVersion: string;
  ref: string;
  force: boolean;
  dryRun: boolean;
  updateConfig: boolean;
};

async function addSingleVendor(input: AddSingleVendorInput): Promise<BuildVendorResult> {
  const defaultRelativePath = defaultVendorRelativePath(input.projectDir, input.vendorDir, input.target);
  const configuredPath = configuredVendorPath(input.raw, input.target);
  if (configuredPath && configuredPath !== defaultRelativePath && !input.force) {
    throw new Error(`${input.target} vendor is already configured at ${configuredPath}. Use --force to replace it with ${defaultRelativePath}.`);
  }

  const targetPath = resolveProjectVendorPath(input.projectDir, configuredPath && !input.force ? configuredPath : defaultRelativePath, `${input.target} vendor directory`);
  const relativePath = relativeProjectPath(input.projectDir, targetPath);
  const repo = vendorRepo(input.target, input.loveVersion);
  const actions: string[] = [];
  const canReuseSteamosRuntime = input.target === 'steamos'
    && existsSync(targetPath)
    && vendorPathValid(targetPath, 'steamos')
    && !input.force;

  const alreadyExists = existsSync(targetPath) && !input.force && !canReuseSteamosRuntime;
  if (alreadyExists) {
    return {
      target: input.target,
      path: targetPath,
      relativePath,
      ref: input.ref,
      repo,
      installed: false,
      skipped: false,
      alreadyExists: true,
      configUpdated: false,
      actions: [],
    };
  }

  if (canReuseSteamosRuntime) {
    actions.push(`reuse ${relativePath} for steamos`);
  } else {
    actions.push(`${isDownloadedRuntimeTarget(input.target) ? 'download' : 'clone'} ${repo}#${input.ref} -> ${relativePath}`);
  }
  if (input.target === 'ios') {
    actions.push(`install love-${input.loveVersion}-apple-libraries.zip`);
  } else if ((input.target === 'linux' || input.target === 'steamos') && !canReuseSteamosRuntime) {
    actions.push('install appimagetool.AppImage');
  }
  if (input.updateConfig) {
    actions.push(`update ${relative(input.projectDir, input.configPath) || 'feather.build.json'}`);
  }

  if (!input.dryRun) {
    if (canReuseSteamosRuntime) {
      if (input.updateConfig) {
        updateVendorConfig(input.projectDir, input.configPath, input.raw, input.target, relativePath);
      }
    } else {
      if (!isDownloadedRuntimeTarget(input.target)) assertGitAvailable();
      const shouldCleanupOnFailure = input.force || !existsSync(targetPath);
      try {
        if (existsSync(targetPath) && input.force) removePath(targetPath);
        mkdirSync(dirname(targetPath), { recursive: true });
        if (isDownloadedRuntimeTarget(input.target)) {
          await installDesktopRuntime(input.target, input.loveVersion, targetPath);
        } else {
          cloneVendor(repo, input.ref, targetPath, input.target === 'android');
        }
        if (input.target === 'ios') {
          await installAppleLibraries(input.loveVersion, targetPath);
        }
        if (input.updateConfig) {
          updateVendorConfig(input.projectDir, input.configPath, input.raw, input.target, relativePath);
        }
      } catch (err) {
        if (shouldCleanupOnFailure) removePath(targetPath);
        throw err;
      }
    }
  }

  return {
    target: input.target,
    path: targetPath,
    relativePath,
    ref: input.ref,
    repo,
    installed: !input.dryRun && !canReuseSteamosRuntime,
    skipped: canReuseSteamosRuntime,
    alreadyExists: false,
    configUpdated: input.updateConfig && !input.dryRun,
    actions,
  };
}

function vendorStatus(projectDir: string, raw: FeatherBuildConfig, vendorDir: string, target: ConcreteBuildVendorTarget): BuildVendorListEntry {
  const configuredPath = configuredVendorPath(raw, target);
  const fallback = join(projectDir, defaultVendorRelativePath(projectDir, vendorDir, target));
  const path = configuredPath
    ? resolveProjectVendorPath(projectDir, configuredPath, `${target} vendor directory`)
    : fallback;
  const exists = existsSync(path);
  const valid = vendorPathValid(path, target);
  return {
    target,
    path,
    relativePath: relativeProjectPath(projectDir, path),
    configuredPath,
    configured: Boolean(configuredPath),
    exists,
    valid,
    detail: valid ? 'ready' : exists ? 'present but missing expected build files' : 'missing',
  };
}

function vendorRef(target: ConcreteBuildVendorTarget, options: BuildVendorAddOptions, loveVersion: string | undefined): string {
  if (target === 'web') {
    return sanitizeRef(options.webRef ?? options.ref ?? DEFAULT_LOVE_JS_REF, 'love.js vendor ref');
  }
  if (target === 'android') {
    return sanitizeRef(options.androidRef ?? options.ref ?? loveVersion ?? DEFAULT_LOVE_VERSION, 'Android vendor ref');
  }
  if (target === 'ios') {
    return sanitizeRef(options.iosRef ?? options.ref ?? loveVersion ?? DEFAULT_LOVE_VERSION, 'iOS vendor ref');
  }
  return sanitizeRef(options.ref ?? loveVersion ?? DEFAULT_LOVE_VERSION, `${target} runtime version`);
}

function defaultVendorRelativePath(projectDir: string, vendorDir: string, target: ConcreteBuildVendorTarget): string {
  const dirname = target === 'web'
    ? 'love.js'
    : target === 'android'
      ? 'love-android'
      : target === 'ios'
        ? 'love-ios'
        : target === 'steamos'
          ? 'love-linux'
          : `love-${target}`;
  return relativeProjectPath(projectDir, join(vendorDir, dirname));
}

function configuredVendorPath(raw: FeatherBuildConfig, target: ConcreteBuildVendorTarget): string | undefined {
  if (target === 'web') return raw.targets?.web?.loveJsDir;
  if (target === 'android') return raw.targets?.android?.loveAndroidDir;
  if (target === 'ios') return raw.targets?.ios?.loveIosDir;
  if (target === 'steamos') return raw.targets?.steamos?.loveRuntimeDir ?? raw.targets?.linux?.loveRuntimeDir;
  return raw.targets?.[target]?.loveRuntimeDir;
}

function vendorRepo(target: ConcreteBuildVendorTarget, loveVersion: string): string {
  if (target === 'web') return LOVE_JS_REPO;
  if (target === 'android') return LOVE_ANDROID_REPO;
  if (target === 'windows') return `${LOVE_RELEASE_BASE}/${loveVersion}/love-${loveVersion}-win64.zip`;
  if (target === 'macos') return `${LOVE_RELEASE_BASE}/${loveVersion}/love-${loveVersion}-macos.zip`;
  if (target === 'linux' || target === 'steamos') return `${LOVE_RELEASE_BASE}/${loveVersion}/love-${loveVersion}-x86_64.AppImage`;
  return LOVE_REPO;
}

function vendorPathValid(path: string, target: ConcreteBuildVendorTarget): boolean {
  if (target === 'web') {
    return existsSync(join(path, 'index.html')) && (existsSync(join(path, 'player.js')) || existsSync(join(path, 'player.min.js')));
  }
  if (target === 'android') {
    return existsSync(join(path, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')) || existsSync(join(path, 'gradlew')) || existsSync(join(path, 'gradlew.bat'));
  }
  if (target === 'ios') return existsSync(join(path, 'platform', 'xcode', 'love.xcodeproj'));
  if (target === 'windows') return existsSync(join(path, 'love.exe'));
  if (target === 'macos') return existsSync(join(path, 'love.app', 'Contents', 'Info.plist'));
  return existsSync(join(path, 'squashfs-root', 'bin', 'love')) && existsSync(join(path, 'appimagetool.AppImage'));
}

function resolveVendorDir(projectDir: string, vendorDir: string): string {
  assertSafeRelativePath(vendorDir, 'Vendor directory');
  const absolute = resolve(projectDir, vendorDir);
  assertNoSymlinkEscape(projectDir, absolute, 'Vendor directory');
  return absolute;
}

function resolveProjectVendorPath(projectDir: string, path: string, label: string): string {
  assertSafeRelativePath(path, label);
  const absolute = resolve(projectDir, path);
  assertNoSymlinkEscape(projectDir, absolute, label);
  return absolute;
}

function relativeProjectPath(projectDir: string, path: string): string {
  const relativePath = relative(projectDir, path).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..') || !isPathInside(projectDir, path)) {
    throw new Error(`Vendor path must stay inside project root: ${path}`);
  }
  return relativePath;
}

function sanitizeRef(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\0\r\n]/.test(trimmed) || trimmed.startsWith('-')) {
    throw new Error(`${label} must be a non-empty branch, tag, or version.`);
  }
  return trimmed;
}

function assertGitAvailable(): void {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error('git is required to fetch build vendors. Install git and make sure it is on PATH.');
  }
}

function cloneVendor(repo: string, ref: string, targetPath: string, recurseSubmodules: boolean): void {
  const args = ['clone'];
  if (recurseSubmodules) args.push('--recurse-submodules');
  args.push('--depth', '1', '--branch', ref, repo, targetPath);
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error) throw new Error(`git clone failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git clone failed for ${repo}`).trim());
  }
}

/**
 * Find the byte offset of the embedded SquashFS archive inside an AppImage.
 * AppImages align the SquashFS to 1-byte boundaries; we scan the first 4 MB
 * in 4-byte steps for the SquashFS v4 magic (little-endian 0x73717368 = 'sqsh').
 */
function findSquashFsOffset(filePath: string): number {
  const SQFS_MAGIC_LE = 0x73717368;
  const CHUNK = 4 * 1024 * 1024; // scan first 4 MB
  const buf = Buffer.alloc(CHUNK);
  const fd = openSync(filePath, 'r');
  const bytesRead = readSync(fd, buf, 0, CHUNK, 0);
  closeSync(fd);
  for (let i = 0; i < bytesRead - 4; i += 4) {
    if (buf.readUInt32LE(i) === SQFS_MAGIC_LE) return i;
  }
  return -1;
}

function isDownloadedRuntimeTarget(target: ConcreteBuildVendorTarget): target is 'windows' | 'macos' | 'linux' | 'steamos' {
  return target === 'windows' || target === 'macos' || target === 'linux' || target === 'steamos';
}

async function installDesktopRuntime(target: 'windows' | 'macos' | 'linux' | 'steamos', loveVersion: string, targetPath: string): Promise<void> {
  removePath(targetPath);
  mkdirSync(targetPath, { recursive: true });
  if (target === 'windows') {
    const zip = await downloadRuntimeArchive(target, loveVersion);
    extractZip(zip, targetPath, { stripRoot: true });
    return;
  }
  if (target === 'macos') {
    const zip = await downloadRuntimeArchive(target, loveVersion);
    extractZip(zip, targetPath, { stripRoot: false });
    const loveBinary = join(targetPath, 'love.app', 'Contents', 'MacOS', 'love');
    if (existsSync(loveBinary)) chmodSync(loveBinary, 0o755);
    return;
  }

  const loveAppImage = join(targetPath, 'love.AppImage');
  const appImageTool = join(targetPath, 'appimagetool.AppImage');
  await downloadRuntimeFile(runtimeUrl('linux', loveVersion), loveAppImage, 'FEATHER_TEST_LOVE_LINUX_APPIMAGE');
  await downloadRuntimeFile(APPIMAGETOOL_URL, appImageTool, 'FEATHER_TEST_APPIMAGETOOL');
  chmodSync(loveAppImage, 0o755);
  chmodSync(appImageTool, 0o755);

  const squashfsRoot = join(targetPath, 'squashfs-root');
  const result = spawnSync(loveAppImage, ['--appimage-extract'], { cwd: targetPath, encoding: 'utf8' });
  if (!result.error) {
    if (result.status === 0 && existsSync(join(squashfsRoot, 'bin', 'love'))) return;
    const offset = findSquashFsOffset(loveAppImage);
    if (offset < 0) {
      throw new Error((result.stderr || result.stdout || 'Failed to extract LÖVE AppImage.').trim());
    }
    tryExtractAppImageWithUnsquashfs(loveAppImage, squashfsRoot, targetPath, offset);
    return;
  }

  const code = (result.error as NodeJS.ErrnoException).code;
  const offset = findSquashFsOffset(loveAppImage);
  if (code !== 'ENOEXEC' && code !== 'ENOENT' && code !== 'EACCES' && offset < 0) {
    throw new Error(`Failed to extract LÖVE AppImage: ${result.error.message}`);
  }

  // Not on Linux — try unsquashfs with explicit SquashFS offset (squashfs-tools >= 4.4).
  // The macOS port doesn't auto-detect the offset, so we scan for the magic bytes ourselves.
  tryExtractAppImageWithUnsquashfs(loveAppImage, squashfsRoot, targetPath, offset);
}

function tryExtractAppImageWithUnsquashfs(loveAppImage: string, squashfsRoot: string, targetPath: string, offset: number): void {
  if (existsSync(squashfsRoot)) rmSync(squashfsRoot, { recursive: true });
  const unsquashArgs = offset >= 0
    ? ['-offset', String(offset), '-d', squashfsRoot, loveAppImage]
    : ['-d', squashfsRoot, loveAppImage];
  const us = spawnSync('unsquashfs', unsquashArgs, { cwd: targetPath, encoding: 'utf8' });
  if (!us.error && us.status === 0 && existsSync(join(squashfsRoot, 'bin', 'love'))) return;

  const detail = us.error ? us.error.message : (us.stderr || us.stdout || '').trim();
  throw new Error(
    `Cannot extract the Linux AppImage on this platform (${process.platform}).\n` +
    (detail ? `unsquashfs: ${detail}\n` : '') +
    `Install squashfs-tools and retry: brew install squashfs\n` +
    `Or run \`feather build vendor add linux\` on a Linux host.`,
  );
}

async function downloadRuntimeArchive(target: 'windows' | 'macos', loveVersion: string): Promise<Buffer> {
  const fixture = process.env[target === 'windows' ? 'FEATHER_TEST_LOVE_WINDOWS_ZIP' : 'FEATHER_TEST_LOVE_MACOS_ZIP'];
  if (fixture) return readFileSync(fixture);
  const response = await fetch(runtimeUrl(target, loveVersion));
  if (!response.ok) {
    throw new Error(`Failed to download ${runtimeUrl(target, loveVersion)}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadRuntimeFile(url: string, path: string, fixtureEnv: string): Promise<void> {
  const fixture = process.env[fixtureEnv];
  mkdirSync(dirname(path), { recursive: true });
  if (fixture) {
    cpSync(fixture, path, { force: true });
    return;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}

function runtimeUrl(target: 'windows' | 'macos' | 'linux', loveVersion: string): string {
  if (target === 'windows') return `${LOVE_RELEASE_BASE}/${encodeURIComponent(loveVersion)}/love-${encodeURIComponent(loveVersion)}-win64.zip`;
  if (target === 'macos') return `${LOVE_RELEASE_BASE}/${encodeURIComponent(loveVersion)}/love-${encodeURIComponent(loveVersion)}-macos.zip`;
  return `${LOVE_RELEASE_BASE}/${encodeURIComponent(loveVersion)}/love-${encodeURIComponent(loveVersion)}-x86_64.AppImage`;
}

function extractZip(zip: Buffer, targetPath: string, options: { stripRoot: boolean }): void {
  const entries = unzip(zip);
  const fileEntries: Array<UnzippedEntry & { normalized: string }> = entries
    .map((entry) => ({ ...entry, normalized: normalizeZipEntry(entry.name) }))
    .filter((entry): entry is UnzippedEntry & { normalized: string } => typeof entry.normalized === 'string' && entry.normalized.length > 0);
  const root = options.stripRoot ? commonRoot(fileEntries.map((entry) => entry.normalized)) : null;
  for (const entry of fileEntries) {
    const name = root ? entry.normalized.slice(root.length + 1) : entry.normalized;
    if (!name || name.endsWith('/')) continue;
    const destination = resolve(targetPath, name);
    if (!isPathInside(targetPath, destination)) {
      throw new Error(`Runtime ZIP contains an unsafe path: ${entry.name}`);
    }
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, entry.data);
  }
}

function normalizeZipEntry(name: string): string | null {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('__MACOSX/') || normalized.includes('/.__MACOSX/')) return null;
  if (normalized.startsWith('._') || normalized.includes('/._')) return null;
  return normalized;
}

function commonRoot(names: string[]): string | null {
  const roots = new Set(names.map((name) => name.split('/')[0]).filter(Boolean));
  return roots.size === 1 ? [...roots][0]! : null;
}

async function installAppleLibraries(loveVersion: string, loveIosDir: string): Promise<void> {
  const zip = await appleLibrariesZip(loveVersion);
  const entries = unzip(zip);
  let installed = 0;
  const librariesRoot = join(loveIosDir, 'platform', 'xcode', 'ios', 'libraries');
  const macosFrameworksRoot = join(loveIosDir, 'platform', 'xcode', 'macosx', 'Frameworks');
  const sharedRoot = join(loveIosDir, 'platform', 'xcode', 'shared');
  for (const entry of entries) {
    const normalized = normalizeAppleLibrariesEntry(entry.name);
    if (!normalized) continue;
    const librariesPrefix = 'iOS/libraries/';
    const macosFrameworksPrefix = 'macOS/Frameworks/';
    const sharedPrefix = 'shared/';
    let destination: string | null = null;
    let destinationRoot: string | null = null;
    if (normalized.startsWith(librariesPrefix)) {
      destinationRoot = librariesRoot;
      destination = join(librariesRoot, normalized.slice(librariesPrefix.length));
    } else if (normalized.startsWith(macosFrameworksPrefix)) {
      destinationRoot = macosFrameworksRoot;
      destination = join(macosFrameworksRoot, normalized.slice(macosFrameworksPrefix.length));
    } else if (normalized.startsWith(sharedPrefix)) {
      destinationRoot = sharedRoot;
      destination = join(sharedRoot, normalized.slice(sharedPrefix.length));
    }
    if (!destination || !destinationRoot || destination.endsWith('/') || entry.data.length === 0) continue;
    if (!isPathInside(destinationRoot, resolve(destination))) {
      throw new Error(`Apple libraries ZIP contains an unsafe path: ${entry.name}`);
    }
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, entry.data);
    installed += 1;
  }
  if (installed === 0) {
    throw new Error(`love-${loveVersion}-apple-libraries.zip did not contain Apple dependency files.`);
  }
}

function normalizeAppleLibrariesEntry(name: string): string | null {
  let normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('__MACOSX/') || normalized.includes('/.__MACOSX/')) {
    return null;
  }
  if (normalized.startsWith('love-apple-dependencies/')) {
    normalized = normalized.slice('love-apple-dependencies/'.length);
  }
  if (normalized.startsWith('._') || normalized.includes('/._')) {
    return null;
  }
  return normalized;
}

async function appleLibrariesZip(loveVersion: string): Promise<Buffer> {
  const fixture = process.env.FEATHER_TEST_LOVE_APPLE_LIBRARIES_ZIP;
  if (fixture) return readFileSync(fixture);
  const url = `https://github.com/love2d/love/releases/download/${encodeURIComponent(loveVersion)}/love-${encodeURIComponent(loveVersion)}-apple-libraries.zip`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

type UnzippedEntry = {
  name: string;
  data: Buffer;
};

function unzip(zip: Buffer): UnzippedEntry[] {
  const entries: UnzippedEntry[] = [];
  let offset = centralDirectoryOffset(zip);
  while (offset + 46 <= zip.length) {
    const signature = zip.readUInt32LE(offset);
    if (signature !== 0x02014b50) break;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported for Apple libraries.');
    }
    const nameStart = offset + 46;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = localFileDataOffset(zip, localHeaderOffset);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zip.length) throw new Error('Invalid ZIP archive.');
    const compressed = zip.subarray(dataStart, dataEnd);
    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${method}`);
    }
    if (data.length !== uncompressedSize) throw new Error(`Invalid ZIP entry size for ${name}.`);
    entries.push({ name, data });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function centralDirectoryOffset(zip: Buffer): number {
  const minOffset = Math.max(0, zip.length - 65557);
  for (let offset = zip.length - 22; offset >= minOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      return zip.readUInt32LE(offset + 16);
    }
  }
  throw new Error('Invalid ZIP archive: central directory not found.');
}

function localFileDataOffset(zip: Buffer, offset: number): number {
  if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error('Invalid ZIP archive: local file header not found.');
  }
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  if (dataOffset > zip.length) throw new Error('Invalid ZIP archive.');
  return dataOffset;
}

function updateVendorConfig(
  projectDir: string,
  configPath: string,
  raw: FeatherBuildConfig,
  target: ConcreteBuildVendorTarget,
  relativePath: string,
): void {
  const next: FeatherBuildConfig = {
    ...raw,
    targets: {
      ...(raw.targets ?? {}),
      [target]: {
        ...((raw.targets ?? {})[target] ?? {}),
        [vendorConfigKey(target)]: relativePath,
      },
    },
  };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
}

function vendorConfigKey(target: ConcreteBuildVendorTarget): 'loveJsDir' | 'loveAndroidDir' | 'loveIosDir' | 'loveRuntimeDir' {
  if (target === 'web') return 'loveJsDir';
  if (target === 'android') return 'loveAndroidDir';
  if (target === 'ios') return 'loveIosDir';
  return 'loveRuntimeDir';
}
