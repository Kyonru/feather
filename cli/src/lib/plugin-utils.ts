import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

export function readPluginManifest(dir: string): { id: string; name: string; version: string } | null {
  const manifestPath = join(dir, 'manifest.lua');
  if (!existsSync(manifestPath)) return null;
  const src = readFileSync(manifestPath, 'utf8');
  const get = (key: string) => src.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`))?.[1] ?? '';
  return { id: get('id'), name: get('name'), version: get('version') };
}
