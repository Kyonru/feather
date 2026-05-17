import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fetchManifest, installCore, installCoreFromLocal, normalizeInstallDir } from "../lib/install.js";
import { chooseCoreUpdateWorkflow } from "../ui/update-workflow.js";
import { resolveLocalLuaRoot } from "../lib/paths.js";
import { fail } from "../lib/command.js";
import { createSpinner, printLine, printMuted, style } from "../lib/output.js";
import { assertSafeProjectTarget } from "../lib/path-safety.js";

export async function updateCommand(
  dir: string,
  opts: { branch?: string; remote?: boolean; localSrc?: string; installDir?: string; yes?: boolean }
): Promise<void> {
  const target = resolve(dir);
  const installDir = normalizeInstallDir(opts.installDir);
  let installedInit: string;
  try {
    installedInit = assertSafeProjectTarget(target, join(installDir, "init.lua"), "Core update target");
  } catch (err) {
    fail((err as Error).message);
  }

  if (!existsSync(installedInit)) {
    fail(`Feather is not installed in ${target}. Run \`feather init\` first.`);
  }

  let branch = opts.branch ?? "main";
  let useRemote = opts.remote === true;
  const hasExplicitSource = opts.remote === true || !!opts.localSrc || opts.yes === true;

  if (!hasExplicitSource && process.stdin.isTTY) {
    const result = await chooseCoreUpdateWorkflow(branch);
    if (result.cancelled) {
      printMuted("Update cancelled.");
      return;
    }
    useRemote = result.source === "remote";
    branch = result.branch;
  }

  if (!useRemote) {
    const sourceRoot = resolveLocalLuaRoot(opts);
    const spinner = createSpinner("Updating feather core from local copy…").start();
    try {
      installCoreFromLocal(sourceRoot, target, installDir, (file) => {
        spinner.text = `Updating ${file}…`;
      });
      spinner.succeed("Feather core updated");
    } catch (err) {
      spinner.fail((err as Error).message);
      fail((err as Error).message, { cause: err, silent: true });
    }

    printLine(`\n${style.heading("Done!")} Feather core is up to date.\n`);
    return;
  }

  const spinner = createSpinner("Fetching manifest…").start();

  let entries: Awaited<ReturnType<typeof fetchManifest>>;
  try {
    entries = await fetchManifest(branch);
    spinner.succeed(`Manifest loaded (${entries.length} files)`);
  } catch (err) {
    spinner.fail((err as Error).message);
    fail((err as Error).message, { cause: err, silent: true });
  }

  const updateSpinner = createSpinner("Updating feather core…").start();
  try {
    await installCore(entries, target, branch, (f) => {
      updateSpinner.text = `Updating ${f}…`;
    }, installDir);
    updateSpinner.succeed("Feather core updated");
  } catch (err) {
    updateSpinner.fail((err as Error).message);
    fail((err as Error).message, { cause: err, silent: true });
  }

  printLine(`\n${style.heading("Done!")} Feather core is up to date.\n`);
}
