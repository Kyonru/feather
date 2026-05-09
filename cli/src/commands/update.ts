import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { fetchManifest, installCore } from "../lib/install.js";

export async function updateCommand(dir: string, opts: { branch?: string }): Promise<void> {
  const target = resolve(dir);

  if (!existsSync(join(target, "feather", "init.lua"))) {
    console.error(chalk.red(`Feather is not installed in ${target}. Run \`feather init\` first.`));
    process.exit(1);
  }

  const branch = opts.branch ?? "main";
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
    });
    updateSpinner.succeed("Feather core updated");
  } catch (err) {
    updateSpinner.fail((err as Error).message);
    process.exit(1);
  }

  console.log(chalk.bold("\nDone!") + " Feather core is up to date.\n");
}
