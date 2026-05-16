import { readLockfile, writeLockfile } from '../../lib/package/lockfile.js';
import { resolveMany } from '../../lib/package/resolve.js';
import { fail } from '../../lib/command.js';
import { icon, printLine, printMuted, style } from '../../lib/output.js';
import { trustBadge } from '../../lib/trust.js';
import { showInstallProgress, showPackageBrowser } from '../../ui/package/index.js';
import { packageRemoveCommand } from './remove.js';
import { loadRegistryOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageListOptions = {
  installed?: boolean;
  offline?: boolean;
  refresh?: boolean;
  dir?: string;
  registryUrl?: string;
};

export async function packageListCommand(opts: PackageListOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);

  if (opts.installed) {
    const lockfile = readLockfile(projectDir);
    const entries = Object.entries(lockfile.packages);
    if (entries.length === 0) {
      printMuted('No packages installed. Run `feather package install <name>`.');
      return;
    }
    for (const [id, entry] of entries) {
      printLine(`  ${trustBadge(entry.trust)} ${style.heading(id)} @ ${entry.version}`);
    }
    printMuted(`\n${entries.length} package(s) installed.`);
    return;
  }

  const registry = await loadRegistryOrExit({
    offline: opts.offline,
    refresh: opts.refresh,
    registryUrl: opts.registryUrl,
  });
  if (!registry) return;

  const lockfile = readLockfile(projectDir);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const entries = Object.entries(registry.packages).filter(([, e]) => !e.parent);
    for (const [id, entry] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      const installed = lockfile.packages[id];
      const installedLabel = installed ? style.info(` (installed ${installed.version})`) : '';
      printLine(`  ${trustBadge(entry.trust)} ${style.heading(id)}${installedLabel}  ${style.muted(entry.description)}`);
    }
    printMuted(`\n${entries.length} available.`);
    return;
  }

  const result = await showPackageBrowser({ registry, lockfile });
  if (result.action === 'cancel') return;

  const { resolved, errors } = resolveMany([result.id], registry);
  if (errors.length) {
    for (const e of errors) printLine(`  ${icon.error} ${style.danger(e)}`);
    fail('', { silent: true });
  }

  if (result.action === 'remove') {
    await packageRemoveCommand(result.id, { dir: opts.dir });
    return;
  }

  const installResults = await showInstallProgress({ packages: resolved, lockfile, projectDir });
  if (installResults.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    fail('', { silent: true });
  }
}
