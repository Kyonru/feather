import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findLoveBinary } from "../lib/love.js";
import { createShim, shimEnv } from "../lib/shim.js";
import { loadConfig } from "../lib/config.js";
import { chooseRunWorkflow } from "../ui/run-workflow.js";
import { fail } from "../lib/command.js";
import { printInfo, printKeyValues, printMuted } from "../lib/output.js";

export interface RunOptions {
  love?: string;
  sessionName?: string;
  noPlugins?: boolean;
  config?: string;
  featherPath?: string;
  pluginsDir?: string;
  gameArgs?: string[];
}

export async function runCommand(gamePath: string | undefined, opts: RunOptions): Promise<void | number> {
  if (!gamePath) {
    if (!process.stdin.isTTY) {
      fail("Game path is required. Use `feather run <game-path>`.");
    }

    const result = await chooseRunWorkflow();
    if (result.cancelled) {
      printMuted("Run cancelled.");
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
    fail(`Game path not found: ${absGame}`);
  }

  if (!existsSync(`${absGame}/main.lua`)) {
    fail(`No main.lua found in: ${absGame}`);
  }

  let loveBin: string;
  try {
    loveBin = findLoveBinary(opts.love);
  } catch (err) {
    fail((err as Error).message, { cause: err });
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

  printInfo("Feather run");
  printKeyValues([
    ["Game", absGame],
    ["Shim", shim.dir],
    ["Args", opts.gameArgs?.join(" ")],
  ]);

  const env = shimEnv(absGame, sessionName);

  const result = spawnSync(loveBin, [shim.dir, ...(opts.gameArgs ?? [])], {
    stdio: "inherit",
    env,
  });

  shim.cleanup();

  if (result.error) {
    fail(`Failed to launch love: ${result.error.message}`, { cause: result.error });
  }

  return result.status ?? 0;
}
