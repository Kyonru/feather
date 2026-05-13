import type { Registry, RegistryEntry, PackageFile } from "./registry.js";

export type ResolvedPackage = {
  id: string;
  entry: RegistryEntry;
  files: PackageFile[];
  /** Set when the user requested a version different from the registry pin (e.g. `anim8@v2.2.0`). */
  versionOverride?: string;
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

  const entry = registry.packages[id];
  if (!entry) {
    return { ok: false, error: `Package "${id}" not found in the registry. Run \`feather package search ${id}\` to check.` };
  }

  const versionOverride = version && version !== entry.source.tag ? version : undefined;

  return { ok: true, packages: [{ id, entry, files: entry.install.files, versionOverride }] };
}

export function resolveMany(specs: string[], registry: Registry): { resolved: ResolvedPackage[]; errors: string[] } {
  const resolved: ResolvedPackage[] = [];
  const errors: string[] = [];

  for (const spec of specs) {
    const result = resolvePackage(spec, registry);
    if (result.ok) {
      resolved.push(...result.packages);
    } else {
      errors.push(result.error);
    }
  }

  return { resolved, errors };
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
