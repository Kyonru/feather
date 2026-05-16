import { resolve } from 'node:path';
import ora from 'ora';
import { findProjectDir } from '../../lib/paths.js';
import { loadRegistry, type Registry, type RegistryLoadOptions } from '../../lib/package/registry.js';
import { statusLine, style } from '../../lib/output.js';

export function resolvePackageProjectDir(dir?: string): string {
  return dir ? resolve(dir) : findProjectDir();
}

export async function loadRegistryOrExit(
  opts: RegistryLoadOptions,
  message = 'Loading registry…',
): Promise<Registry | null> {
  const spinner = ora(message).start();
  try {
    const registry = await loadRegistry(opts);
    spinner.stop();
    return registry;
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    process.exitCode = 1;
    return null;
  }
}

export function ensurePackageAddInteractive(): boolean {
  if (process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === 'function') {
    return true;
  }

  console.log(statusLine('error', '`feather package add` requires an interactive terminal.'));
  console.log(
    style.muted(
      'Run it from a real TTY, or use `feather package install --from-url <url> --target <path> --allow-untrusted` for scripts.',
    ),
  );
  process.exitCode = 1;
  return false;
}

