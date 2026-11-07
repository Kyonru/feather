import { resolve } from 'node:path';
import { findPackageDir } from '../../lib/paths.js';
import {
  loadRegistryWithStatus,
  registryStatusNotice,
  type Registry,
  type RegistryLoad,
  type RegistryLoadOptions,
} from '../../lib/package/registry.js';
import { fail } from '../../lib/command.js';
import { createSpinner, printMuted, printStatus, printWarning } from '../../lib/output.js';

export function resolvePackageProjectDir(dir?: string): string {
  return findPackageDir(dir ? resolve(dir) : process.cwd());
}

/** Print where the registry data came from. JSON callers put `registryStatusJson` in their payload instead. */
export function printRegistryStatus(load: RegistryLoad): void {
  const notice = registryStatusNotice(load);
  if (!notice) return;
  if (notice.level === 'warn') printWarning(notice.message);
  else printMuted(notice.message);
}

export async function loadRegistryStatusOrExit(
  opts: RegistryLoadOptions & { json?: boolean },
  message = 'Loading registry…',
): Promise<RegistryLoad | null> {
  const spinner = createSpinner(message).start();
  try {
    const load = await loadRegistryWithStatus(opts);
    spinner.stop();
    if (!opts.json) printRegistryStatus(load);
    return load;
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    fail((err as Error).message, { silent: true, cause: err });
    return null;
  }
}

export async function loadRegistryOrExit(
  opts: RegistryLoadOptions & { json?: boolean },
  message = 'Loading registry…',
): Promise<Registry | null> {
  return (await loadRegistryStatusOrExit(opts, message))?.registry ?? null;
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
