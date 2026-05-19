import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { assertNoSymlinkEscape, assertSafeRelativePath, isPathInside } from '../path-safety.js';

export const buildTargets = ['love', 'web', 'android', 'ios', 'windows', 'macos', 'linux', 'steamos'] as const;
export const supportedBuildTargets = ['love', 'web', 'android', 'ios', 'windows', 'macos', 'linux', 'steamos'] as const;
export const uploadTargets = ['itch', 'steam'] as const;

export type BuildTarget = typeof buildTargets[number];
export type SupportedBuildTarget = typeof supportedBuildTargets[number];
export type UploadTarget = typeof uploadTargets[number];

export type AndroidBuildTargetConfig = {
  productId?: string;
  loveAndroidDir?: string;
  displayName?: string;
  orientation?: string;
  recordAudio?: boolean;
  versionCode?: number;
  versionName?: string;
  gradleTask?: string;
  artifactPath?: string;
  release?: {
    bundleTask?: string;
    apkTask?: string;
    bundleArtifactPath?: string;
    apkArtifactPath?: string;
    keystorePath?: string;
    keyAlias?: string;
    storePasswordEnv?: string;
    keyPasswordEnv?: string;
  };
};

export type IosBuildTargetConfig = {
  productId?: string;
  loveIosDir?: string;
  bundleIdentifier?: string;
  displayName?: string;
  scheme?: string;
  configuration?: string;
  sdk?: string;
  simulatorArch?: string;
  deploymentTarget?: string;
  derivedDataPath?: string;
  teamId?: string;
  release?: {
    archivePath?: string;
    exportPath?: string;
    exportOptionsPlist?: string;
    exportMethod?: string;
    signingStyle?: string;
    provisioningProfileSpecifier?: string;
    teamId?: string;
    configuration?: string;
    sdk?: string;
  };
};

export type DesktopRuntimeBuildTargetConfig = {
  loveRuntimeDir?: string;
};

export type FeatherBuildConfig = {
  name?: string;
  version?: string;
  loveVersion?: string;
  productId?: string;
  description?: string;
  company?: string;
  website?: string;
  copyright?: string;
  sourceDir?: string;
  outDir?: string;
  include?: string[];
  exclude?: string[];
  icon?: string;
  includeRuntime?: boolean;
  targets?: {
    web?: {
      loveJsDir?: string;
      title?: string;
      outputName?: string;
    };
    windows?: DesktopRuntimeBuildTargetConfig;
    macos?: DesktopRuntimeBuildTargetConfig;
    linux?: DesktopRuntimeBuildTargetConfig;
    steamos?: DesktopRuntimeBuildTargetConfig;
    android?: AndroidBuildTargetConfig;
    ios?: IosBuildTargetConfig;
  };
  upload?: {
    itch?: {
      project?: string;
      channels?: Record<string, string>;
    };
  };
};

export type ResolvedBuildConfig = {
  configPath: string;
  projectDir: string;
  sourceDir: string;
  outDir: string;
  name: string;
  version: string;
  loveVersion?: string;
  productId?: string;
  description?: string;
  company?: string;
  website?: string;
  copyright?: string;
  include: string[];
  exclude: string[];
  icon?: string;
  includeRuntime: boolean;
  targets: NonNullable<FeatherBuildConfig['targets']>;
  upload: NonNullable<FeatherBuildConfig['upload']>;
};

export type LoadBuildConfigOptions = {
  projectDir?: string;
  configPath?: string;
  sourceDir?: string;
  outDir?: string;
  name?: string;
  version?: string;
};

const DEFAULT_EXCLUDES = [
  '.git',
  'node_modules',
  '.featherlog',
  'feather',
  'feather.config.lua',
  'feather.lock.json',
  'feather.build.json',
];

export function isBuildTarget(value: string): value is BuildTarget {
  return (buildTargets as readonly string[]).includes(value);
}

export function isSupportedBuildTarget(value: BuildTarget): value is SupportedBuildTarget {
  return (supportedBuildTargets as readonly string[]).includes(value);
}

export function isUploadTarget(value: string): value is UploadTarget {
  return (uploadTargets as readonly string[]).includes(value);
}

export function buildConfigPath(projectDir: string, configPath?: string): string {
  return configPath ? resolve(projectDir, configPath) : join(projectDir, 'feather.build.json');
}

export function readBuildConfig(projectDir: string, configPath?: string): FeatherBuildConfig {
  const path = buildConfigPath(projectDir, configPath);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Config root must be an object.');
    }
    return parsed as FeatherBuildConfig;
  } catch (err) {
    throw new Error(`Invalid feather.build.json: ${(err as Error).message}`, { cause: err });
  }
}

function stringArray(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function projectPath(projectDir: string, value: string | undefined, fallback: string, label: string): string {
  const relative = value?.trim() || fallback;
  assertSafeRelativePath(relative, label);
  const absolute = resolve(projectDir, relative);
  assertNoSymlinkEscape(projectDir, absolute, label);
  return absolute;
}

export function loadBuildConfig(options: LoadBuildConfigOptions = {}): ResolvedBuildConfig {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const raw = readBuildConfig(projectDir, options.configPath);
  const configPath = buildConfigPath(projectDir, options.configPath);
  const name = (options.name ?? raw.name ?? basename(projectDir)).trim();
  const version = (options.version ?? raw.version ?? '0.1.0').trim();
  if (!name) throw new Error('Build name must not be empty.');
  if (!version) throw new Error('Build version must not be empty.');

  const sourceDir = projectPath(projectDir, options.sourceDir ?? raw.sourceDir, '.', 'Build source directory');
  const outDir = projectPath(projectDir, options.outDir ?? raw.outDir, 'builds', 'Build output directory');
  const outRel = isPathInside(projectDir, outDir) ? outDirRelative(projectDir, outDir) : '';
  const includeRuntime = Boolean(raw.includeRuntime);
  const exclude = [
    ...DEFAULT_EXCLUDES.filter((item) => includeRuntime ? item !== 'feather' : true),
    ...(outRel ? [outRel] : []),
    ...stringArray(raw.exclude, 'exclude'),
  ];

  return {
    configPath,
    projectDir,
    sourceDir,
    outDir,
    name,
    version,
    loveVersion: raw.loveVersion,
    productId: raw.productId,
    description: raw.description,
    company: raw.company,
    website: raw.website,
    copyright: raw.copyright,
    include: stringArray(raw.include, 'include'),
    exclude,
    icon: raw.icon,
    includeRuntime,
    targets: raw.targets ?? {},
    upload: raw.upload ?? {},
  };
}

export function outDirWritableDetail(outDir: string): { ok: boolean; detail: string } {
  const target = existsSync(outDir) ? outDir : dirname(outDir);
  try {
    accessSync(target, constants.W_OK);
    return { ok: true, detail: outDir };
  } catch {
    return { ok: false, detail: `${target} is not writable` };
  }
}

function outDirRelative(projectDir: string, outDir: string): string {
  return resolve(outDir).slice(resolve(projectDir).length + 1).replace(/\\/g, '/');
}
