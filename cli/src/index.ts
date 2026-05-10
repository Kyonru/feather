#!/usr/bin/env node
import { Command } from "commander";
import { runCommand } from "./commands/run.js";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { updateCommand } from "./commands/update.js";
import {
  pluginListCommand,
  pluginInstallCommand,
  pluginRemoveCommand,
  pluginUpdateCommand,
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
  .option("--branch <branch>", "GitHub branch to download from", "main")
  .option("--install-dir <path>", "Install directory for auto/manual modes", "feather")
  .option("--no-plugins", "Skip plugin installation")
  .option("--plugins <ids>", "Comma-separated list of plugins to install")
  .option("--mode <mode>", "Setup mode: cli, auto, or manual", parseInitMode)
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (dir: string | undefined, opts) => {
    await initCommand(dir ?? ".", {
      branch: opts.branch as string,
      installDir: opts.installDir as string,
      noPlugins: opts.plugins === false,
      plugins: opts.plugins && opts.plugins !== true
        ? (opts.plugins as string).split(",").map((s: string) => s.trim())
        : undefined,
      mode: opts.mode as InitMode | undefined,
      yes: opts.yes as boolean,
    });
  });

// ── feather doctor ───────────────────────────────────────────────────────────
program
  .command("doctor [dir]")
  .description("Check the environment and project setup")
  .action(async (dir: string | undefined) => {
    await doctorCommand(dir);
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
const plugin = program.command("plugin").description("Manage Feather plugins");

plugin
  .command("list [dir]")
  .description("List installed plugins")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action((dir: string | undefined, opts) => {
    pluginListCommand(dir, opts.installDir as string);
  });

plugin
  .command("install <id>")
  .description("Install a plugin from the Feather registry")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--branch <branch>", "GitHub branch", "main")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action((id: string, opts) => {
    pluginInstallCommand(id, {
      dir: opts.dir as string | undefined,
      branch: opts.branch as string,
      installDir: opts.installDir as string,
    });
  });

plugin
  .command("remove <id>")
  .description("Remove an installed plugin")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action((id: string, opts) => {
    pluginRemoveCommand(id, { dir: opts.dir as string | undefined, installDir: opts.installDir as string });
  });

plugin
  .command("update [id]")
  .description("Update a plugin (or all installed plugins if no id given)")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--branch <branch>", "GitHub branch", "main")
  .option("--install-dir <path>", "Feather install directory", "feather")
  .action((id: string | undefined, opts) => {
    pluginUpdateCommand(id, {
      dir: opts.dir as string | undefined,
      branch: opts.branch as string,
      installDir: opts.installDir as string,
    });
  });

program.parse();
