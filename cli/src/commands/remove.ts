import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { normalizeInstallDir } from "../lib/install.js";
import { chooseRemoveWorkflow, type RemoveTarget } from "../ui/remove-workflow.js";
import { parseManagedValue } from "../lib/plugin-utils.js";

export interface RemoveOptions {
  yes?: boolean;
  dryRun?: boolean;
  installDir?: string;
  keepConfig?: boolean;
  keepMain?: boolean;
  keepManual?: boolean;
  keepRuntime?: boolean;
}

type RemoveContext = {
  projectDir: string;
  installDir: string;
  configPath: string;
  mainPath: string;
  manualEntrypoint: string;
};

function resolveContext(dir: string, opts: RemoveOptions): RemoveContext {
  const projectDir = resolve(dir);
  const configPath = join(projectDir, "feather.config.lua");
  const configSrc = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const installDir = normalizeInstallDir(opts.installDir ?? parseManagedValue(configSrc, "installDir") ?? "feather");
  const manualEntrypoint = parseManagedValue(configSrc, "manualEntrypoint") ?? "feather.debugger.lua";

  return {
    projectDir,
    installDir,
    configPath,
    mainPath: join(projectDir, "main.lua"),
    manualEntrypoint,
  };
}

function stripMainLua(src: string): string {
  let out = src.replace(/\n?-- FEATHER-INIT-BEGIN require\n[\s\S]*?-- FEATHER-INIT-END require\n?/g, "\n");
  out = out.replace(/\n[ \t]*-- FEATHER-INIT update\n[ \t]*if DEBUGGER then DEBUGGER:update\(dt\) end\n?/g, "\n");
  return out.replace(/^\n+/, "");
}

function discoverTargets(context: RemoveContext, opts: RemoveOptions): RemoveTarget[] {
  const targets: RemoveTarget[] = [];

  if (!opts.keepMain && existsSync(context.mainPath)) {
    const mainSrc = readFileSync(context.mainPath, "utf8");
    if (mainSrc.includes("FEATHER-INIT-BEGIN require") || mainSrc.includes("FEATHER-INIT update")) {
      targets.push({
        id: "main",
        label: "main.lua markers",
        path: context.mainPath,
        description: "Remove only the FEATHER-INIT require block and DEBUGGER:update hook.",
        defaultSelected: true,
      });
    }
  }

  const runtimePath = join(context.projectDir, context.installDir);
  if (!opts.keepRuntime && existsSync(runtimePath)) {
    targets.push({
      id: "runtime",
      label: "Feather runtime",
      path: runtimePath,
      description: "Delete the installed Feather core and plugins directory.",
      defaultSelected: true,
    });
  }

  const manualPath = join(context.projectDir, context.manualEntrypoint);
  if (!opts.keepManual && context.manualEntrypoint !== "(none)" && existsSync(manualPath)) {
    targets.push({
      id: "manual",
      label: "Manual debugger entrypoint",
      path: manualPath,
      description: "Delete the generated manual setup file.",
      defaultSelected: true,
    });
  }

  if (!opts.keepConfig && existsSync(context.configPath)) {
    const configSrc = readFileSync(context.configPath, "utf8");
    targets.push({
      id: "config",
      label: "feather.config.lua",
      path: context.configPath,
      description: configSrc.includes("FEATHER-MANAGED-BEGIN")
        ? "Delete the generated Feather config file."
        : "Delete feather.config.lua. This file does not contain managed metadata.",
      defaultSelected: configSrc.includes("FEATHER-MANAGED-BEGIN"),
    });
  }

  return targets;
}

function applyTarget(id: string, context: RemoveContext, dryRun: boolean): string | null {
  if (id === "main") {
    const src = readFileSync(context.mainPath, "utf8");
    const next = stripMainLua(src);
    if (next === src) return null;
    if (!dryRun) writeFileSync(context.mainPath, next);
    return "Removed FEATHER-INIT blocks from main.lua";
  }

  if (id === "runtime") {
    const runtimePath = join(context.projectDir, context.installDir);
    if (!existsSync(runtimePath)) return null;
    if (!dryRun) rmSync(runtimePath, { recursive: true, force: true });
    return `Removed ${context.installDir}/`;
  }

  if (id === "manual") {
    const manualPath = join(context.projectDir, context.manualEntrypoint);
    if (!existsSync(manualPath)) return null;
    if (!dryRun) rmSync(manualPath, { force: true });
    return `Removed ${context.manualEntrypoint}`;
  }

  if (id === "config") {
    if (!existsSync(context.configPath)) return null;
    if (!dryRun) rmSync(context.configPath, { force: true });
    return "Removed feather.config.lua";
  }

  return null;
}

export async function removeCommand(dir: string, opts: RemoveOptions): Promise<void> {
  const context = resolveContext(dir, opts);

  if (!existsSync(context.mainPath)) {
    console.error(chalk.red(`No main.lua found in ${context.projectDir}. Is this a Love2D project?`));
    process.exit(1);
  }

  const targets = discoverTargets(context, opts);
  if (targets.length === 0) {
    console.log(chalk.dim("No managed Feather files or markers found."));
    return;
  }

  let targetIds = targets.filter((target) => target.defaultSelected).map((target) => target.id);
  if (!opts.yes && process.stdin.isTTY) {
    const result = await chooseRemoveWorkflow(targets);
    if (result.cancelled) {
      console.log(chalk.dim("Remove cancelled."));
      return;
    }
    targetIds = result.targetIds;
  }

  if (targetIds.length === 0) {
    console.log(chalk.dim("No remove targets selected."));
    return;
  }

  for (const id of targetIds) {
    const message = applyTarget(id, context, opts.dryRun === true);
    if (message) {
      console.log((opts.dryRun ? chalk.dim("dry-run ") : chalk.green("✔ ")) + message);
    }
  }
}
