import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { findLoveBinary } from "../lib/love.js";
import { createShim, shimEnv } from "../lib/shim.js";
import { loadConfig } from "../lib/config.js";
import { chooseRunWorkflow } from "../ui/run-workflow.js";

export interface RunOptions {
  love?: string;
  sessionName?: string;
  noPlugins?: boolean;
  config?: string;
  featherPath?: string;
  pluginsDir?: string;
  gameArgs?: string[];
}

export async function runCommand(gamePath: string | undefined, opts: RunOptions): Promise<void> {
  if (!gamePath) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red("Game path is required. Use `feather run <game-path>`."));
      process.exit(1);
    }

    const result = await chooseRunWorkflow();
    if (result.cancelled) {
      console.log(chalk.dim("Run cancelled."));
      return;
    }

    gamePath = result.gamePath;
    opts = {
      ...opts,
      love: result.love ?? opts.love,
      sessionName: result.sessionName ?? opts.sessionName,
      noPlugins: result.noPlugins ?? opts.noPlugins,
      config: result.config ?? opts.config,
      featherPath: result.featherPath ?? opts.featherPath,
      pluginsDir: result.pluginsDir ?? opts.pluginsDir,
      gameArgs: result.gameArgs ?? opts.gameArgs,
    };
  }

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
