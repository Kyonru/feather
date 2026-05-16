import { readLockfile, writeLockfile } from '../../lib/package/lockfile.js';
import type { ResolvedPackage } from '../../lib/package/resolve.js';
import { fail } from '../../lib/command.js';
import { printLine, printMuted, printWarning, style } from '../../lib/output.js';
import { showInstallProgress } from '../../ui/package-progress.js';
import { loadRegistryOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageUpdateOptions = {
  dryRun?: boolean;
  dir?: string;
  offline?: boolean;
  registryUrl?: string;
};

export async function packageUpdateCommand(name: string | undefined, opts: PackageUpdateOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);
  const lockfile = readLockfile(projectDir);

  const installed = Object.entries(lockfile.packages);
  if (installed.length === 0) {
    printMuted('No packages installed.');
    return;
  }

  const registry = await loadRegistryOrExit({ offline: opts.offline, registryUrl: opts.registryUrl });
  if (!registry) return;

  const targets = name ? installed.filter(([id]) => id === name) : installed;

  if (name && targets.length === 0) {
    fail(`"${name}" is not installed.`);
  }

  const toUpdate: ResolvedPackage[] = [];
  for (const [id, current] of targets) {
    if (current.trust === 'experimental') {
      printMuted(`  Skipping "${id}" (experimental — re-install with --from-url to update)`);
      continue;
    }
    const entry = registry.packages[id];
    if (!entry) {
      printWarning(`  "${id}" not found in registry — skipping`);
      continue;
    }
    if (entry.source.tag === current.version) {
      printMuted(`  ${id} is already up to date (${current.version})`);
      continue;
    }
    printLine(`  ${style.heading(id)}: ${current.version} → ${entry.source.tag}`);
    toUpdate.push({ id, entry, files: entry.install.files });
  }

  if (opts.dryRun || toUpdate.length === 0) return;

  const results = await showInstallProgress({ packages: toUpdate, lockfile, projectDir });
  if (results.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    fail('', { silent: true });
  }
}
