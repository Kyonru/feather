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

const program = new Command();

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
  .option("--no-plugins", "Skip plugin installation")
  .option("--plugins <ids>", "Comma-separated list of plugins to install")
  .option("-y, --yes", "Skip confirmation prompts")
  .action((dir: string | undefined, opts) => {
    initCommand(dir ?? ".", {
      branch: opts.branch as string,
      noPlugins: opts.plugins === false,
      plugins: opts.plugins && opts.plugins !== true
        ? (opts.plugins as string).split(",").map((s: string) => s.trim())
        : undefined,
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
  .action((dir: string | undefined) => {
    pluginListCommand(dir);
  });

plugin
  .command("install <id>")
  .description("Install a plugin from the Feather registry")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--branch <branch>", "GitHub branch", "main")
  .action((id: string, opts) => {
    pluginInstallCommand(id, { dir: opts.dir as string | undefined, branch: opts.branch as string });
  });

plugin
  .command("remove <id>")
  .description("Remove an installed plugin")
  .option("--dir <path>", "Project directory (default: current directory)")
  .action((id: string, opts) => {
    pluginRemoveCommand(id, { dir: opts.dir as string | undefined });
  });

plugin
  .command("update [id]")
  .description("Update a plugin (or all installed plugins if no id given)")
  .option("--dir <path>", "Project directory (default: current directory)")
  .option("--branch <branch>", "GitHub branch", "main")
  .action((id: string | undefined, opts) => {
    pluginUpdateCommand(id, { dir: opts.dir as string | undefined, branch: opts.branch as string });
  });

program.parse();
