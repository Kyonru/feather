import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { normalizeInstallDir } from "../lib/install.js";
import { chooseRemoveWorkflow, type RemoveTarget } from "../ui/remove-workflow.js";
import { parseManagedValue } from "../lib/plugin-utils.js";
import { fail } from "../lib/command.js";
import { icon, printLine, printMuted, style } from "../lib/output.js";
import { assertSafeProjectTarget } from "../lib/path-safety.js";

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
  manualPath: string;
  runtimePath: string;
};

function resolveContext(dir: string, opts: RemoveOptions): RemoveContext {
  const projectDir = resolve(dir);
  const configPath = assertSafeProjectTarget(projectDir, "feather.config.lua", "Config remove target");
  const configSrc = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const installDir = normalizeInstallDir(opts.installDir ?? parseManagedValue(configSrc, "installDir") ?? "feather");
  const manualEntrypoint = parseManagedValue(configSrc, "manualEntrypoint") ?? "feather.debugger.lua";
  const runtimePath = assertSafeProjectTarget(projectDir, installDir, "Runtime remove target");
  const manualPath = manualEntrypoint === "(none)"
    ? join(projectDir, "(none)")
    : assertSafeProjectTarget(projectDir, manualEntrypoint, "Manual entrypoint remove target");

  return {
    projectDir,
    installDir,
    configPath,
    mainPath: assertSafeProjectTarget(projectDir, "main.lua", "main.lua update target"),
    manualEntrypoint,
    manualPath,
    runtimePath,
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
        dangerous: true,
      });
    }
  }

  if (!opts.keepRuntime && existsSync(context.runtimePath)) {
    targets.push({
      id: "runtime",
      label: "Feather runtime",
      path: context.runtimePath,
      description: "Delete the installed Feather core and plugins directory.",
      defaultSelected: true,
      dangerous: true,
    });
  }

  if (!opts.keepManual && context.manualEntrypoint !== "(none)" && existsSync(context.manualPath)) {
    targets.push({
      id: "manual",
      label: "Manual debugger entrypoint",
      path: context.manualPath,
      description: "Delete the generated manual setup file.",
      defaultSelected: true,
      dangerous: true,
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
      dangerous: true,
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
    if (!existsSync(context.runtimePath)) return null;
    if (!dryRun) rmSync(context.runtimePath, { recursive: true, force: true });
    return `Removed ${context.installDir}/`;
  }

  if (id === "manual") {
    if (!existsSync(context.manualPath)) return null;
    if (!dryRun) rmSync(context.manualPath, { force: true });
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
    fail(`No main.lua found in ${context.projectDir}. Is this a Love2D project?`);
  }

  const targets = discoverTargets(context, opts);
  if (targets.length === 0) {
    printMuted("No managed Feather files or markers found.");
    return;
  }

  if (!opts.yes && !opts.dryRun && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    fail("Refusing to remove Feather files without --yes in non-interactive mode.");
  }

  let targetIds = targets.filter((target) => target.defaultSelected).map((target) => target.id);
  if (!opts.yes && process.stdin.isTTY) {
    const result = await chooseRemoveWorkflow(targets);
    if (result.cancelled) {
      printMuted("Remove cancelled.");
      return;
    }
    targetIds = result.targetIds;
  }

  if (targetIds.length === 0) {
    printMuted("No remove targets selected.");
    return;
  }

  for (const id of targetIds) {
    const message = applyTarget(id, context, opts.dryRun === true);
    if (message) {
      printLine((opts.dryRun ? style.muted("dry-run ") : `${icon.success} `) + message);
    }
  }
}
