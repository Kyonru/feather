import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fail } from '../lib/command.js';
import { runWatch } from '../lib/run/watch.js';
import { resolveRunBuildContext } from './run.js';
import type { MobileRunTarget } from '../lib/run/mobile.js';

export interface WatchCommandOptions {
  target?: MobileRunTarget;
  device?: string;
  debounce?: number;
  restart?: boolean;
  buildConfig?: string;
  outDir?: string;
  noPlugins?: boolean;
  featherPath?: string;
  pluginsDir?: string;
  runtimeConfig?: string;
  adbReverse?: boolean;
  port?: number;
  verbose?: boolean;
}

export function watchCommand(gamePath: string | undefined, opts: WatchCommandOptions): void {
  const target = (opts.target ?? 'android') as MobileRunTarget;
  if (!['android', 'ios'].includes(target)) {
    fail('Watch target must be one of: android, ios.');
  }
  if (opts.port !== undefined && (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535)) {
    fail('Port must be a number between 1 and 65535.');
  }
  if (opts.debounce !== undefined && (!Number.isInteger(opts.debounce) || opts.debounce < 0)) {
    fail('Debounce must be a non-negative integer.');
  }

  const gamePathArg = gamePath ?? process.cwd();
  const absGame = resolve(gamePathArg);

  if (!existsSync(absGame)) {
    fail(`Game path not found: ${absGame}`);
  }
  if (!existsSync(`${absGame}/main.lua`)) {
    fail(`No main.lua found in: ${absGame}`);
  }

  const buildContext = resolveRunBuildContext(absGame, opts.buildConfig);

  runWatch(buildContext.projectDir, {
    target,
    projectDir: buildContext.projectDir,
    configPath: buildContext.configPath,
    sourceDir: buildContext.sourceDir,
    outDir: opts.outDir,
    device: opts.device,
    debounce: opts.debounce,
    restart: opts.restart,
    noPlugins: opts.noPlugins,
    featherOverride: opts.featherPath,
    pluginsOverride: opts.pluginsDir,
    runtimeConfigPath: opts.runtimeConfig,
    adbReverse: opts.adbReverse,
    port: opts.port,
    verbose: opts.verbose,
  });
}
