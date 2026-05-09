import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { fetchManifest, installCore, installPlugin, getPluginIds } from "../lib/install.js";
import { configTemplate } from "../lib/config.js";

export interface InitOptions {
  branch?: string;
  noPlugins?: boolean;
  plugins?: string[];
  yes?: boolean;
}

function patchMainLua(mainPath: string): boolean {
  const src = readFileSync(mainPath, "utf8");
  if (src.includes("feather.auto") || src.includes("feather")) return false;

  const patch = `\n-- Feather debugger (https://github.com/Kyonru/feather)\nrequire("feather.auto")\n`;
  const updatePatch = `\n  if DEBUGGER then DEBUGGER:update(dt) end`;

  let out = patch + src;

  // Inject DEBUGGER:update into love.update if present
  out = out.replace(
    /function love\.update\s*\((\w+)\)\s*\n/,
    `function love.update($1)\n${updatePatch}\n`
  );

  writeFileSync(mainPath, out);
  return true;
}

export async function initCommand(dir: string, opts: InitOptions): Promise<void> {
  const target = resolve(dir);

  if (!existsSync(join(target, "main.lua"))) {
    console.error(chalk.red(`No main.lua found in ${target}. Is this a love2d project?`));
    process.exit(1);
  }

  if (existsSync(join(target, "feather", "init.lua"))) {
    console.log(chalk.yellow("Feather is already installed in this project."));
    console.log(chalk.dim("Run `feather update` to update to the latest version."));
    return;
  }

  const branch = opts.branch ?? "main";
  const spinner = ora("Fetching manifest…").start();

  let entries: Awaited<ReturnType<typeof fetchManifest>>;
  try {
    entries = await fetchManifest(branch);
    spinner.succeed(`Manifest loaded (${entries.length} files)`);
  } catch (err) {
    spinner.fail(`Could not fetch manifest: ${(err as Error).message}`);
    process.exit(1);
  }

  // Install core
  const coreSpinner = ora("Installing feather core…").start();
  try {
    await installCore(entries, target, branch, (f) => {
      coreSpinner.text = `Installing ${f}…`;
    });
    coreSpinner.succeed("Feather core installed");
  } catch (err) {
    coreSpinner.fail(`Core install failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // Install plugins
  if (!opts.noPlugins) {
    const pluginIds = opts.plugins ?? getPluginIds(entries);
    const pluginSpinner = ora(`Installing ${pluginIds.length} plugins…`).start();
    let failed = 0;
    for (const id of pluginIds) {
      try {
        await installPlugin(id, entries, target, branch);
        pluginSpinner.text = `Installed plugin: ${id}`;
      } catch {
        failed++;
      }
    }
    pluginSpinner.succeed(
      `Plugins installed${failed > 0 ? chalk.yellow(` (${failed} failed)`) : ""}`
    );
  }

  // Patch main.lua (unless using CLI-run mode)
  const mainPath = join(target, "main.lua");
  const patched = patchMainLua(mainPath);
  if (patched) {
    console.log(chalk.green("✔") + " Patched main.lua with feather.auto require");
  } else {
    console.log(chalk.dim("  main.lua already references feather — skipped patch"));
  }

  // Write config template if absent
  const configPath = join(target, "feather.config.lua");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, configTemplate());
    console.log(chalk.green("✔") + " Created feather.config.lua");
  }

  console.log("\n" + chalk.bold("Done!") + " Start the Feather desktop app, then run your game.\n");
  console.log(chalk.dim("  Tip: use `feather run .` to inject without touching game code.\n"));
}
