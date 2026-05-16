import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { findInstalledPluginDirs, readPluginManifest } from '../../lib/plugin-utils.js';
import { table } from '../../lib/output.js';
import { pluginsDir, resolvePluginProjectDir } from './shared.js';

export async function pluginListCommand(dir?: string, installDir = 'feather'): Promise<void> {
  const projectDir = resolvePluginProjectDir(dir);
  const dirPath = pluginsDir(projectDir, installDir);

  if (!existsSync(dirPath)) {
    console.log(chalk.dim('No plugins directory found. Run `feather init` first.'));
    return;
  }

  const dirs = findInstalledPluginDirs(dirPath);

  if (dirs.length === 0) {
    console.log(chalk.dim('No plugins installed.'));
    return;
  }

  console.log(chalk.bold(`\nInstalled plugins (${dirs.length})\n`));
  const rows = dirs.map((dir) => {
    const meta = readPluginManifest(dir);
    return {
      id: meta?.id ?? dir.replace(dirPath, '').replace(/^[/\\]/, ''),
      version: meta?.version ?? '',
      name: meta?.name ?? '',
    };
  });
  for (const line of table({
    columns: [
      { key: 'id', label: 'ID', color: (value) => chalk.cyan(value) },
      { key: 'version', label: 'VERSION', color: (value) => chalk.dim(value) },
      { key: 'name', label: 'NAME' },
    ],
    rows,
  })) {
    console.log(line);
  }
  console.log();
}

