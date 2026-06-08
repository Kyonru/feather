import type { Registry, RegistryEntry, PackageFile } from "./registry.js";
import type { Lockfile } from "./lockfile.js";

export type ResolvedPackage = {
  id: string;
  entry: RegistryEntry;
  files: PackageFile[];
  /** Set when the user requested a version different from the registry pin (e.g. `anim8@v2.2.0`). */
  versionOverride?: string;
  /** Set when this package was pulled in by one or more dependents. */
  dependencyOf?: string[];
  /** True when the package was requested directly by the user. */
  requested?: boolean;
};

/**
 * Parse a package spec that may include a version pin: "anim8@v2.2.0" → { id: "anim8", version: "v2.2.0" }.
 * Plain names ("anim8") return version undefined, meaning "use registry version".
 */
export function parseSpec(spec: string): { id: string; version: string | undefined } {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { id: spec, version: undefined };
  return { id: spec.slice(0, at), version: spec.slice(at + 1) };
}

export type ResolveResult =
  | { ok: true; packages: ResolvedPackage[] }
  | { ok: false; error: string };

/**
 * Resolve a package spec (e.g. "anim8" or "anim8@v2.2.0") to install entries.
 * When a version override is requested that differs from the registry pin,
 * `versionOverride` is set on the returned package so the installer knows to
 * fetch that tag and compute the checksum live.
 */
export function resolvePackage(spec: string, registry: Registry): ResolveResult {
  const { id, version } = parseSpec(spec);
  return resolveGraph([{ id, version }], registry);
}

export function resolveMany(specs: string[], registry: Registry): { resolved: ResolvedPackage[]; errors: string[] } {
  const parsedSpecs = specs.map(parseSpec);
  const result = resolveGraph(parsedSpecs, registry);
  return result.ok ? { resolved: result.packages, errors: [] } : { resolved: [], errors: [result.error] };
}

function resolveGraph(
  specs: Array<{ id: string; version: string | undefined }>,
  registry: Registry,
): ResolveResult {
  const errors: string[] = [];
  const resolved = new Map<string, ResolvedPackage>();
  const order: ResolvedPackage[] = [];
  const visiting: string[] = [];

  const addResolved = (
    id: string,
    entry: RegistryEntry,
    versionOverride: string | undefined,
    requested: boolean,
    dependencyOf: string | undefined,
  ) => {
    const existing = resolved.get(id);
    if (existing) {
      if (existing.versionOverride !== versionOverride) {
        errors.push(`Package "${id}" was requested with conflicting versions.`);
        return;
      }
      existing.requested = existing.requested || requested;
      if (dependencyOf && !existing.dependencyOf?.includes(dependencyOf)) {
        existing.dependencyOf = [...(existing.dependencyOf ?? []), dependencyOf];
      }
      return;
    }

    const next: ResolvedPackage = {
      id,
      entry,
      files: entry.install.files,
      versionOverride,
      ...(dependencyOf ? { dependencyOf: [dependencyOf] } : {}),
      ...(requested ? { requested: true } : {}),
    };
    resolved.set(id, next);
    order.push(next);
  };

  const visit = (id: string, version: string | undefined, requested: boolean, dependencyOf?: string) => {
    const entry = registry.packages[id];
    if (!entry) {
      errors.push(`Package "${id}" not found in the registry. Run \`feather package search ${id}\` to check.`);
      return;
    }

    if (visiting.includes(id)) {
      errors.push(`Package dependency cycle: ${[...visiting.slice(visiting.indexOf(id)), id].join(" -> ")}`);
      return;
    }

    const versionOverride = version && version !== entry.source.tag ? version : undefined;
    visiting.push(id);
    for (const dependency of entry.dependencies ?? []) {
      visit(dependency, undefined, false, id);
    }
    visiting.pop();
    addResolved(id, entry, versionOverride, requested, dependencyOf);
  };

  for (const spec of specs) {
    visit(spec.id, spec.version, true);
  }

  return errors.length > 0 ? { ok: false, error: errors.join("\n") } : { ok: true, packages: order };
}

export function filterTrust(
  packages: ResolvedPackage[],
  allowUntrusted: boolean
): { allowed: ResolvedPackage[]; blocked: ResolvedPackage[] } {
  const allowed: ResolvedPackage[] = [];
  const blocked: ResolvedPackage[] = [];

  for (const pkg of packages) {
    if (pkg.entry.trust === "experimental" && !allowUntrusted) {
      blocked.push(pkg);
    } else {
      allowed.push(pkg);
    }
  }

  return { allowed, blocked };
}

export function formatRequireHint(pkg: ResolvedPackage): string {
  return pkg.entry.example ?? `local ${pkg.id.replace(/\W/g, "_")} = require("${pkg.entry.require}")`;
}

export function dependencyInstallConflicts(packages: ResolvedPackage[], lockfile: Lockfile): string[] {
  const conflicts: string[] = [];
  for (const pkg of packages) {
    const existing = lockfile.packages[pkg.id];
    if (pkg.dependencyOf?.length && existing && (existing.version !== pkg.entry.source.tag || existing.trust === "experimental")) {
      conflicts.push(
        `"${pkg.id}" is required by ${pkg.dependencyOf.join(", ")} but is already installed as ${existing.version}. ` +
          `Remove or update it before installing dependent packages.`,
      );
    }
  }
  return conflicts;
}
