import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { join, relative } from 'node:path';
import { loadBuildConfig, type LoadBuildConfigOptions } from '../build/config.js';
import { embedMobileDebuggerStage } from '../build/debug-stage.js';
import { artifactBaseName, stageProject, writeLoveArchive } from '../build/files.js';
import { maybeAdHocCodesign } from '../build/ios.js';
import { printMuted, printStatus, printWarning } from '../output.js';
import type { NativeBuildLogger } from '../build/native.js';
import {
  androidExternalGamePath,
  runAdb,
  runXcrun,
  runXcrunOptional,
  type MobileRunTarget,
  runMobile,
} from './mobile.js';

export type WatchOptions = LoadBuildConfigOptions & {
  target: MobileRunTarget;
  device?: string;
  debounce?: number;
  restart?: boolean;
  noPlugins?: boolean;
  featherOverride?: string;
  pluginsOverride?: string;
  runtimeConfigPath?: string;
  adbReverse?: boolean;
  port?: number;
  verbose?: boolean;
};

export function runWatch(gameDir: string, options: WatchOptions): void {
  const log: NativeBuildLogger | undefined = options.verbose ? printMuted : undefined;
  const debounceMs = options.debounce ?? 500;
  const restart = options.restart !== false;

  printStatus('info', `Feather watch ${options.target}`);

  // Initial build + install so the app is on the device before we start watching
  const initialResult = runMobile({
    target: options.target,
    projectDir: gameDir,
    configPath: options.configPath,
    sourceDir: options.sourceDir,
    outDir: options.outDir,
    device: options.device,
    debugger: true,
    runtimeConfigPath: options.runtimeConfigPath,
    noPlugins: options.noPlugins,
    featherOverride: options.featherOverride,
    pluginsOverride: options.pluginsOverride,
    adbReverse: options.adbReverse !== false,
    port: options.port,
    allowUnsafe: true,
    verbose: options.verbose,
    log,
  } as Parameters<typeof runMobile>[0]);

  const config = loadBuildConfig({
    projectDir: gameDir,
    configPath: options.configPath,
    sourceDir: options.sourceDir,
    outDir: options.outDir,
  });

  const base = artifactBaseName(config);
  const appId = initialResult.appId;
  const device = initialResult.device === 'default' ? options.device : initialResult.device;

  // For iOS we need the .app path that was built initially
  const appPath = options.target === 'ios' ? initialResult.artifact : undefined;

  const sourceDir = config.sourceDir;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let rebuilding = false;
  let sourceSnapshot = snapshotSource(sourceDir, config.outDir);
  printStatus('success', `Watching ${sourceDir}`);

  function scheduleRebuild() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rebuild, debounceMs);
  }

  function rebuild() {
    if (rebuilding) return;
    rebuilding = true;
    const staged = stageProject(config);
    try {
      embedMobileDebuggerStage(config, staged.dir, {
        enabled: true,
        runtimeConfigPath: options.runtimeConfigPath,
        noPlugins: options.noPlugins,
        featherOverride: options.featherOverride,
        pluginsOverride: options.pluginsOverride,
      });
      mkdirSync(config.outDir, { recursive: true });
      const lovePath = writeLoveArchive(staged.dir, config.outDir, base);

      if (options.target === 'android') {
        runAdb(device, ['push', lovePath, androidExternalGamePath(appId)], 'Android push game.love failed.', log);
        if (restart) {
          runAdb(device, ['shell', 'am', 'force-stop', appId], 'Android force-stop failed.', log);
          runAdb(
            device,
            ['shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1'],
            'Android launch failed.',
            log,
          );
        }
      } else if (appPath) {
        cpSync(lovePath, join(appPath, 'game.love'), { force: true });
        maybeAdHocCodesign(appPath, log);
        if (restart) {
          runXcrunOptional(['simctl', 'terminate', device ?? 'booted', appId], log);
          runXcrun(['simctl', 'launch', device ?? 'booted', appId], 'iOS simulator launch failed.', log);
        }
      }

      printStatus('success', 'Pushed game.love');
    } catch (err) {
      printWarning(`Watch rebuild failed: ${(err as Error).message}`);
    } finally {
      staged.cleanup();
      rebuilding = false;
    }
  }

  function onSourceChanged(filename?: string | Buffer | null) {
    if (!filename) return;
    const relativePath = filename.toString();
    if (shouldIgnoreWatchPath(relativePath, sourceDir, config.outDir)) return;
    scheduleRebuild();
  }

  function startPolling() {
    if (pollTimer) return;
    printWarning('Native file watching is unavailable; falling back to polling.');
    pollTimer = setInterval(() => {
      const nextSnapshot = snapshotSource(sourceDir, config.outDir);
      if (nextSnapshot !== sourceSnapshot) {
        sourceSnapshot = nextSnapshot;
        scheduleRebuild();
      }
    }, Math.max(250, debounceMs));
  }

  let watcher: ReturnType<typeof watch> | undefined;
  try {
    watcher = watch(sourceDir, { recursive: true }, (_event, filename) => onSourceChanged(filename));
    watcher.on('error', (err: NodeJS.ErrnoException) => {
      watcher?.close();
      watcher = undefined;
      if (err.code === 'EMFILE' || err.code === 'ENOSPC' || err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
        startPolling();
        return;
      }
      printWarning(`File watch failed: ${err.message}`);
      startPolling();
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
      printWarning(`File watch failed: ${(err as Error).message}`);
    }
    startPolling();
  }

  process.on('SIGINT', () => {
    watcher?.close();
    if (pollTimer) clearInterval(pollTimer);
    process.exit(0);
  });
}

function shouldIgnoreWatchPath(path: string, sourceDir: string, outDir: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('.') || normalized.includes('/.')) return true;
  if (normalized.includes('node_modules') || normalized.includes('.feather-cache')) return true;
  const outRelative = relative(sourceDir, outDir).replace(/\\/g, '/');
  return Boolean(outRelative && !outRelative.startsWith('..') && !outRelative.startsWith('/') && (
    normalized === outRelative || normalized.startsWith(`${outRelative}/`)
  ));
}

function snapshotSource(sourceDir: string, outDir: string): string {
  const entries: string[] = [];
  collectSnapshotEntries(sourceDir, sourceDir, outDir, entries);
  return entries.sort().join('\n');
}

function collectSnapshotEntries(root: string, current: string, outDir: string, entries: string[]): void {
  if (!existsSync(current)) return;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const relativePath = relative(root, path);
    if (shouldIgnoreWatchPath(relativePath, root, outDir)) continue;
    if (entry.isDirectory()) {
      collectSnapshotEntries(root, path, outDir, entries);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = statSync(path);
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    entries.push(`${relativePath}:${stat.mtimeMs}:${stat.size}:${hash}`);
  }
}
