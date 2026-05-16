import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertNoSymlinkEscape } from '../path-safety.js';
import {
  artifactBaseName,
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

function buildDesktop(config: ResolvedBuildConfig, target: SupportedBuildTarget, stageDir: string): BuildArtifact[] {
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
