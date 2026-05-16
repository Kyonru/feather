import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
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
import { assertNoSymlinkEscape, assertSafeRelativePath, isPathInside } from '../path-safety.js';

export const buildVendorTargets = ['web', 'android', 'ios', 'mobile', 'all'] as const;
export type BuildVendorTargetInput = typeof buildVendorTargets[number];
export type ConcreteBuildVendorTarget = 'web' | 'android' | 'ios';

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
  configUpdated: boolean;
  actions: string[];
};

export type BuildVendorAddResult = {
  ok: true;
  projectDir: string;
  configPath: string;
  loveVersion: string;
  vendors: BuildVendorResult[];
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

export function isBuildVendorTarget(value: string): value is BuildVendorTargetInput {
  return (buildVendorTargets as readonly string[]).includes(value);
}

export async function addBuildVendors(targets: BuildVendorTargetInput[], options: BuildVendorAddOptions = {}): Promise<BuildVendorAddResult> {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const raw = readBuildConfig(projectDir, options.configPath);
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
  }

  return {
    ok: true,
    projectDir,
    configPath,
    loveVersion,
    vendors: results,
  };
}

export function listBuildVendors(options: BuildVendorListOptions = {}): BuildVendorListResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const raw = readBuildConfig(projectDir, options.configPath);
  const configPath = buildConfigPath(projectDir, options.configPath);
  const vendorDir = resolveVendorDir(projectDir, options.vendorDir ?? 'vendor');
  const vendors = (['web', 'android', 'ios'] as const).map((target) => vendorStatus(projectDir, raw, vendorDir, target));
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
  const repo = vendorRepo(input.target);
  const actions: string[] = [];

  if (existsSync(targetPath) && !input.force) {
    throw new Error(`${input.target} vendor directory already exists: ${targetPath}. Use --force to replace it.`);
  }

  actions.push(`clone ${repo}#${input.ref} -> ${relativePath}`);
  if (input.target === 'ios') {
    actions.push(`install love-${input.loveVersion}-apple-libraries.zip`);
  }
  if (input.updateConfig) {
    actions.push(`update ${relative(input.projectDir, input.configPath) || 'feather.build.json'}`);
  }

  if (!input.dryRun) {
    assertGitAvailable();
    if (existsSync(targetPath) && input.force) rmSync(targetPath, { recursive: true, force: true });
    mkdirSync(dirname(targetPath), { recursive: true });
    cloneVendor(repo, input.ref, targetPath, input.target === 'android');
    if (input.target === 'ios') {
      await installAppleLibraries(input.loveVersion, targetPath);
    }
    if (input.updateConfig) {
      updateVendorConfig(input.projectDir, input.configPath, input.raw, input.target, relativePath);
    }
  }

  return {
    target: input.target,
    path: targetPath,
    relativePath,
    ref: input.ref,
    repo,
    installed: !input.dryRun,
    skipped: false,
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
  return sanitizeRef(options.iosRef ?? options.ref ?? loveVersion ?? DEFAULT_LOVE_VERSION, 'iOS vendor ref');
}

function defaultVendorRelativePath(projectDir: string, vendorDir: string, target: ConcreteBuildVendorTarget): string {
  const dirname = target === 'web' ? 'love.js' : target === 'android' ? 'love-android' : 'love-ios';
  return relativeProjectPath(projectDir, join(vendorDir, dirname));
}

function configuredVendorPath(raw: FeatherBuildConfig, target: ConcreteBuildVendorTarget): string | undefined {
  if (target === 'web') return raw.targets?.web?.loveJsDir;
  if (target === 'android') return raw.targets?.android?.loveAndroidDir;
  return raw.targets?.ios?.loveIosDir;
}

function vendorRepo(target: ConcreteBuildVendorTarget): string {
  if (target === 'web') return LOVE_JS_REPO;
  if (target === 'android') return LOVE_ANDROID_REPO;
  return LOVE_REPO;
}

function vendorPathValid(path: string, target: ConcreteBuildVendorTarget): boolean {
  if (target === 'web') {
    return existsSync(join(path, 'index.html')) && (existsSync(join(path, 'player.js')) || existsSync(join(path, 'player.min.js')));
  }
  if (target === 'android') {
    return existsSync(join(path, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')) || existsSync(join(path, 'gradlew')) || existsSync(join(path, 'gradlew.bat'));
  }
  return existsSync(join(path, 'platform', 'xcode', 'love.xcodeproj'));
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

async function installAppleLibraries(loveVersion: string, loveIosDir: string): Promise<void> {
  const zip = await appleLibrariesZip(loveVersion);
  const entries = unzip(zip);
  let installed = 0;
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const librariesPrefix = 'iOS/libraries/';
    const sharedPrefix = 'shared/';
    let destination: string | null = null;
    if (normalized.startsWith(librariesPrefix)) {
      destination = join(loveIosDir, 'platform', 'xcode', 'ios', 'libraries', normalized.slice(librariesPrefix.length));
    } else if (normalized.startsWith(sharedPrefix)) {
      destination = join(loveIosDir, 'platform', 'xcode', 'shared', normalized.slice(sharedPrefix.length));
    }
    if (!destination || destination.endsWith('/') || entry.data.length === 0) continue;
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, entry.data);
    installed += 1;
  }
  if (installed === 0) {
    throw new Error(`love-${loveVersion}-apple-libraries.zip did not contain iOS/libraries or shared files.`);
  }
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
  let offset = 0;
  while (offset + 30 <= zip.length) {
    const signature = zip.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const flags = zip.readUInt16LE(offset + 6);
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const uncompressedSize = zip.readUInt32LE(offset + 22);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    if (flags & 0x08) {
      throw new Error('ZIP entries with data descriptors are not supported.');
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zip.length) throw new Error('Invalid ZIP archive.');
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8');
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
    offset = dataEnd;
  }
  return entries;
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

function vendorConfigKey(target: ConcreteBuildVendorTarget): 'loveJsDir' | 'loveAndroidDir' | 'loveIosDir' {
  if (target === 'web') return 'loveJsDir';
  if (target === 'android') return 'loveAndroidDir';
  return 'loveIosDir';
}
