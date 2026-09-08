import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type * as vscode from 'vscode';

export type PluginEntry = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  optIn: boolean;
};

export type PackageEntry = {
  id: string;
  description: string;
  version: string;
  trust: string;
  tags: string[];
  installed?: boolean;
};

type RegistryFile = {
  packages: Record<string, {
    description: string;
    trust: string;
    tags?: string[];
    parent?: string;
    source?: { tag?: string };
  }>;
};

export async function loadPluginCatalog(context: vscode.ExtensionContext): Promise<PluginEntry[]> {
  const file = join(context.extensionPath, 'bundled-bin', 'plugin-catalog.json');
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, 'utf8')) as PluginEntry[];
  return [...data].sort((a, b) => a.name.localeCompare(b.name));
}

export function loadPackageCatalog(context: vscode.ExtensionContext, installedIds = new Set<string>()): PackageEntry[] {
  const file = join(context.extensionPath, 'bundled-bin', 'registry.json');
  if (!existsSync(file)) return [];
  const registry = JSON.parse(readFileSync(file, 'utf8')) as RegistryFile;
  return Object.entries(registry.packages)
    .filter(([, entry]) => !entry.parent)
    .map(([id, entry]) => ({
      id,
      description: entry.description,
      version: entry.source?.tag ?? 'unknown',
      trust: entry.trust,
      tags: entry.tags ?? [],
      installed: installedIds.has(id),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readInstalledPackageIds(root: string): Set<string> {
  const file = join(root, 'feather.lock.json');
  if (!existsSync(file)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { packages?: Record<string, unknown> };
    return new Set(Object.keys(parsed.packages ?? {}));
  } catch {
    return new Set();
  }
}
