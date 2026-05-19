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

  return {
    root,
    hasWorkspace: true,
    hasMain: existsSync(join(root, 'main.lua')),
    hasConfig: existsSync(join(root, 'feather.config.lua')),
    hasRuntime: existsSync(join(root, 'feather', 'init.lua')),
    pluginCount: countManifestFiles(join(root, 'feather', 'plugins')),
    packageCount: packageCount(root),
  };
}
