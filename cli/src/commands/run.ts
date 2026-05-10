import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { findLoveBinary } from "../lib/love.js";
import { createShim, shimEnv } from "../lib/shim.js";
import { loadConfig } from "../lib/config.js";

export interface RunOptions {
  love?: string;
  sessionName?: string;
  noPlugins?: boolean;
  config?: string;
  featherPath?: string;
  pluginsDir?: string;
  gameArgs?: string[];
}

export function runCommand(gamePath: string, opts: RunOptions): void {
  const absGame = resolve(gamePath);

  if (!existsSync(absGame)) {
    console.error(chalk.red(`Game path not found: ${absGame}`));
    process.exit(1);
  }

  if (!existsSync(`${absGame}/main.lua`)) {
    console.error(chalk.red(`No main.lua found in: ${absGame}`));
    process.exit(1);
  }

  let loveBin: string;
  try {
    loveBin = findLoveBinary(opts.love);
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }

  const userConfig = loadConfig(absGame, opts.config) ?? undefined;
  const sessionName = opts.sessionName ?? (userConfig?.sessionName as string | undefined);

  const shim = createShim({
    gamePath: absGame,
    sessionName,
    noPlugins: opts.noPlugins,
    featherOverride: opts.featherPath,
    pluginsOverride: opts.pluginsDir,
    userConfig: userConfig as Record<string, unknown> | undefined,
  });

  console.log(chalk.dim(`[feather] shim → ${shim.dir}`));
  console.log(chalk.cyan(`[feather] running ${absGame}`));
  if (opts.gameArgs && opts.gameArgs.length > 0) {
    console.log(chalk.dim(`[feather] args → ${opts.gameArgs.join(" ")}`));
  }

  const env = shimEnv(absGame, sessionName);

  const result = spawnSync(loveBin, [shim.dir, ...(opts.gameArgs ?? [])], {
    stdio: "inherit",
    env,
  });

  shim.cleanup();

  if (result.error) {
    console.error(chalk.red(`Failed to launch love: ${result.error.message}`));
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}
