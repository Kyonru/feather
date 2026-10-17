import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read-only snapshots the CLI build produced, copied into bundled-bin/ by
// prepare.mjs. They are display data for pickers; the CLI decides what an
// install actually does.

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

export type CliDefaults = {
  /** The plugins `feather init` includes when none are named (`defaultIncludedPluginIds`). */
  initPlugins: string[];
};

function readBundled<T>(extensionPath: string, name: string): T | undefined {
  const file = join(extensionPath, 'bundled-bin', name);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function loadPluginCatalog(extensionPath: string): PluginEntry[] {
  const data = readBundled<PluginEntry[]>(extensionPath, 'plugin-catalog.json') ?? [];
  return [...data].sort((a, b) => a.name.localeCompare(b.name));
}

export function loadPackageCatalog(extensionPath: string, installedIds: ReadonlySet<string> = new Set()): PackageEntry[] {
  const registry = readBundled<RegistryFile>(extensionPath, 'registry.json');
  if (!registry) return [];
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

export function loadCliDefaults(extensionPath: string): CliDefaults {
  return readBundled<CliDefaults>(extensionPath, 'cli-defaults.json') ?? { initPlugins: [] };
}
