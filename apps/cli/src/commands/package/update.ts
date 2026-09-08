import { readCompatibleLockfile } from '../../lib/package/compat.js';
import { writeLockfile } from '../../lib/package/lockfile.js';
import { installPackage } from '../../lib/package/install.js';
import { dependencyInstallConflicts, resolveMany } from '../../lib/package/resolve.js';
import { fail } from '../../lib/command.js';
import { loadConfig } from '../../lib/config.js';
import { printJson, printLine, printMuted, printWarning, style } from '../../lib/output.js';
import { showInstallProgress } from '../../ui/package/index.js';
import { resolvedPackageJson } from './json.js';
import { loadRegistryOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageUpdateOptions = {
  dryRun?: boolean;
  dir?: string;
  offline?: boolean;
  registryUrl?: string;
  json?: boolean;
};

export async function packageUpdateCommand(name: string | undefined, opts: PackageUpdateOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);
  const config = loadConfig(projectDir);
  const includeLicenses = config?.packages?.installLicenses === true;
  const lockfile = readCompatibleLockfile(projectDir);

  const installed = Object.entries(lockfile.packages);
  if (installed.length === 0) {
    if (opts.json) {
      printJson({ projectDir, dryRun: opts.dryRun === true, updates: [], skipped: [], installed: [] });
      return;
    }
    printMuted('No packages installed.');
    return;
  }

  const registry = await loadRegistryOrExit({ offline: opts.offline, registryUrl: opts.registryUrl });
  if (!registry) return;

  const targets = name ? installed.filter(([id]) => id === name) : installed;

  if (name && targets.length === 0) {
    fail(`"${name}" is not installed.`);
  }

  const updateIds: string[] = [];
  const skipped: Array<{ id: string; reason: string; currentVersion?: string; latestVersion?: string }> = [];
  const updates: Array<{ id: string; currentVersion: string; latestVersion: string }> = [];
  for (const [id, current] of targets) {
    if (current.trust === 'experimental') {
      skipped.push({ id, reason: 'experimental', currentVersion: current.version });
      if (!opts.json) printMuted(`  Skipping "${id}" (experimental — re-install with --from-url to update)`);
      continue;
    }
    const entry = registry.packages[id];
    if (!entry) {
      skipped.push({ id, reason: 'missing-from-registry', currentVersion: current.version });
      if (!opts.json) printWarning(`  "${id}" not found in registry — skipping`);
      continue;
    }
    const latestVersion = entry.source.tag ?? current.version;
    if (latestVersion === current.version) {
      skipped.push({ id, reason: 'up-to-date', currentVersion: current.version, latestVersion });
      if (!opts.json) printMuted(`  ${id} is already up to date (${current.version})`);
      continue;
    }
    updates.push({ id, currentVersion: current.version, latestVersion });
    if (!opts.json) printLine(`  ${style.heading(id)}: ${current.version} → ${latestVersion}`);
    updateIds.push(id);
  }

  if (opts.dryRun || updateIds.length === 0) {
    if (opts.json) {
      printJson({ projectDir, dryRun: opts.dryRun === true, updates, skipped, installed: [] });
    }
    return;
  }

  const { resolved, errors } = resolveMany(updateIds, registry);
  if (errors.length) {
    fail(errors.join('\n'));
  }
  const dependencyConflicts = dependencyInstallConflicts(resolved, lockfile);
  if (dependencyConflicts.length > 0) {
    fail(dependencyConflicts.join('\n'));
  }
  const toUpdate = resolved.filter((pkg) => {
    const current = lockfile.packages[pkg.id];
    if (pkg.dependencyOf?.length && current?.version === pkg.entry.source.tag) {
      if (!opts.json) printMuted(`  ${pkg.id} is already installed at ${current.version}`);
      return false;
    }
    return true;
  });
  if (toUpdate.length === 0) {
    if (opts.json) printJson({ projectDir, dryRun: false, updates, skipped, installed: [] });
    return;
  }

  if (opts.json) {
    const planned = toUpdate.map((pkg) => resolvedPackageJson(pkg, lockfile, { includeLicenses }));
    const results = [];
    for (const pkg of toUpdate) {
      results.push(await installPackage(pkg, lockfile, { projectDir, includeLicenses }));
    }
    if (results.every((result) => result.ok)) writeLockfile(projectDir, lockfile);
    printJson({
      projectDir,
      dryRun: false,
      updates,
      skipped,
      planned,
      installed: results.filter((result) => result.ok),
      failed: results.filter((result) => !result.ok),
    });
    if (results.some((result) => !result.ok)) fail('', { silent: true });
    return;
  }

  const results = await showInstallProgress({ packages: toUpdate, lockfile, projectDir, includeLicenses });
  if (results.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    fail('', { silent: true });
  }
}
