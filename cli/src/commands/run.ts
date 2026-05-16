import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { findLoveBinary } from "../lib/love.js";
import { createShim, shimEnv } from "../lib/shim.js";
import { loadConfig } from "../lib/config.js";
import { chooseRunWorkflow } from "../ui/run-workflow.js";
import { fail } from "../lib/command.js";
import { printInfo, printKeyValues, printMuted, printStatus } from "../lib/output.js";
import { runMobile, type MobileRunTarget } from "../lib/run/mobile.js";
import { runWeb } from "../lib/run/web.js";
import { isPathInside } from "../lib/path-safety.js";

export interface RunOptions {
  love?: string;
  sessionName?: string;
  noPlugins?: boolean;
  debugger?: boolean;
  config?: string;
  featherPath?: string;
  pluginsDir?: string;
  gameArgs?: string[];
  target?: "desktop" | "web" | MobileRunTarget;
  device?: string;
  buildConfig?: string;
  outDir?: string;
  clean?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  webHost?: string;
  webPort?: number;
  adbReverse?: boolean;
  port?: number;
}

export async function runCommand(gamePath: string | undefined, opts: RunOptions): Promise<void | number> {
  const target = opts.target ?? "desktop";
  const debuggerEnabled = opts.debugger !== false;
  if (!["desktop", "web", "android", "ios"].includes(target)) {
    fail("Run target must be one of: desktop, web, android, ios.");
  }
  if (opts.port !== undefined && (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535)) {
    fail("Port must be a number between 1 and 65535.");
  }
  if (opts.webPort !== undefined && (!Number.isInteger(opts.webPort) || opts.webPort < 0 || opts.webPort > 65535)) {
    fail("Web port must be a number between 0 and 65535.");
  }

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

  const inferredConfig = inferConfigArg(opts.config, opts.gameArgs);
  if (inferredConfig) {
    opts = {
      ...opts,
      config: inferredConfig.config,
      gameArgs: inferredConfig.gameArgs,
    };
  }

  const userConfig = loadConfig(absGame, opts.config) ?? undefined;

  if (target === "web") {
    if ((opts.gameArgs?.length ?? 0) > 0) {
      fail("Web run does not support forwarded game arguments yet.");
    }
    const buildContext = resolveRunBuildContext(absGame, opts.buildConfig);
    try {
      printInfo("Feather run web");
      const result = await runWeb({
        projectDir: buildContext.projectDir,
        configPath: buildContext.configPath,
        sourceDir: buildContext.sourceDir,
        outDir: opts.outDir,
        clean: opts.clean,
        debugger: debuggerEnabled,
        runtimeConfigPath: opts.config,
        noPlugins: opts.noPlugins,
        featherOverride: opts.featherPath,
        pluginsOverride: opts.pluginsDir,
        verbose: opts.verbose,
        host: opts.webHost,
        port: opts.webPort,
      });
      printStatus("success", "Serving web build");
      printKeyValues([
        ["Game", absGame],
        ["HTML", result.htmlDir],
        ["URL", result.url],
        ["Debugger", result.debugger ? "enabled" : "disabled"],
      ]);
      await result.wait;
      return;
    } catch (err) {
      fail((err as Error).message, { cause: err });
    }
  }

  if (target === "android" || target === "ios") {
    if ((opts.gameArgs?.length ?? 0) > 0) {
      fail("Mobile run does not support forwarded game arguments yet.");
    }
    const buildContext = resolveRunBuildContext(absGame, opts.buildConfig);
    try {
      printInfo(`Feather run ${target}`);
      const result = runMobile({
        target,
        projectDir: buildContext.projectDir,
        configPath: buildContext.configPath,
        sourceDir: buildContext.sourceDir,
        outDir: opts.outDir,
        clean: opts.clean,
        noCache: opts.noCache,
        debugger: debuggerEnabled,
        runtimeConfigPath: opts.config,
        noPlugins: opts.noPlugins,
        featherOverride: opts.featherPath,
        pluginsOverride: opts.pluginsDir,
        verbose: opts.verbose,
        device: opts.device,
        adbReverse: debuggerEnabled ? opts.adbReverse : false,
        port: opts.port ?? (typeof userConfig?.port === "number" ? userConfig.port : undefined),
      });
      printStatus("success", `Launched ${target}`);
      printKeyValues([
        ["Game", absGame],
        ["Artifact", result.artifact],
        ["App ID", result.appId],
        ["Device", result.device],
        ["ADB reverse", result.adbReverse === undefined ? undefined : result.adbReverse ? `tcp:${result.port}` : "disabled"],
      ]);
      return;
    } catch (err) {
      fail((err as Error).message, { cause: err });
    }
  }

  let loveBin: string;
  try {
    loveBin = findLoveBinary(opts.love);
  } catch (err) {
    fail((err as Error).message, { cause: err });
  }

  const sessionName = opts.sessionName ?? (userConfig?.sessionName as string | undefined);

  if (!debuggerEnabled) {
    printInfo("Feather run");
    printKeyValues([
      ["Game", absGame],
      ["Debugger", "disabled"],
      ["Args", opts.gameArgs?.join(" ")],
    ]);

    const result = spawnSync(loveBin, [absGame, ...(opts.gameArgs ?? [])], {
      stdio: "inherit",
      env: process.env,
    });

    if (result.error) {
      fail(`Failed to launch love: ${result.error.message}`, { cause: result.error });
    }

    return result.status ?? 0;
  }

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

function resolveRunBuildContext(absGame: string, buildConfig: string | undefined): {
  projectDir: string;
  configPath?: string;
  sourceDir?: string;
} {
  if (buildConfig) {
    const configPath = resolve(buildConfig);
    const configDir = dirname(configPath);
    const sourceDir = relativeInside(configDir, absGame);
    if (sourceDir) {
      return {
        projectDir: realpathSync(configDir),
        configPath,
        sourceDir,
      };
    }
    return { projectDir: absGame, configPath };
  }

  if (existsSync(join(absGame, "feather.build.json"))) {
    return { projectDir: absGame };
  }

  const cwd = resolve(process.cwd());
  const sourceDir = relativeInside(cwd, absGame);
  if (existsSync(join(cwd, "feather.build.json")) && sourceDir) {
    return {
      projectDir: realpathSync(cwd),
      sourceDir,
    };
  }

  return { projectDir: absGame };
}

function relativeInside(root: string, target: string): string | null {
  const rootReal = realpathSync(root);
  const targetReal = realpathSync(target);
  if (!isPathInside(rootReal, targetReal)) return null;
  return relative(rootReal, targetReal) || ".";
}

function inferConfigArg(config: string | undefined, gameArgs: string[] | undefined): { config: string; gameArgs: string[] } | null {
  if (config || !gameArgs || gameArgs.length !== 1) return null;
  const candidate = gameArgs[0];
  if (!["feather.config.lua", ".featherrc.lua"].includes(basename(candidate))) return null;
  if (!existsSync(resolve(candidate))) return null;
  return { config: candidate, gameArgs: [] };
}
