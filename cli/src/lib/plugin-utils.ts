import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
};

export type PluginTrust = 'bundled-core' | 'bundled-opt-in' | 'local' | 'remote' | 'unknown' | 'malformed';

export const dangerousPluginIds = new Set(['console', 'hot-reload']);

export function parseManagedValue(src: string, key: string): string | null {
  return src.match(new RegExp(`^--\\s*${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
}

export function findInstalledPluginDirs(root: string): string[] {
  if (!existsSync(root)) return [];

  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    if (existsSync(join(dir, 'manifest.lua'))) {
      found.push(dir);
    } else {
      found.push(...findInstalledPluginDirs(dir));
    }
  }
  return found;
}

export function readPluginManifest(dir: string): PluginManifest | null {
  const manifestPath = join(dir, 'manifest.lua');
  if (!existsSync(manifestPath)) return null;
  const src = readFileSync(manifestPath, 'utf8');
  const get = (key: string) => src.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`))?.[1] ?? '';
  return { id: get('id'), name: get('name'), version: get('version') };
}

export function isValidPluginId(id: string): boolean {
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(id) && !id.split('.').includes('..');
}

export function assertValidPluginId(id: string): void {
  if (!isValidPluginId(id)) {
    throw new Error(`Invalid plugin id: ${id}`);
  }
}

export function isValidPluginVersion(version: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(version);
}

export function pluginIdToSourceDir(id: string): string {
  assertValidPluginId(id);
  return id.replace(/\./g, '/');
}

export function isSafePluginRelativePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return Boolean(normalized) && !isAbsolute(normalized) && !normalized.split('/').some((part) => part === '' || part === '..');
}

export function validatePluginManifest(
  dir: string,
  options: { expectedId?: string; expectedSourceDir?: string } = {},
): PluginManifest {
  const manifest = readPluginManifest(dir);
  if (!manifest) throw new Error(`Missing plugin manifest: ${join(dir, 'manifest.lua')}`);
  if (!manifest.id) throw new Error(`Plugin manifest is missing id: ${join(dir, 'manifest.lua')}`);
  if (!isValidPluginId(manifest.id)) throw new Error(`Plugin manifest has invalid id: ${manifest.id}`);
  if (!manifest.version) throw new Error(`Plugin manifest is missing version: ${manifest.id}`);
  if (!isValidPluginVersion(manifest.version)) throw new Error(`Plugin manifest has invalid version: ${manifest.id}`);
  if (options.expectedId && manifest.id !== options.expectedId) {
    throw new Error(`Plugin manifest id mismatch: expected ${options.expectedId}, found ${manifest.id}`);
  }
  if (options.expectedSourceDir) {
    const expectedSourceDir = options.expectedSourceDir.replace(/\\/g, '/');
    const actualSourceDir = pluginIdToSourceDir(manifest.id);
    if (actualSourceDir !== expectedSourceDir) {
      throw new Error(`Plugin manifest path mismatch: ${manifest.id} should live in plugins/${actualSourceDir}`);
    }
  }
  return manifest;
}

export function classifyPluginTrust(
  manifest: PluginManifest | null,
  catalogEntry?: { optIn?: boolean } | null,
): PluginTrust {
  if (!manifest?.id || !manifest.version) return 'malformed';
  if (catalogEntry) return catalogEntry.optIn ? 'bundled-opt-in' : 'bundled-core';
  return 'unknown';
}

export function pluginTrustLabel(trust: PluginTrust): string {
  if (trust === 'bundled-core') return 'bundled/core';
  if (trust === 'bundled-opt-in') return 'opt-in bundled';
  if (trust === 'local') return 'local';
  if (trust === 'remote') return 'remote';
  if (trust === 'unknown') return 'unknown';
  return 'malformed';
}

export function findLocalPluginIds(sourceRoot: string): string[] {
  const pluginsRoot = join(sourceRoot, 'plugins');
  if (!existsSync(pluginsRoot)) return [];

  const ids: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = join(dir, entry.name);
      const manifest = join(pluginDir, 'manifest.lua');
      if (existsSync(manifest)) {
        try {
          const sourceDir = relative(pluginsRoot, pluginDir).replace(/\\/g, '/');
          ids.push(validatePluginManifest(pluginDir, { expectedSourceDir: sourceDir }).id);
        } catch {
          // Invalid local plugins are intentionally omitted from discovery, but
          // explicit install/update still validates and reports the concrete issue.
        }
      } else {
        visit(pluginDir);
      }
    }
  };

  visit(pluginsRoot);
  return ids.sort();
}
