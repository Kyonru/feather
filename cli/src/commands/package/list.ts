import chalk from 'chalk';
import { readLockfile, writeLockfile } from '../../lib/package/lockfile.js';
import { resolveMany } from '../../lib/package/resolve.js';
import { trustBadge } from '../../lib/trust.js';
import { showPackageBrowser } from '../../ui/package-workflow.js';
import { showInstallProgress } from '../../ui/package-progress.js';
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
      console.log(chalk.dim('No packages installed. Run `feather package install <name>`.'));
      return;
    }
    for (const [id, entry] of entries) {
      console.log(`  ${trustBadge(entry.trust)} ${chalk.bold(id)} @ ${entry.version}`);
    }
    console.log(chalk.dim(`\n${entries.length} package(s) installed.`));
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
      const installedLabel = installed ? chalk.cyan(` (installed ${installed.version})`) : '';
      console.log(`  ${trustBadge(entry.trust)} ${chalk.bold(id)}${installedLabel}  ${chalk.dim(entry.description)}`);
    }
    console.log(chalk.dim(`\n${entries.length} available.`));
    return;
  }

  const result = await showPackageBrowser({ registry, lockfile });
  if (result.action === 'cancel') return;

  const { resolved, errors } = resolveMany([result.id], registry);
  if (errors.length) {
    for (const e of errors) console.log(chalk.red(`  ✖ ${e}`));
    process.exitCode = 1;
    return;
  }

  if (result.action === 'remove') {
    await packageRemoveCommand(result.id, { dir: opts.dir });
    return;
  }

  const installResults = await showInstallProgress({ packages: resolved, lockfile, projectDir });
  if (installResults.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    process.exitCode = 1;
  }
}

