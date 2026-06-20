import { readCompatibleLockfile } from '../../lib/package/compat.js';
import { writeLockfile } from '../../lib/package/lockfile.js';
import { dependencyInstallConflicts, resolveMany } from '../../lib/package/resolve.js';
import { fail } from '../../lib/command.js';
import { icon, printJson, printLine, printMuted, style } from '../../lib/output.js';
import { trustBadge } from '../../lib/trust.js';
import { showInstallProgress, showPackageBrowser } from '../../ui/package/index.js';
import { packageRemoveCommand } from './remove.js';
import { packageCatalogJson, packageLockJson } from './json.js';
import { loadRegistryOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageListOptions = {
  installed?: boolean;
  offline?: boolean;
  refresh?: boolean;
  dir?: string;
  registryUrl?: string;
  json?: boolean;
};

export async function packageListCommand(opts: PackageListOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);

  if (opts.installed) {
    const lockfile = readCompatibleLockfile(projectDir);
    const entries = Object.entries(lockfile.packages);
    if (opts.json) {
      printJson({
        projectDir,
        installedOnly: true,
        count: entries.length,
        packages: entries.map(([id, entry]) => packageLockJson(id, entry)),
      });
      return;
    }
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

  const lockfile = readCompatibleLockfile(projectDir);
  const entries = Object.entries(registry.packages).filter(([, e]) => !e.parent);

  if (opts.json) {
    printJson({
      projectDir,
      installedOnly: false,
      count: entries.length,
      packages: entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, entry]) => packageCatalogJson(id, entry, lockfile.packages[id])),
    });
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
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
  const dependencyConflicts = dependencyInstallConflicts(resolved, lockfile);
  if (dependencyConflicts.length > 0) {
    fail(dependencyConflicts.join('\n'));
  }

  if (result.action === 'remove') {
    await packageRemoveCommand(result.id, { dir: opts.dir });
    return;
  }

  for (const pkg of resolved) {
    if (pkg.entry.trust === 'experimental') {
      fail(`"${pkg.id}" requires --allow-untrusted (trust: experimental). Run \`feather package install ${pkg.id} --allow-untrusted\`.`);
    }
    if (pkg.versionOverride) {
      fail(`"${pkg.id}@${pkg.versionOverride}" requires --allow-untrusted. Run \`feather package install ${pkg.id}@${pkg.versionOverride} --allow-untrusted\`.`);
    }
  }

  const installResults = await showInstallProgress({ packages: resolved, lockfile, projectDir });
  if (installResults.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    fail('', { silent: true });
  }
}
