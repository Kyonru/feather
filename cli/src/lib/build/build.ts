import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoSymlinkEscape } from '../path-safety.js';
import {
  artifactBaseName,
  fileSize,
  latestManifestPath,
  listProjectFiles,
  removePath,
  stageProject,
  writeJson,
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
import { buildWeb } from './web.js';
import { buildAndroid } from './android.js';
import { buildIos } from './ios.js';
import { buildDesktop } from './desktop.js';
import { assertBuildConfigValidForTarget } from './validation.js';
import type { NativeBuildLogger, NativeCacheInfo } from './native.js';
import { embedMobileDebuggerStage } from './debug-stage.js';

export type BuildOptions = LoadBuildConfigOptions & {
  target: BuildTarget;
  clean?: boolean;
  dryRun?: boolean;
  allowUnsafe?: boolean;
  release?: boolean;
  noCache?: boolean;
  debugger?: boolean;
  embedDebugger?: boolean;
  runtimeConfigPath?: string;
  noPlugins?: boolean;
  featherOverride?: string;
  pluginsOverride?: string;
  verbose?: boolean;
  log?: NativeBuildLogger;
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
  cache?: NativeCacheInfo;
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
  assertReleaseTargetSupported(options.target, Boolean(options.release));
  assertBuildConfigValidForTarget(config, options.target, Boolean(options.release));
  return {
    ok: true,
    dryRun: true,
    target: options.target,
    projectDir: config.projectDir,
    outDir: config.outDir,
    name: config.name,
    version: config.version,
    files: listProjectFiles(config),
    artifacts: plannedArtifacts(config, options.target, Boolean(options.release)),
    manifestPath: latestManifestPath(config.outDir),
  };
}

export function runBuild(options: BuildOptions): BuildResult {
  try {
    assertBuildTargetSupported(options.target);
    assertReleaseTargetSupported(options.target, Boolean(options.release));
    const config = loadBuildConfig(options);
    assertBuildConfigValidForTarget(config, options.target, Boolean(options.release));
    assertProductionBuildSafe(config, options.allowUnsafe);
    assertNoSymlinkEscape(config.projectDir, config.outDir, 'Build output directory');

    if (options.dryRun) return planBuild(options);
    const log = options.verbose ? options.log : undefined;
    const mobileDevBuild = (options.target === 'android' || options.target === 'ios') && !options.release;
    const debuggerEmbedBuild = options.embedDebugger === true || mobileDevBuild;
    if (options.clean && mobileDevBuild && !options.noCache) {
      log?.('Build cache: reset by --clean');
    }
    if (options.clean) removePath(config.outDir);
    mkdirSync(config.outDir, { recursive: true });

    const staged = stageProject(config);
    log?.(`Staged ${staged.files.length} files from ${config.sourceDir}`);
    try {
      let cache: NativeCacheInfo | undefined;
      const debugStage = debuggerEmbedBuild
        ? embedMobileDebuggerStage(config, staged.dir, {
            enabled: options.debugger !== false,
            runtimeConfigPath: options.runtimeConfigPath,
            noPlugins: options.noPlugins,
            featherOverride: options.featherOverride,
            pluginsOverride: options.pluginsOverride,
          })
        : undefined;
      if (debugStage?.enabled) {
        log?.(`Embedded Feather debugger runtime${debugStage.configPath ? ` with ${debugStage.configPath}` : ' with generated dev config'}`);
      } else if (debuggerEmbedBuild) {
        log?.('Feather debugger embedding: disabled');
      }
      const artifacts = options.target === 'web'
        ? buildWeb(config, staged.dir)
        : options.target === 'android'
          ? buildAndroid(config, staged.dir, {
              release: Boolean(options.release),
              cache: !options.noCache,
              debuggerSignature: debugStage?.signature,
              verbose: options.verbose,
              log,
              onCache: (info) => { cache = info; },
            })
          : options.target === 'ios'
            ? buildIos(config, staged.dir, {
                release: Boolean(options.release),
                cache: !options.noCache,
                debuggerSignature: debugStage?.signature,
                verbose: options.verbose,
                log,
                onCache: (info) => { cache = info; },
              })
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
        cache,
      };
    } finally {
      staged.cleanup();
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function assertReleaseTargetSupported(target: BuildTarget, release: boolean): void {
  if (release && target !== 'android' && target !== 'ios') {
    throw new Error('Release mode is currently supported only for android and ios builds.');
  }
}

function plannedArtifacts(config: ResolvedBuildConfig, target: BuildTarget, release = false): BuildArtifact[] {
  const base = artifactBaseName(config);
  if (target === 'web') {
    return [
      { target, type: 'love', path: join(config.outDir, `${base}.love`) },
      { target, type: 'html', path: join(config.outDir, `${base}-html`) },
      { target, type: 'zip', path: join(config.outDir, `${base}-html.zip`) },
    ];
  }
  if (target === 'android') {
    if (release) {
      return [
        { target, type: 'love', path: join(config.outDir, `${base}.love`) },
        { target, type: 'aab', path: join(config.outDir, `${base}-android.aab`) },
        { target, type: 'apk', path: join(config.outDir, `${base}-android.apk`) },
      ];
    }
    return [
      { target, type: 'love', path: join(config.outDir, `${base}.love`) },
      { target, type: 'apk', path: join(config.outDir, `${base}-android.apk`) },
    ];
  }
  if (target === 'ios') {
    if (release) {
      return [
        { target, type: 'love', path: join(config.outDir, `${base}.love`) },
        { target, type: 'xcarchive', path: join(config.outDir, `${base}-ios.xcarchive`) },
        { target, type: 'ipa', path: join(config.outDir, `${base}-ios.ipa`) },
      ];
    }
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

export function describeArtifact(artifact: BuildArtifact): string {
  const size = existsSync(artifact.path) && artifact.type !== 'html' && artifact.type !== 'external'
    ? ` (${fileSize(artifact.path)} bytes)`
    : '';
  return `${artifact.type}: ${artifact.path}${size}`;
}
