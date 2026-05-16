import { existsSync } from 'node:fs';
import { findInstalledPluginDirs, readPluginManifest } from '../../lib/plugin-utils.js';
import { style, table } from '../../lib/output.js';
import { pluginsDir, resolvePluginProjectDir } from './shared.js';

export async function pluginListCommand(dir?: string, installDir = 'feather'): Promise<void> {
  const projectDir = resolvePluginProjectDir(dir);
  const dirPath = pluginsDir(projectDir, installDir);

  if (!existsSync(dirPath)) {
    console.log(style.muted('No plugins directory found. Run `feather init` first.'));
    return;
  }

  const dirs = findInstalledPluginDirs(dirPath);

  if (dirs.length === 0) {
    console.log(style.muted('No plugins installed.'));
    return;
  }

  console.log(style.heading(`\nInstalled plugins (${dirs.length})\n`));
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
      { key: 'id', label: 'ID', color: (value) => style.info(value) },
      { key: 'version', label: 'VERSION', color: (value) => style.muted(value) },
      { key: 'name', label: 'NAME' },
    ],
    rows,
  })) {
    console.log(line);
  }
  console.log();
}
