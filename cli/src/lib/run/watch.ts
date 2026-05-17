import { cpSync, mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
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
  printStatus('success', `Watching ${sourceDir}`);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let rebuilding = false;

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

  const watcher = watch(sourceDir, { recursive: true }, (event, filename) => {
    if (!filename) return;
    // Ignore outDir, cache, and hidden dirs
    if (filename.startsWith('.') || filename.includes('node_modules') || filename.includes('.feather-cache')) return;
    scheduleRebuild();
  });

  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
}
