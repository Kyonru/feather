import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeInstallDir } from '../../lib/install.js';
import { findProjectDir } from '../../lib/paths.js';
import { findInstalledPluginDirs, readPluginManifest } from '../../lib/plugin-utils.js';

export type PluginSourceOptions = {
  dir?: string;
  branch?: string;
  installDir?: string;
  remote?: boolean;
  localSrc?: string;
};

export function resolvePluginProjectDir(dir?: string): string {
  return dir ? resolve(dir) : findProjectDir();
}

export function pluginsDir(projectDir: string, installDir = 'feather'): string {
  return join(projectDir, normalizeInstallDir(installDir), 'plugins');
}

export function getInstalledPluginIds(projectDir: string, installDir = 'feather'): string[] {
  const dirPath = pluginsDir(projectDir, installDir);
  if (!existsSync(dirPath)) return [];

  return findInstalledPluginDirs(dirPath)
    .map((dir) => readPluginManifest(dir)?.id)
    .filter((id): id is string => Boolean(id))
    .sort();
}

