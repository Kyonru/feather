import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createConnection } from "node:net";
import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { findLoveBinary, getLoveVersion } from "../lib/love.js";
import { loadConfig } from "../lib/config.js";
import { normalizeInstallDir } from "../lib/install.js";

type Severity = "pass" | "warn" | "fail" | "info";

type DoctorCheck = {
  group: string;
  label: string;
  severity: Severity;
  detail?: string;
  fix?: string;
};

export type DoctorOptions = {
  installDir?: string;
  host?: string;
  port?: number;
  json?: boolean;
};

const severityOrder: Record<Severity, number> = {
  fail: 0,
  warn: 1,
  info: 2,
  pass: 3,
};

function add(
  checks: DoctorCheck[],
  group: string,
  label: string,
  severity: Severity,
  detail?: string,
  fix?: string,
): void {
  checks.push({ group, label, severity, detail, fix });
}

function icon(severity: Severity): string {
  if (severity === "pass") return chalk.green("✔");
  if (severity === "warn") return chalk.yellow("!");
  if (severity === "fail") return chalk.red("✖");
  return chalk.cyan("i");
}

function colorLabel(severity: Severity, label: string): string {
  if (severity === "pass") return chalk.white(label);
  if (severity === "warn") return chalk.yellow(label);
  if (severity === "fail") return chalk.red(label);
  return chalk.white(label);
}

function portReachable(port: number, host = "127.0.0.1", timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeout);
    sock.once("connect", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function commandVersion(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split("\n")[0] ?? null;
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function parseManagedValue(src: string, key: string): string | null {
  return src.match(new RegExp(`^--\\s*${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
}

function luaBoolEnabled(src: string, key: string): boolean {
  return new RegExp(`${key}\\s*=\\s*true\\b`).test(src);
}

function hasConfigArrayValue(src: string, key: string, value: string): boolean {
  const match = src.match(new RegExp(`${key}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
  return match ? new RegExp(`["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(match[1]) : false;
}

function isWeakApiKey(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length < 24 || value === "change-me" || value === "dev";
}

function findInstalledPluginDirs(root: string): string[] {
  if (!existsSync(root)) return [];

  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    if (existsSync(join(dir, "manifest.lua"))) {
      found.push(dir);
    } else {
      found.push(...findInstalledPluginDirs(dir));
    }
  }
  return found;
}

function readPluginId(pluginDir: string): string | null {
  const src = readIfExists(join(pluginDir, "manifest.lua"));
  return src?.match(/id\s*=\s*"([^"]+)"/)?.[1] ?? null;
}

function renderReport(checks: DoctorCheck[], projectDir: string): void {
  console.log(chalk.bold("\nFeather doctor\n"));
  console.log(chalk.dim(`Project: ${projectDir}\n`));

  const groups = [...new Set(checks.map((check) => check.group))];
  for (const group of groups) {
    console.log(chalk.bold(group));
    for (const check of checks.filter((item) => item.group === group).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])) {
      console.log(`  ${icon(check.severity)} ${colorLabel(check.severity, check.label)}${check.detail ? chalk.dim(`  ${check.detail}`) : ""}`);
      if (check.fix) console.log(chalk.dim(`    → ${check.fix}`));
    }
    console.log();
  }

  const failures = checks.filter((check) => check.severity === "fail");
  const warnings = checks.filter((check) => check.severity === "warn");
  const passed = checks.filter((check) => check.severity === "pass");

  if (failures.length > 0) {
    console.log(chalk.red.bold(`Doctor found ${failures.length} blocker${failures.length === 1 ? "" : "s"}.`));
  } else if (warnings.length > 0) {
    console.log(chalk.yellow.bold(`Doctor passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`));
  } else {
    console.log(chalk.green.bold("Doctor found no problems."));
  }
  console.log(chalk.dim(`${passed.length} passed, ${warnings.length} warnings, ${failures.length} failures.\n`));
}

export async function doctorCommand(gamePath?: string, opts: DoctorOptions = {}): Promise<void> {
  const projectDir = gamePath ? resolve(gamePath) : process.cwd();
  const installDir = normalizeInstallDir(opts.installDir ?? "feather");
  const checks: DoctorCheck[] = [];

  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split(".").map(Number);
  add(
    checks,
    "Environment",
    "Node.js",
    major >= 18 ? "pass" : "fail",
    `v${nodeVersion}`,
    major >= 18 ? undefined : "Install Node.js 18 or newer.",
  );

  const npmVersion = commandVersion("npm", ["--version"]);
  add(
    checks,
    "Environment",
    "npm",
    npmVersion ? "pass" : "warn",
    npmVersion ? `v${npmVersion}` : "not found",
    npmVersion ? undefined : "Install npm if you want to use npm run feather or global CLI installs.",
  );

  let lovePath: string | null = null;
  try {
    lovePath = findLoveBinary();
    const ver = getLoveVersion(lovePath);
    add(checks, "Environment", "LÖVE binary", "pass", `${lovePath}  (${ver})`);
  } catch {
    add(
      checks,
      "Environment",
      "LÖVE binary",
      "fail",
      "not found",
      "Install from https://love2d.org or set LOVE_BIN to the executable path.",
    );
  }

  add(checks, "Environment", "Platform", "info", `${process.platform} ${process.arch}`);

  const hasProjectDir = existsSync(projectDir);
  add(
    checks,
    "Project",
    "Project directory",
    hasProjectDir ? "pass" : "fail",
    projectDir,
    hasProjectDir ? undefined : "Pass the game directory to `feather doctor <dir>`.",
  );

  const mainPath = join(projectDir, "main.lua");
  const mainSource = readIfExists(mainPath);
  const hasMain = mainSource !== null;
  add(
    checks,
    "Project",
    "main.lua",
    hasMain ? "pass" : "fail",
    hasMain ? mainPath : "missing",
    hasMain ? undefined : "Run doctor from a LÖVE project root or pass the project directory.",
  );

  const configPath = join(projectDir, "feather.config.lua");
  const configSource = readIfExists(configPath);
  let config: ReturnType<typeof loadConfig> = null;
  if (configSource) {
    try {
      config = loadConfig(projectDir);
      add(checks, "Project", "feather.config.lua", "pass", configPath);
    } catch (err) {
      add(checks, "Project", "feather.config.lua", "fail", (err as Error).message);
    }
  } else {
    add(checks, "Project", "feather.config.lua", "warn", "missing", "Run `feather init` to create a shared config.");
  }

  const managedMode = configSource ? parseManagedValue(configSource, "mode") : null;
  const managedInstallDir = configSource ? parseManagedValue(configSource, "installDir") : null;
  const effectiveInstallDir = normalizeInstallDir(opts.installDir ?? managedInstallDir ?? installDir);
  if (managedMode) {
    add(checks, "Project", "Managed init metadata", "pass", `mode=${managedMode}, installDir=${managedInstallDir ?? effectiveInstallDir}`);
  } else if (configSource) {
    add(checks, "Project", "Managed init metadata", "info", "not present", "New `feather init` configs include metadata for `feather remove`.");
  }

  const runtimeDir = join(projectDir, effectiveInstallDir);
  const hasRuntime = existsSync(join(runtimeDir, "init.lua"));
  const configOnlyMode = managedMode === "cli";
  add(
    checks,
    "Runtime",
    "Embedded Feather runtime",
    hasRuntime ? "pass" : configOnlyMode ? "info" : "warn",
    hasRuntime ? runtimeDir : configOnlyMode ? "not needed for cli mode" : "missing",
    hasRuntime || configOnlyMode ? undefined : "Run `feather init --mode auto` for embedded/device workflows.",
  );

  if (hasRuntime) {
    for (const file of ["auto.lua", "lib/ws.lua", "plugin_manager.lua"]) {
      const path = join(runtimeDir, file);
      add(
        checks,
        "Runtime",
        file,
        existsSync(path) ? "pass" : "fail",
        existsSync(path) ? undefined : "missing",
        existsSync(path) ? undefined : `Reinstall runtime with \`feather init --mode auto --install-dir ${effectiveInstallDir}\`.`,
      );
    }

    const initSource = readIfExists(join(runtimeDir, "init.lua"));
    const runtimeVersion = initSource?.match(/FEATHER_VERSION_NAME\s*=\s*"([^"]+)"/)?.[1] ?? "unknown";
    add(checks, "Runtime", "Runtime version", runtimeVersion === "unknown" ? "warn" : "pass", runtimeVersion);
  }

  const runtimePluginRoot = join(runtimeDir, "plugins");
  const sourceTreePluginRoot = join(projectDir, "plugins");
  const pluginRoot = existsSync(runtimePluginRoot) ? runtimePluginRoot : sourceTreePluginRoot;
  const pluginDirs = findInstalledPluginDirs(pluginRoot);
  if (hasRuntime) {
    add(
      checks,
      "Plugins",
      "Plugin directory",
      existsSync(pluginRoot) ? "pass" : "info",
      existsSync(pluginRoot) ? pluginRoot : "not installed",
      existsSync(pluginRoot) ? undefined : "Core-only installs are valid; run `feather plugin` to manage plugins.",
    );
    add(checks, "Plugins", "Installed plugins", pluginDirs.length > 0 ? "pass" : "info", `${pluginDirs.length}`);
    const malformed = pluginDirs.filter((dir) => !readPluginId(dir));
    if (malformed.length > 0) {
      add(checks, "Plugins", "Plugin manifests", "warn", `${malformed.length} missing id`, "Reinstall affected plugins with `feather plugin update`.");
    } else if (pluginDirs.length > 0) {
      add(checks, "Plugins", "Plugin manifests", "pass", "all installed plugins declare an id");
    }
  }

  if (mainSource) {
    const hasUseDebugger = mainSource.includes("USE_DEBUGGER");
    const hasInitMarkers = mainSource.includes("FEATHER-INIT-BEGIN") && mainSource.includes("FEATHER-INIT-END");
    add(
      checks,
      "Safety",
      "USE_DEBUGGER guard",
      hasUseDebugger || configOnlyMode ? "pass" : "warn",
      hasUseDebugger ? "present" : configOnlyMode ? "not needed for cli mode" : "not found",
      hasUseDebugger || configOnlyMode ? undefined : "Guard Feather imports so production builds can skip debugger code.",
    );
    add(
      checks,
      "Safety",
      "FEATHER-INIT markers",
      hasInitMarkers || configOnlyMode ? "pass" : "info",
      hasInitMarkers ? "present" : "not present",
      hasInitMarkers || configOnlyMode ? undefined : "`feather remove` works best when init markers are present.",
    );
  }

  if (configSource) {
    const captureScreenshot = luaBoolEnabled(configSource, "captureScreenshot");
    add(
      checks,
      "Safety",
      "captureScreenshot",
      captureScreenshot ? "warn" : "pass",
      captureScreenshot ? "enabled" : "disabled",
      captureScreenshot ? "Enable only when you need visual error context; it can affect performance." : undefined,
    );

    const hotReloadEnabled = /hotReload\s*=\s*\{[\s\S]*?enabled\s*=\s*true/.test(configSource);
    const persistToDisk = /hotReload\s*=\s*\{[\s\S]*?persistToDisk\s*=\s*true/.test(configSource);
    const broadHotReload = /allow\s*=\s*\{[\s\S]*["'][^"']+\.\*["']/.test(configSource);
    add(
      checks,
      "Safety",
      "Hot reload",
      hotReloadEnabled ? "warn" : "pass",
      hotReloadEnabled ? "enabled" : "disabled",
      hotReloadEnabled ? "Hot reload is development-only remote code execution; keep allowlists narrow and never ship with it on." : undefined,
    );
    if (hotReloadEnabled && broadHotReload) {
      add(checks, "Safety", "Hot reload allowlist", "warn", "contains wildcard", "Prefer exact module names while editing.");
    }
    if (hotReloadEnabled && persistToDisk) {
      add(checks, "Safety", "Hot reload persistence", "warn", "persistToDisk=true", "Persisted patches survive app restarts until restored or cleared.");
    }

    const consoleIncluded = hasConfigArrayValue(configSource, "include", "console") || pluginDirs.some((dir) => readPluginId(dir) === "console");
    if (consoleIncluded) {
      const apiKey = config?.apiKey;
      add(
        checks,
        "Safety",
        "Console API key",
        isWeakApiKey(apiKey) ? "warn" : "pass",
        isWeakApiKey(apiKey) ? "missing or weak" : "configured",
        isWeakApiKey(apiKey) ? "Set a strong per-session or config API key when using Console." : undefined,
      );
    }
  }

  const configuredPort = opts.port ?? (typeof config?.port === "number" ? config.port : 4004);
  const configuredHost = opts.host ?? "127.0.0.1";
  const mode = typeof config?.mode === "string" ? config.mode : "socket";
  if (mode === "disk") {
    add(checks, "Connectivity", "WebSocket mode", "info", "disk mode", "Desktop WebSocket connectivity is not used in disk mode.");
  } else {
    const desktopUp = await portReachable(configuredPort, configuredHost);
    add(
      checks,
      "Connectivity",
      `Feather desktop (${configuredHost}:${configuredPort})`,
      desktopUp ? "pass" : "warn",
      desktopUp ? "reachable" : "not reachable",
      desktopUp ? undefined : "Start the Feather desktop app, or pass --host/--port if checking a custom endpoint.",
    );
  }

  const failures = checks.filter((check) => check.severity === "fail");
  const warnings = checks.filter((check) => check.severity === "warn");

  if (opts.json) {
    console.log(JSON.stringify({ projectDir, installDir: effectiveInstallDir, failures: failures.length, warnings: warnings.length, checks }, null, 2));
  } else {
    renderReport(checks, projectDir);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}
