import { existsSync } from 'node:fs';
import { loadConfig } from '../../lib/config.js';
import { pluginCatalog } from '../../generated/plugin-catalog.js';
import { findInstalledPluginDirs, readPluginManifest } from '../../lib/plugin-utils.js';
import { printBlank, printHeading, printMuted, printTable, style } from '../../lib/output.js';
import { pluginsDir, resolveManaged, resolvePluginProjectDir } from './shared.js';

export async function pluginListCommand(dir?: string, installDir = 'feather', managed?: string): Promise<void> {
  const projectDir = resolvePluginProjectDir(dir);

  if (resolveManaged(projectDir, installDir, managed) === 'cli') {
    const config = loadConfig(projectDir);
    const included = Array.isArray(config?.include) ? (config.include as string[]) : [];
    if (included.length === 0) {
      printMuted('No plugins included. Run `feather plugin install <id>` to add one.');
      return;
    }
    const catalogMap = new Map(pluginCatalog.map((p) => [p.id, p]));
    printHeading(`\nIncluded plugins (${included.length})\n`);
    const rows = included.map((id) => {
      const meta = catalogMap.get(id);
      return { id, version: meta?.version ?? '', name: meta?.name ?? id };
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
    return;
  }

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
    const fallbackId = dir.replace(dirPath, '').replace(/^[/\\]/, '');
    return {
      id: meta?.id || fallbackId,
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
