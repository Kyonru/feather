import { resolve } from 'node:path';
import { findPackageDir } from '../../lib/paths.js';
import { loadRegistry, type Registry, type RegistryLoadOptions } from '../../lib/package/registry.js';
import { fail } from '../../lib/command.js';
import { createSpinner, printMuted, printStatus } from '../../lib/output.js';

export function resolvePackageProjectDir(dir?: string): string {
  return findPackageDir(dir ? resolve(dir) : process.cwd());
}

export async function loadRegistryOrExit(
  opts: RegistryLoadOptions,
  message = 'Loading registry…',
): Promise<Registry | null> {
  const spinner = createSpinner(message).start();
  try {
    const registry = await loadRegistry(opts);
    spinner.stop();
    return registry;
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    fail((err as Error).message, { silent: true, cause: err });
    return null;
  }
}

export function ensurePackageAddInteractive(): boolean {
  if (process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === 'function') {
    return true;
  }

  printStatus('error', '`feather package add` requires an interactive terminal.');
  printMuted('Run it from a real TTY, or use `feather package install --from-url <url> --target-path <path> --allow-untrusted` for scripts.');
  fail('', { silent: true });
  return false;
}
