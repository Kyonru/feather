import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { join, relative } from 'node:path';
import { loadConfig } from '../config.js';
import { findLoveBinary } from '../love.js';
import { createShim, shimEnv, type Shim } from '../shim.js';
import { loadBuildConfig, type LoadBuildConfigOptions } from '../build/config.js';
import { runBuild } from '../build/build.js';
import { embedMobileDebuggerStage } from '../build/debug-stage.js';
import { artifactBaseName, stageProject, writeLoveArchive } from '../build/files.js';
import { maybeAdHocCodesign } from '../build/ios.js';
import { printKeyValues, printMuted, printStatus, printWarning } from '../output.js';
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

export type DesktopWatchOptions = {
  love?: string;
  sessionName?: string;
  debounce?: number;
  restart?: boolean;
  noPlugins?: boolean;
  debugger?: boolean;
  config?: string;
  featherOverride?: string;
  pluginsOverride?: string;
};

export type SteamosWatchOptions = LoadBuildConfigOptions & {
  debounce?: number;
  verbose?: boolean;
};

type SourceWatcher = {
  close: () => void;
};

export function runDesktopWatch(gameDir: string, options: DesktopWatchOptions = {}): void {
  const debounceMs = options.debounce ?? 500;
  const restart = options.restart !== false;
  const debuggerEnabled = options.debugger !== false;
  const userConfig = loadConfig(gameDir, options.config) ?? undefined;
  const loveBin = findLoveBinary(options.love);
  const sessionName = options.sessionName ?? (userConfig?.sessionName as string | undefined);

  printStatus('info', 'Feather watch desktop');
  printKeyValues([
    ['Game', gameDir],
    ['Debugger', debuggerEnabled ? 'enabled' : 'disabled'],
    ['Restart', restart ? 'on change' : 'disabled'],
  ]);

  let current: ChildProcess | null = null;
  let currentShim: Shim | null = null;
  let restarting = false;

  function cleanupCurrent() {
    currentShim?.cleanup();
    currentShim = null;
  }

  function launch() {
    cleanupCurrent();
    const args: string[] = [];
    const env = debuggerEnabled ? shimEnv(gameDir, sessionName) : process.env;

    if (debuggerEnabled) {
      currentShim = createShim({
        gamePath: gameDir,
        sessionName,
        noPlugins: options.noPlugins,
        featherOverride: options.featherOverride,
        pluginsOverride: options.pluginsOverride,
        userConfig: userConfig as Record<string, unknown> | undefined,
      });
      args.push(currentShim.dir);
    } else {
      args.push(gameDir);
    }

    current = spawn(loveBin, args, {
      stdio: 'inherit',
      env,
    });
    current.once('exit', () => {
      if (!restarting) {
        cleanupCurrent();
        current = null;
      }
    });
    current.once('error', (err) => {
      printWarning(`Failed to launch love: ${err.message}`);
      cleanupCurrent();
      current = null;
    });
  }

  function stopAndLaunch() {
    if (!restart) {
      printStatus('info', 'Change detected; restart disabled.');
      return;
    }

    if (!current || current.exitCode !== null || current.signalCode !== null) {
      launch();
      printStatus('success', 'Restarted game');
      return;
    }

    restarting = true;
    current.once('exit', () => {
      restarting = false;
      launch();
      printStatus('success', 'Restarted game');
    });
    current.kill('SIGTERM');
    setTimeout(() => {
      if (current && current.exitCode === null && current.signalCode === null) current.kill('SIGKILL');
    }, 2000).unref();
  }

  launch();
  const sourceWatcher = watchSource(gameDir, gameDir, debounceMs, stopAndLaunch);
  printStatus('success', `Watching ${gameDir}`);

  const shutdown = () => {
    sourceWatcher.close();
    if (current && current.exitCode === null && current.signalCode === null) current.kill('SIGTERM');
    cleanupCurrent();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function runSteamosWatch(gameDir: string, options: SteamosWatchOptions): void {
  const log: NativeBuildLogger | undefined = options.verbose ? printMuted : undefined;
  const debounceMs = options.debounce ?? 500;
  const config = loadBuildConfig({
    projectDir: gameDir,
    configPath: options.configPath,
    sourceDir: options.sourceDir,
    outDir: options.outDir,
  });
  let building = false;

  printStatus('info', 'Feather watch SteamOS');
  printWarning('SteamOS Devkit notification pings local server http://localhost:32010/post_event; this is how the SteamOS Devkit Client receives build updates.');

  function buildAndNotify() {
    if (building) return;
    building = true;
    try {
      const result = runBuild({
        target: 'steamos',
        projectDir: options.projectDir ?? gameDir,
        configPath: options.configPath,
        sourceDir: options.sourceDir,
        outDir: options.outDir,
        allowUnsafe: true,
        verbose: options.verbose,
        log,
      });
      if (!result.ok) {
        printWarning(`SteamOS build failed: ${result.error}`);
        return;
      }

      const tar = result.artifacts.find((artifact) => artifact.type === 'tar.gz');
      printStatus('success', `Built SteamOS package${tar ? `: ${tar.path}` : ''}`);
      void notifySteamosDevkitBuild(steamosDevkitBuildName(result.name)).then((notified) => {
        if (notified) {
          printStatus('success', 'Notified SteamOS Devkit Client');
        } else {
          printWarning('SteamOS Devkit Client was not reachable on localhost:32010; package is ready in builds/.');
        }
      });
    } finally {
      building = false;
    }
  }

  buildAndNotify();
  const sourceWatcher = watchSource(config.sourceDir, config.outDir, debounceMs, buildAndNotify);
  printStatus('success', `Watching ${config.sourceDir}`);

  const shutdown = () => {
    sourceWatcher.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

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
  let rebuilding = false;

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

  const sourceWatcher = watchSource(sourceDir, config.outDir, debounceMs, rebuild);
  printStatus('success', `Watching ${sourceDir}`);

  const shutdown = () => {
    sourceWatcher.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function steamosDevkitBuildName(name: string): string {
  return name.trim().replace(/\s+/g, '-') || 'game';
}

export async function notifySteamosDevkitBuild(
  name: string,
  url = process.env.FEATHER_STEAMOS_DEVKIT_URL ?? 'http://localhost:32010/post_event',
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'build',
        status: 'success',
        name,
      }),
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function watchSource(sourceDir: string, outDir: string, debounceMs: number, onChange: () => void): SourceWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  let sourceSnapshot = snapshotSource(sourceDir, outDir);

  function scheduleChange() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChange, debounceMs);
  }

  function onSourceChanged(filename?: string | Buffer | null) {
    if (!filename) return;
    const relativePath = filename.toString();
    if (shouldIgnoreWatchPath(relativePath, sourceDir, outDir)) return;
    scheduleChange();
  }

  function startPolling() {
    if (pollTimer) return;
    printWarning('Native file watching is unavailable; falling back to polling.');
    pollTimer = setInterval(() => {
      const nextSnapshot = snapshotSource(sourceDir, outDir);
      if (nextSnapshot !== sourceSnapshot) {
        sourceSnapshot = nextSnapshot;
        scheduleChange();
      }
    }, Math.max(250, debounceMs));
  }

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

  return {
    close: () => {
      watcher?.close();
      if (pollTimer) clearInterval(pollTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
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
