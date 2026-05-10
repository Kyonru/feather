#!/usr/bin/env node
import { Command } from "commander";
import { runCommand } from "./commands/run.js";
import { initCommand } from "./commands/init.js";
import { removeCommand } from "./commands/remove.js";
import { doctorCommand } from "./commands/doctor.js";
import { updateCommand } from "./commands/update.js";
import {
  pluginListCommand,
  pluginInstallCommand,
  pluginRemoveCommand,
  pluginUpdateCommand,
  pluginWorkflowCommand,
} from "./commands/plugin.js";
import type { InitMode } from "./ui/init-mode.js";

const program = new Command();
const initModes = new Set(["cli", "auto", "manual"]);

function parseInitMode(value: string): InitMode {
  if (!initModes.has(value)) {
    throw new Error("Mode must be one of: cli, auto, manual");
  }
  return value as InitMode;
}

program
  .name("feather")
  .description("Run and debug Love2D games with Feather — zero game-side changes required")
  .version("0.7.0");

// ── feather run ──────────────────────────────────────────────────────────────
program
  .command("run <game-path> [game-args...]")
  .description("Inject Feather into a Love2D game and run it")
  .option("--love <path>", "Path to the love2d binary (overrides auto-detect)")
  .option("--session-name <name>", "Custom session name shown in the desktop app")
  .option("--no-plugins", "Disable plugin loading (feather core only)")
  .option("--config <path>", "Path to feather.config.lua")
  .option("--feather-path <path>", "Use a local feather install instead of the bundled one")
  .option("--plugins-dir <path>", "Use a custom plugins directory instead of the bundled one")
  .action((gamePath: string, gameArgs: string[], opts) => {
    runCommand(gamePath, {
      love: opts.love as string | undefined,
      sessionName: opts.sessionName as string | undefined,
      noPlugins: opts.plugins === false,
      config: opts.config as string | undefined,
      featherPath: opts.featherPath as string | undefined,
      pluginsDir: opts.pluginsDir as string | undefined,
      gameArgs,
    });
  });

// ── feather init ─────────────────────────────────────────────────────────────
program
  .command("init [dir]")
  .description("Initialize Feather in a Love2D project directory (default: current directory)")
  .option("--remote", "Download from GitHub instead of copying the local/bundled Lua runtime")
  .option("--branch <branch>", "GitHub branch to download from when using --remote", "main")
  .option("--local-src <path>", "Copy Lua runtime from a local src-lua style directory")
  .option("--install-dir <path>", "Install directory for auto/manual modes", "feather")
  .option("--no-plugins", "Skip plugin installation")
  .option("--plugins <ids>", "Comma-separated list of plugins to install")
  .option("--mode <mode>", "Setup mode: cli, auto, or manual", parseInitMode)
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (dir: string | undefined, opts) => {
    await initCommand(dir ?? ".", {
      branch: opts.branch as string,
      remote: opts.remote as boolean | undefined,
      localSrc: opts.localSrc as string | undefined,
      installDir: opts.installDir as string,
      noPlugins: opts.plugins === false,
      plugins: opts.plugins && opts.plugins !== true
        ? (opts.plugins as string).split(",").map((s: string) => s.trim())
        : undefined,
      mode: opts.mode as InitMode | undefined,
      yes: opts.yes as boolean,
    });
  });

// ── feather remove ───────────────────────────────────────────────────────────
program
  .command("remove [dir]")
  .description("Remove Feather files and init markers from a Love2D project")
  .option("--install-dir <path>", "Feather install directory override")
  .option("--dry-run", "Show what would be removed without changing files")
  .option("--keep-config", "Keep feather.config.lua")
  .option("--keep-main", "Keep main.lua FEATHER-INIT markers")
  .option("--keep-manual", "Keep feather.debugger.lua")
  .option("--keep-runtime", "Keep installed Feather runtime/plugins")
  .option("-y, --yes", "Skip interactive confirmation")
  .action(async (dir: string | undefined, opts) => {
    await removeCommand(dir ?? ".", {
      installDir: opts.installDir as string | undefined,
      dryRun: opts.dryRun as boolean | undefined,
      keepConfig: opts.keepConfig as boolean | undefined,
      keepMain: opts.keepMain as boolean | undefined,
      keepManual: opts.keepManual as boolean | undefined,
      keepRuntime: opts.keepRuntime as boolean | undefined,
      yes: opts.yes as boolean | undefined,
    });
  });

// ── feather doctor ───────────────────────────────────────────────────────────
program
  .command("doctor [dir]")
  .description("Check the environment and project setup")
  .option("--install-dir <path>", "Feather install directory override")
  .option("--host <host>", "Host to check for the Feather desktop WebSocket", "127.0.0.1")
  .option("--port <port>", "Port to check for the Feather desktop WebSocket", (value) => Number(value))
  .option("--json", "Print machine-readable diagnostics")
  .action(async (dir: string | undefined, opts) => {
    await doctorCommand(dir, {
      installDir: opts.installDir as string | undefined,
      host: opts.host as string | undefined,
      port: opts.port as number | undefined,
      json: opts.json as boolean | undefined,
    });
  });

// ── feather update ───────────────────────────────────────────────────────────
program
  .command("update [dir]")
  .description("Update the Feather core library in a project (default: current directory)")
  .option("--branch <branch>", "GitHub branch to download from", "main")
  .action((dir: string | undefined, opts) => {
    updateCommand(dir ?? ".", { branch: opts.branch as string });
  });

// ── feather plugin ───────────────────────────────────────────────────────────
const plugin = program
  .command("plugin")
  .description("Manage Feather plugins")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--remote", "Download from GitHub instead of copying the local/bundled Lua runtime")
  .option("--branch <branch>", "GitHub branch to download from when using --remote", "main")
  .option("--local-src <path>", "Copy plugins from a local src-lua style directory")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action(async (opts) => {
    await pluginWorkflowCommand({
      dir: opts.dir as string | undefined,
      branch: opts.branch as string,
      installDir: opts.installDir as string,
      remote: opts.remote as boolean | undefined,
      localSrc: opts.localSrc as string | undefined,
    });
  });

const pluginCommandOptions = (opts: Record<string, unknown>) => ({ ...opts, ...plugin.opts() });

plugin
  .command("list [dir]")
  .description("List installed plugins")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action(async (dir: string | undefined, opts) => {
    const merged = pluginCommandOptions(opts);
    await pluginListCommand(dir ?? (merged.dir as string | undefined), merged.installDir as string);
  });

plugin
  .command("install <id>")
  .description("Install a plugin from the Feather registry")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--remote", "Download from GitHub instead of copying the local/bundled Lua runtime")
  .option("--branch <branch>", "GitHub branch to download from when using --remote", "main")
  .option("--local-src <path>", "Copy plugins from a local src-lua style directory")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action(async (id: string, opts) => {
    const merged = pluginCommandOptions(opts);
    await pluginInstallCommand(id, {
      dir: merged.dir as string | undefined,
      branch: merged.branch as string,
      installDir: merged.installDir as string,
      remote: merged.remote as boolean | undefined,
      localSrc: merged.localSrc as string | undefined,
    });
  });

plugin
  .command("remove <id>")
  .description("Remove an installed plugin")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action(async (id: string, opts) => {
    const merged = pluginCommandOptions(opts);
    await pluginRemoveCommand(id, { dir: merged.dir as string | undefined, installDir: merged.installDir as string });
  });

plugin
  .command("update [id]")
  .description("Update a plugin (or all installed plugins if no id given)")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--remote", "Download from GitHub instead of copying the local/bundled Lua runtime")
  .option("--branch <branch>", "GitHub branch to download from when using --remote", "main")
  .option("--local-src <path>", "Copy plugins from a local src-lua style directory")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action(async (id: string | undefined, opts) => {
    const merged = pluginCommandOptions(opts);
    await pluginUpdateCommand(id, {
      dir: merged.dir as string | undefined,
      branch: merged.branch as string,
      installDir: merged.installDir as string,
      remote: merged.remote as boolean | undefined,
      localSrc: merged.localSrc as string | undefined,
    });
  });

program.parse();
