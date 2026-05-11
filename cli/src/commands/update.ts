import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import ora from "ora";
import { fetchManifest, installCore, installCoreFromLocal, normalizeInstallDir } from "../lib/install.js";
import { chooseCoreUpdateWorkflow } from "../ui/update-workflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

export async function updateCommand(
  dir: string,
  opts: { branch?: string; remote?: boolean; localSrc?: string; installDir?: string; yes?: boolean }
): Promise<void> {
  const target = resolve(dir);
  const installDir = normalizeInstallDir(opts.installDir);

  if (!existsSync(join(target, installDir, "init.lua"))) {
    console.error(chalk.red(`Feather is not installed in ${target}. Run \`feather init\` first.`));
    process.exit(1);
  }

  let branch = opts.branch ?? "main";
  let useRemote = opts.remote === true;
  const hasExplicitSource = opts.remote === true || !!opts.localSrc || opts.yes === true;

  if (!hasExplicitSource && process.stdin.isTTY) {
    const result = await chooseCoreUpdateWorkflow(branch);
    if (result.cancelled) {
      console.log(chalk.dim("Update cancelled."));
      return;
    }
    useRemote = result.source === "remote";
    branch = result.branch;
  }

  if (!useRemote) {
    const sourceRoot = resolveLocalLuaRoot(opts);
    const spinner = ora("Updating feather core from local copy…").start();
    try {
      installCoreFromLocal(sourceRoot, target, installDir, (file) => {
        spinner.text = `Updating ${file}…`;
      });
      spinner.succeed("Feather core updated");
    } catch (err) {
      spinner.fail((err as Error).message);
      process.exit(1);
    }

    console.log(chalk.bold("\nDone!") + " Feather core is up to date.\n");
    return;
  }

  const spinner = ora("Fetching manifest…").start();

  let entries: Awaited<ReturnType<typeof fetchManifest>>;
  try {
    entries = await fetchManifest(branch);
    spinner.succeed(`Manifest loaded (${entries.length} files)`);
  } catch (err) {
    spinner.fail((err as Error).message);
    process.exit(1);
  }

  const updateSpinner = ora("Updating feather core…").start();
  try {
    await installCore(entries, target, branch, (f) => {
      updateSpinner.text = `Updating ${f}…`;
    }, installDir);
    updateSpinner.succeed("Feather core updated");
  } catch (err) {
    updateSpinner.fail((err as Error).message);
    process.exit(1);
  }

  console.log(chalk.bold("\nDone!") + " Feather core is up to date.\n");
}
