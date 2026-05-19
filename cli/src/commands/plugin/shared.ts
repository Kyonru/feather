import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeInstallDir } from '../../lib/install.js';
import { loadConfig } from '../../lib/config.js';
import { findPackageDir } from '../../lib/paths.js';
import { dangerousPluginIds, findInstalledPluginDirs, readPluginManifest } from '../../lib/plugin-utils.js';
import { printWarning } from '../../lib/output.js';

export type PluginSourceOptions = {
  dir?: string;
  branch?: string;
  installDir?: string;
  remote?: boolean;
  localSrc?: string;
  managed?: string;
};

/**
 * Returns the effective managed mode string for a project.
 * Priority: explicit override > feather.config.lua `managed` field > filesystem fallback.
 */
export function resolveManaged(projectDir: string, installDir: string, override?: string): string | undefined {
  if (override) return override;
  const config = loadConfig(projectDir);
  const fromConfig = config?.managed as string | undefined;
  if (fromConfig) return fromConfig;
  // Backward compat: no managed field but also no embedded runtime → infer CLI mode.
  const hasConfig = existsSync(join(projectDir, 'feather.config.lua')) || existsSync(join(projectDir, '.featherrc.lua'));
  if (hasConfig && !existsSync(join(projectDir, normalizeInstallDir(installDir), 'init.lua'))) {
    return 'cli';
  }
  return undefined;
}

export function resolvePluginProjectDir(dir?: string): string {
  return findPackageDir(dir ? resolve(dir) : process.cwd());
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

export function warnDangerousPlugin(pluginId: string): void {
  if (!dangerousPluginIds.has(pluginId)) return;
  printWarning(`! ${pluginId} is development-only and can execute remote/debug commands. Do not ship it in production builds.`);
}
