import { readCompatibleLockfile } from '../../lib/package/compat.js';
import { installPackages } from '../../lib/package/install.js';
import { registryStatusJson } from '../../lib/package/registry.js';
import { dependencyInstallConflicts, resolveMany } from '../../lib/package/resolve.js';
import { fail } from '../../lib/command.js';
import { loadConfig } from '../../lib/config.js';
import { printJson, printLine, printMuted, printWarning, style } from '../../lib/output.js';
import { showInstallProgress } from '../../ui/package/index.js';
import { resolvedPackageJson } from './json.js';
import { loadRegistryStatusOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageUpdateOptions = {
  dryRun?: boolean;
  dir?: string;
  offline?: boolean;
  registryUrl?: string;
  json?: boolean;
  /** Overwrite locally modified package files with the updated versions. */
  force?: boolean;
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

  const load = await loadRegistryStatusOrExit({ offline: opts.offline, registryUrl: opts.registryUrl, json: opts.json });
  if (!load) return;
  const { registry } = load;
  const registryJson = registryStatusJson(load);

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
      printJson({ projectDir, dryRun: opts.dryRun === true, updates, skipped, installed: [], registry: registryJson });
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
    if (opts.json) printJson({ projectDir, dryRun: false, updates, skipped, installed: [], registry: registryJson });
    return;
  }

  if (opts.json) {
    const planned = toUpdate.map((pkg) => resolvedPackageJson(pkg, lockfile, { includeLicenses }));
    // One transaction for every update; feather.lock.json is replaced last, only on success.
    const batch = await installPackages(toUpdate, lockfile, { projectDir, includeLicenses, force: opts.force });
    const results = batch.results;
    printJson({
      projectDir,
      dryRun: false,
      updates,
      skipped,
      planned,
      installed: results.filter((result) => result.ok),
      failed: results.filter((result) => !result.ok),
      warnings: batch.warnings,
      registry: registryJson,
    });
    if (!batch.ok) fail('', { silent: true });
    return;
  }

  const results = await showInstallProgress({ packages: toUpdate, lockfile, projectDir, includeLicenses, force: opts.force });
  if (!results.every((r) => r.ok)) fail('', { silent: true });
}
