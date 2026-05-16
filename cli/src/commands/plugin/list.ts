import { existsSync } from 'node:fs';
import { findInstalledPluginDirs, readPluginManifest } from '../../lib/plugin-utils.js';
import { printBlank, printHeading, printMuted, printTable, style } from '../../lib/output.js';
import { pluginsDir, resolvePluginProjectDir } from './shared.js';

export async function pluginListCommand(dir?: string, installDir = 'feather'): Promise<void> {
  const projectDir = resolvePluginProjectDir(dir);
  const dirPath = pluginsDir(projectDir, installDir);

  if (!existsSync(dirPath)) {
    printMuted('No plugins directory found. Run `feather init` first.');
    return;
  }

  const dirs = findInstalledPluginDirs(dirPath);

  if (dirs.length === 0) {
    printMuted('No plugins installed.');
    return;
  }

  printHeading(`\nInstalled plugins (${dirs.length})\n`);
  const rows = dirs.map((dir) => {
    const meta = readPluginManifest(dir);
    return {
      id: meta?.id ?? dir.replace(dirPath, '').replace(/^[/\\]/, ''),
      version: meta?.version ?? '',
      name: meta?.name ?? '',
    };
  });
  printTable({
    columns: [
      { key: 'id', label: 'ID', color: (value) => style.info(value) },
      { key: 'version', label: 'VERSION', color: (value) => style.muted(value) },
      { key: 'name', label: 'NAME' },
    ],
    rows,
  });
  printBlank();
}
