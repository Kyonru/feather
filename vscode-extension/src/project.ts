import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type ProjectStatus = {
  root: string | undefined;
  hasWorkspace: boolean;
  hasMain: boolean;
  hasConfig: boolean;
  hasRuntime: boolean;
  pluginCount: number;
  packageCount: number;
};

export function resolveProjectDir(configuredProjectDir: string | undefined, workspaceRoots: string[]): string | undefined {
  const configured = configuredProjectDir?.trim();
  if (configured) return resolve(configured);
  return workspaceRoots[0];
}

function countManifestFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countManifestFiles(path);
    } else if (entry.isFile() && entry.name === 'manifest.lua') {
      count += 1;
    }
  }
  return count;
}

function packageCount(root: string): number {
  const lockPath = join(root, 'feather.lock.json');
  if (!existsSync(lockPath)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as { packages?: Record<string, unknown> };
    return Object.keys(parsed.packages ?? {}).length;
  } catch {
    return 0;
  }
}

function configArrayValues(source: string, key: 'include' | 'exclude'): string[] {
  const withoutLineComments = source
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  const match = new RegExp(`\\b${key}\\s*=\\s*\\{([\\s\\S]*?)\\}`).exec(withoutLineComments);
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

function managedMode(source: string): string | undefined {
  return /\bmanaged\s*=\s*["']([^"']+)["']/.exec(source)?.[1];
}

function cliManagedPluginCount(root: string, hasRuntime: boolean): number | undefined {
  const configPath = join(root, 'feather.config.lua');
  if (!existsSync(configPath)) return undefined;

  try {
    const source = readFileSync(configPath, 'utf8');
    const mode = managedMode(source);
    if (mode !== 'cli' && hasRuntime) return undefined;

    const excluded = new Set(configArrayValues(source, 'exclude'));
    const included = new Set(configArrayValues(source, 'include').filter((id) => !excluded.has(id)));
    return included.size;
  } catch {
    return undefined;
  }
}

export function getProjectStatus(root: string | undefined): ProjectStatus {
  if (!root) {
    return {
      root,
      hasWorkspace: false,
      hasMain: false,
      hasConfig: false,
      hasRuntime: false,
      pluginCount: 0,
      packageCount: 0,
    };
  }

  const hasRuntime = existsSync(join(root, 'feather', 'init.lua'));

  return {
    root,
    hasWorkspace: true,
    hasMain: existsSync(join(root, 'main.lua')),
    hasConfig: existsSync(join(root, 'feather.config.lua')),
    hasRuntime,
    pluginCount: cliManagedPluginCount(root, hasRuntime) ?? countManifestFiles(join(root, 'feather', 'plugins')),
    packageCount: packageCount(root),
  };
}
