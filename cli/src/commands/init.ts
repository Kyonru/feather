import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { fetchManifest, installCore, installPlugin, getPluginIds, normalizeInstallDir } from '../lib/install.js';
import { configTemplate, luaKey, luaValue } from '../lib/config.js';
import { chooseInitMode, type InitMode, type InitSetup } from '../ui/init-mode.js';
import { pluginCatalog } from '../generated/plugin-catalog.js';

export interface InitOptions {
  branch?: string;
  noPlugins?: boolean;
  plugins?: string[];
  installDir?: string;
  yes?: boolean;
  mode?: InitMode;
}

const knownPlugins = pluginCatalog.map((plugin) => plugin.id);

const toLocalName = (id: string) =>
  id
    .split(/[-.]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

function toLuaModule(installDir = 'feather'): string {
  return normalizeInstallDir(installDir).replace(/\//g, '.');
}

function patchMainLua(mainPath: string, installDir = 'feather'): boolean {
  const src = readFileSync(mainPath, 'utf8');
  const luaModule = toLuaModule(installDir);
  if (src.includes(`${luaModule}.auto`) || src.includes('feather')) return false;

  const patch = `\n-- Feather debugger (https://github.com/Kyonru/feather)\nrequire("${luaModule}.auto")\n`;
  const updatePatch = `\n  if DEBUGGER then DEBUGGER:update(dt) end`;

  let out = patch + src;

  // Inject DEBUGGER:update into love.update if present
  out = out.replace(/function love\.update\s*\((\w+)\)\s*\n/, `function love.update($1)\n${updatePatch}\n`);

  writeFileSync(mainPath, out);
  return true;
}

export async function initCommand(dir: string, opts: InitOptions): Promise<void> {
  const target = resolve(dir);

  if (!existsSync(join(target, 'main.lua'))) {
    console.error(chalk.red(`No main.lua found in ${target}. Is this a love2d project?`));
    process.exit(1);
  }

  const setup: InitSetup =
    !opts.yes && process.stdin.isTTY
      ? await chooseInitMode(opts.mode ?? 'auto', basename(target), opts.branch ?? 'main', opts.installDir ?? 'feather')
      : {
          mode: opts.mode ?? 'auto',
          branch: opts.branch ?? 'main',
          installDir: opts.installDir ?? 'feather',
          installPlugins: opts.noPlugins ? false : true,
          config: {},
          exclude: [],
        };
  const mode = setup.mode;
  const installDir = normalizeInstallDir(setup.installDir);
  const pluginsDisabled = opts.noPlugins || setup.installPlugins === false;
  const alreadyInstalled = existsSync(join(target, installDir, 'init.lua'));

  if (mode === 'cli') {
    writeConfig(target, setup.config);
    console.log('\n' + chalk.bold('Done!') + ' Run this project through Feather CLI.\n');
    console.log(chalk.dim(`  feather run ${dir}`));
    console.log(chalk.dim('  Use `--config <path>` if feather.config.lua lives elsewhere.\n'));
    return;
  }

  if (alreadyInstalled) {
    console.log(chalk.yellow('Feather is already installed in this project.'));
    console.log(chalk.dim('Run `feather update` to update to the latest version.'));
  }

  const branch = setup.branch || opts.branch || 'main';
  let entries: Awaited<ReturnType<typeof fetchManifest>> = [];
  let installedPluginIds: string[] = [];

  if (!alreadyInstalled) {
    const spinner = ora('Fetching manifest…').start();

    try {
      entries = await fetchManifest(branch);
      spinner.succeed(`Manifest loaded (${entries.length} files)`);
    } catch (err) {
      spinner.fail(`Could not fetch manifest: ${(err as Error).message}`);
      process.exit(1);
    }

    // Install core
    const coreSpinner = ora('Installing feather core…').start();
    try {
      await installCore(entries, target, branch, (f) => {
        coreSpinner.text = `Installing ${f}…`;
      }, installDir);
      coreSpinner.succeed('Feather core installed');
    } catch (err) {
      coreSpinner.fail(`Core install failed: ${(err as Error).message}`);
      process.exit(1);
    }

    // Install plugins
    if (!pluginsDisabled) {
      const excluded = new Set(setup.exclude);
      const pluginIds = (opts.plugins ?? getPluginIds(entries)).filter((id) => !excluded.has(id));
      installedPluginIds = pluginIds;
      const pluginSpinner = ora(`Installing ${pluginIds.length} plugins…`).start();
      let failed = 0;
      for (const id of pluginIds) {
        try {
          await installPlugin(id, entries, target, branch, undefined, installDir);
          pluginSpinner.text = `Installed plugin: ${id}`;
        } catch {
          failed++;
        }
      }
      pluginSpinner.succeed(`Plugins installed${failed > 0 ? chalk.yellow(` (${failed} failed)`) : ''}`);
    }
  }

  if (mode === 'auto') {
    const mainPath = join(target, 'main.lua');
    const patched = patchMainLua(mainPath, installDir);
    if (patched) {
      console.log(chalk.green('✔') + ' Patched main.lua with feather.auto require');
    } else {
      console.log(chalk.dim('  main.lua already references feather — skipped patch'));
    }
  } else {
    console.log(chalk.dim('  Manual mode selected — main.lua left unchanged'));
  }

  writeConfig(target, setup.config);

  console.log('\n' + chalk.bold('Done!') + ' Start the Feather desktop app, then run your game.\n');

  if (mode === 'manual') {
    const pluginIds =
      installedPluginIds.length > 0
        ? installedPluginIds
        : pluginsDisabled
          ? []
          : (opts.plugins ?? knownPlugins).filter((id) => !setup.exclude.includes(id));
    console.log(chalk.bold('Manual setup example:'));
    console.log(chalk.dim('Add this near the top of main.lua, then call DEBUGGER:update(dt) from love.update.\n'));
    console.log(buildManualExample(setup.config, pluginIds, installDir));
  } else {
    console.log(chalk.dim('  Tip: use `feather run .` to inject without touching game code.\n'));
  }
}

function writeConfig(target: string, config: Record<string, unknown> = {}): void {
  const configPath = join(target, 'feather.config.lua');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, configTemplate(config));
    console.log(chalk.green('✔') + ' Created feather.config.lua');
  } else {
    console.log(chalk.dim('  feather.config.lua already exists — skipped'));
  }
}

function buildManualExample(config: Record<string, unknown>, pluginIds: string[], installDir = 'feather'): string {
  const luaModule = toLuaModule(installDir);
  const manualConfig: Record<string, unknown> = { debug: true, ...config };
  const lines: string[] = [
    `local FeatherDebugger = require("${luaModule}")`,
    `local FeatherPluginManager = require("${luaModule}.plugin_manager")`,
  ];

  for (const id of pluginIds) {
    lines.push(`local ${toLocalName(id)}Plugin = require("${luaModule}.plugins.${id}")`);
  }

  lines.push('', 'DEBUGGER = FeatherDebugger({');

  const configEntries = Object.entries(manualConfig).filter(
    ([key]) => key !== 'include' && key !== 'exclude' && key !== 'pluginOptions',
  );
  for (const [key, value] of configEntries) {
    lines.push(`  ${luaKey(key)} = ${luaValue(value, 2)},`);
  }

  if (pluginIds.length > 0) {
    const pluginOptions = (manualConfig.pluginOptions && typeof manualConfig.pluginOptions === 'object'
      ? (manualConfig.pluginOptions as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    lines.push('  plugins = {');
    for (const id of pluginIds) {
      const options = pluginOptions[id] ?? {};
      lines.push(`    FeatherPluginManager.createPlugin(${toLocalName(id)}Plugin, ${JSON.stringify(id)}, ${luaValue(options, 4)}),`);
    }
    lines.push('  },');
  } else {
    lines.push('  plugins = {},');
  }

  lines.push('})', '', 'function love.update(dt)', '  if DEBUGGER then DEBUGGER:update(dt) end', 'end');

  return lines.join('\n') + '\n';
}
