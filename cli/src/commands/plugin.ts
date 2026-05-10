import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import ora from "ora";
import {
  fetchManifest,
  getLocalPluginIds,
  getPluginIds,
  installPlugin,
  installPluginsFromLocal,
  normalizeInstallDir,
} from "../lib/install.js";
import { choosePluginWorkflow } from "../ui/plugin-workflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findProjectDir(cwd = process.cwd()): string {
  if (existsSync(join(cwd, "feather", "init.lua"))) return cwd;
  if (existsSync(join(cwd, "main.lua"))) return cwd;
  return cwd;
}

function pluginsDir(projectDir: string, installDir = "feather"): string {
  return join(projectDir, normalizeInstallDir(installDir), "plugins");
}

function bundledLuaRoot(): string {
  return resolve(__dirname, "../../lua");
}

function repoLuaRoot(): string | null {
  const candidate = resolve(__dirname, "../../../src-lua");
  return existsSync(join(candidate, "feather", "init.lua")) ? candidate : null;
}

function resolveLocalLuaRoot(opts: { localSrc?: string }): string {
  if (opts.localSrc) return resolve(opts.localSrc);
  return repoLuaRoot() ?? bundledLuaRoot();
}

function readManifest(pluginDir: string): Record<string, string> | null {
  // Try to extract id/name/version from manifest.lua via simple regex
  const manifestPath = join(pluginDir, "manifest.lua");
  if (!existsSync(manifestPath)) return null;
  const src = readFileSync(manifestPath, "utf8");
  const get = (key: string) => src.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`))?.[1] ?? "";
  return { id: get("id"), name: get("name"), version: get("version") };
}

function findInstalledPluginDirs(root: string): string[] {
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

function getInstalledPluginIds(projectDir: string, installDir = "feather"): string[] {
  const dirPath = pluginsDir(projectDir, installDir);
  if (!existsSync(dirPath)) return [];

  return findInstalledPluginDirs(dirPath)
    .map((dir) => readManifest(dir)?.id)
    .filter((id): id is string => Boolean(id))
    .sort();
}

export async function pluginListCommand(dir?: string, installDir = "feather"): Promise<void> {
  const projectDir = dir ? resolve(dir) : findProjectDir();
  const dirPath = pluginsDir(projectDir, installDir);

  if (!existsSync(dirPath)) {
    console.log(chalk.dim("No plugins directory found. Run `feather init` first."));
    return;
  }

  const dirs = findInstalledPluginDirs(dirPath);

  if (dirs.length === 0) {
    console.log(chalk.dim("No plugins installed."));
    return;
  }

  console.log(chalk.bold(`\nInstalled plugins (${dirs.length})\n`));
  for (const dir of dirs) {
    const meta = readManifest(dir);
    if (meta) {
      console.log(`  ${chalk.cyan(meta.id.padEnd(24))} ${chalk.dim(meta.version.padEnd(8))} ${meta.name}`);
    } else {
      console.log(`  ${chalk.cyan(dir.replace(dirPath, "").replace(/^[/\\]/, ""))}`);
    }
  }
  console.log();
}

export async function pluginInstallCommand(
  pluginId: string,
  opts: { dir?: string; branch?: string; installDir?: string; remote?: boolean; localSrc?: string }
): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const branch = opts.branch ?? "main";
  const installDir = opts.installDir ?? "feather";

  if (!opts.remote) {
    const sourceRoot = resolveLocalLuaRoot(opts);
    const available = getLocalPluginIds(sourceRoot);
    if (!available.includes(pluginId)) {
      console.error(chalk.red(`Unknown plugin: ${pluginId}`));
      console.log(chalk.dim("Available: " + available.join(", ")));
      process.exit(1);
    }

    const spinner = ora(`Copying ${pluginId}…`).start();
    try {
      installPluginsFromLocal([pluginId], sourceRoot, projectDir, installDir);
      spinner.succeed(`Installed ${pluginId}`);
    } catch (err) {
      spinner.fail((err as Error).message);
      process.exit(1);
    }
    return;
  }

  const spinner = ora("Fetching manifest…").start();
  let entries: Awaited<ReturnType<typeof fetchManifest>>;
  try {
    entries = await fetchManifest(branch);
    spinner.succeed("Manifest loaded");
  } catch (err) {
    spinner.fail((err as Error).message);
    process.exit(1);
  }

  const available = getPluginIds(entries);
  if (!available.includes(pluginId)) {
    console.error(chalk.red(`Unknown plugin: ${pluginId}`));
    console.log(chalk.dim("Available: " + available.join(", ")));
    process.exit(1);
  }

  const installSpinner = ora(`Installing ${pluginId}…`).start();
  try {
    await installPlugin(pluginId, entries, projectDir, branch, undefined, installDir);
    installSpinner.succeed(`Installed ${pluginId}`);
  } catch (err) {
    installSpinner.fail((err as Error).message);
    process.exit(1);
  }
}

export async function pluginRemoveCommand(pluginId: string, opts: { dir?: string; installDir?: string }): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const pluginDir = join(pluginsDir(projectDir, opts.installDir), pluginId.replace(/\./g, "/"));

  if (!existsSync(pluginDir)) {
    console.error(chalk.red(`Plugin not found: ${pluginId}`));
    process.exit(1);
  }

  rmSync(pluginDir, { recursive: true, force: true });
  console.log(chalk.green("✔") + ` Removed ${pluginId}`);
}

export async function pluginUpdateCommand(
  pluginId: string | undefined,
  opts: { dir?: string; branch?: string; installDir?: string; remote?: boolean; localSrc?: string }
): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const branch = opts.branch ?? "main";
  const installDir = opts.installDir ?? "feather";
  const dirPath = pluginsDir(projectDir, installDir);

  if (!opts.remote) {
    const sourceRoot = resolveLocalLuaRoot(opts);
    const available = getLocalPluginIds(sourceRoot);
    const ids = pluginId ? [pluginId] : available.filter((id) => existsSync(join(dirPath, id.replace(/\./g, "/"))));

    for (const id of ids) {
      const s = ora(`Updating ${id}…`).start();
      try {
        installPluginsFromLocal([id], sourceRoot, projectDir, installDir);
        s.succeed(`Updated ${id}`);
      } catch (err) {
        s.fail(`${id}: ${(err as Error).message}`);
      }
    }
    return;
  }

  const spinner = ora("Fetching manifest…").start();
  let entries: Awaited<ReturnType<typeof fetchManifest>>;
  try {
    entries = await fetchManifest(branch);
    spinner.succeed("Manifest loaded");
  } catch (err) {
    spinner.fail((err as Error).message);
    process.exit(1);
  }

  const ids = pluginId ? [pluginId] : getPluginIds(entries).filter((id) =>
    existsSync(join(dirPath, id.replace(/\./g, "/")))
  );

  for (const id of ids) {
    const s = ora(`Updating ${id}…`).start();
    try {
      await installPlugin(id, entries, projectDir, branch, undefined, installDir);
      s.succeed(`Updated ${id}`);
    } catch (err) {
      s.fail(`${id}: ${(err as Error).message}`);
    }
  }
}

export async function pluginWorkflowCommand(opts: {
  dir?: string;
  branch?: string;
  installDir?: string;
  remote?: boolean;
  localSrc?: string;
}): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const installDir = opts.installDir ?? "feather";
  const installedIds = getInstalledPluginIds(projectDir, installDir);

  const result = await choosePluginWorkflow({
    installedIds,
    defaultBranch: opts.branch ?? "main",
  });

  if (result.action === "cancel") return;
  if (result.action === "list") {
    await pluginListCommand(projectDir, installDir);
    return;
  }

  if (result.pluginIds.length === 0) {
    console.log(chalk.dim("No plugins selected."));
    return;
  }

  if (result.action === "install") {
    for (const id of result.pluginIds) {
      await pluginInstallCommand(id, {
        dir: projectDir,
        branch: result.branch,
        installDir,
        remote: result.source === "remote",
        localSrc: opts.localSrc,
      });
    }
    return;
  }

  if (result.action === "update") {
    for (const id of result.pluginIds) {
      await pluginUpdateCommand(id, {
        dir: projectDir,
        branch: result.branch,
        installDir,
        remote: result.source === "remote",
        localSrc: opts.localSrc,
      });
    }
    return;
  }

  for (const id of result.pluginIds) {
    await pluginRemoveCommand(id, { dir: projectDir, installDir });
  }
}
