import { planDependencyAliases } from '../../lib/package/aliases.js';
import { planPackageLicenses } from '../../lib/package/licenses.js';
import type { Lockfile, LockfileEntry } from '../../lib/package/lockfile.js';
import type { RegistryEntry } from '../../lib/package/registry.js';
import type { ResolvedPackage } from '../../lib/package/resolve.js';
import { planPackageTarget } from '../../lib/package/target.js';

export function packageCatalogJson(id: string, entry: RegistryEntry, installed?: LockfileEntry) {
  return {
    id,
    description: entry.description,
    version: entry.source.tag,
    trust: entry.trust,
    tags: entry.tags,
    parent: entry.parent,
    type: entry.type,
    require: entry.require,
    dependencies: entry.dependencies ?? [],
    subpackages: entry.subpackages ?? [],
    homepage: entry.homepage,
    license: entry.license,
    installedVersion: installed?.version,
  };
}

export function packageLockJson(id: string, entry: LockfileEntry) {
  return {
    id,
    parent: entry.parent,
    version: entry.version,
    trust: entry.trust,
    source: entry.source,
    installDir: entry.installDir,
    installedAt: entry.installedAt,
    files: entry.files.map((file) => ({
      name: file.name,
      target: file.target,
      sha256: file.sha256,
      role: file.role,
      generated: file.generated,
    })),
  };
}

export function resolvedPackageJson(
  pkg: ResolvedPackage,
  lockfile: Lockfile,
  options: { targetOverride?: string; installDir?: string; includeLicenses?: boolean } = {},
) {
  const existing = lockfile.packages[pkg.id];
  const displayVersion = pkg.versionOverride ?? pkg.entry.source.tag;
  const savedInstallDir = existing?.installDir;
  const installDir = options.installDir ?? savedInstallDir;
  const layout = pkg.entry.install.layout;
  const files = pkg.files.map((file) => ({
    name: file.name,
    source: file.url ?? file.name,
    target: planPackageTarget(file, {
      targetOverride: options.targetOverride,
      installDir,
      layout,
    }),
    sha256: file.sha256,
  }));
  const licenses = options.includeLicenses
    ? planPackageLicenses(pkg.id, pkg.files, pkg.entry.install.licenses, {
        targetOverride: options.targetOverride,
        installDir,
        layout,
      })
    : [];
  const aliases = planDependencyAliases(pkg, lockfile, {
    installDir,
    targetOverride: options.targetOverride,
    dryRun: true,
  });

  return {
    id: pkg.id,
    version: displayVersion,
    trust: pkg.versionOverride ? 'experimental' : pkg.entry.trust,
    requested: pkg.requested === true,
    dependencyOf: pkg.dependencyOf ?? [],
    files,
    licenses,
    aliases: aliases.ok ? aliases.aliases : [],
    aliasError: aliases.ok ? undefined : aliases.error,
  };
}
