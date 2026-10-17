import { cloneLockfile, removeFromLockfile, type Lockfile } from "./lockfile.js";
import { buildOwnershipIndex, canonicalTarget, inspectDiskTarget } from "./ownership.js";
import type { Registry } from "./registry.js";
import { resolveProjectTarget } from "./target.js";
import {
  commitPackageTransaction,
  type TransactionDelete,
  type TransactionHooks,
} from "./transaction.js";

export type PreservedFile = {
  id: string;
  target: string;
  /** `modified`: local edits kept, ownership dropped. `shared`: still owned by another installed package. */
  reason: "modified" | "symlink" | "shared";
};

export type RemovalPlan = {
  /** Packages removed by this command: the requested one plus, with cascade, its dependents. */
  ids: string[];
  deletes: Array<TransactionDelete & { id: string }>;
  preserved: PreservedFile[];
  missing: Array<{ id: string; target: string }>;
  /** Installed packages that depend on the requested package (transitively). */
  dependents: string[];
};

export type RemovalPlanResult =
  | { ok: true; plan: RemovalPlan }
  | { ok: false; error: string; dependents: string[] };

/** Dependencies of an installed package: recorded in the lockfile, or from the catalog for older lockfiles. */
export function installedDependencies(lockfile: Lockfile, id: string, registry?: Registry): string[] {
  const entry = lockfile.packages[id];
  if (!entry) return [];
  if (entry.dependencies) return entry.dependencies;
  // Older lockfiles did not record dependencies; fall back to the catalog when the entry came from it.
  const catalog = registry?.packages[id];
  if (!catalog || !("repo" in entry.source) || entry.source.repo !== catalog.source.repo) return [];
  return catalog.dependencies ?? [];
}

/** Installed packages that require `id`, directly or through other installed packages. */
export function installedDependents(lockfile: Lockfile, id: string, registry?: Registry): string[] {
  const found = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const candidate of Object.keys(lockfile.packages)) {
      if (candidate === id || found.has(candidate)) continue;
      if (installedDependencies(lockfile, candidate, registry).includes(current)) {
        found.add(candidate);
        queue.push(candidate);
      }
    }
  }
  return [...found].sort();
}

export function planPackageRemoval(
  projectDir: string,
  lockfile: Lockfile,
  name: string,
  opts: { cascade?: boolean; registry?: Registry } = {},
): RemovalPlanResult {
  if (!lockfile.packages[name]) return { ok: false, error: `"${name}" is not installed.`, dependents: [] };

  const dependents = installedDependents(lockfile, name, opts.registry);
  if (dependents.length > 0 && !opts.cascade) {
    return {
      ok: false,
      dependents,
      error:
        `"${name}" is required by ${dependents.join(", ")}. Remove ${dependents.length === 1 ? "that package" : "those packages"} first, ` +
        `or run \`feather package remove ${name} --cascade\` to remove ${name} and ${dependents.join(", ")} together.`,
    };
  }

  const ids = [name, ...dependents];
  const removing = new Set(ids);
  const index = buildOwnershipIndex(lockfile);
  const deletes: RemovalPlan["deletes"] = [];
  const preserved: PreservedFile[] = [];
  const missing: RemovalPlan["missing"] = [];
  const planned = new Set<string>();

  for (const id of ids) {
    for (const file of lockfile.packages[id]!.files) {
      const target = canonicalTarget(file.target);
      if (planned.has(target)) continue;
      planned.add(target);
      const absTarget = resolveProjectTarget(projectDir, target);
      if (!absTarget) {
        return { ok: false, dependents, error: `Refusing to remove unsafe package target: ${file.target}` };
      }
      if ((index.get(target) ?? []).some((owner) => !removing.has(owner.id))) {
        preserved.push({ id, target, reason: "shared" });
        continue;
      }
      const disk = inspectDiskTarget(absTarget);
      if (disk.kind === "missing") {
        missing.push({ id, target });
      } else if (disk.kind === "file" && disk.sha256 === file.sha256) {
        deletes.push({ id, target, absTarget });
      } else {
        preserved.push({ id, target, reason: disk.kind === "symlink" ? "symlink" : "modified" });
      }
    }
  }

  return { ok: true, plan: { ids, deletes, preserved, missing, dependents } };
}

export type RemovalCommitResult = { ok: true; lockfile: Lockfile } | { ok: false; error: string };

/** Delete unchanged files and drop every planned package from the lockfile in one transaction. */
export function commitPackageRemoval(
  projectDir: string,
  lockfile: Lockfile,
  plan: RemovalPlan,
  hooks?: TransactionHooks,
): RemovalCommitResult {
  const next = cloneLockfile(lockfile);
  for (const id of plan.ids) removeFromLockfile(next, id);
  const commit = commitPackageTransaction({ projectDir, writes: [], deletes: plan.deletes, lockfile: next, hooks });
  return commit.ok ? { ok: true, lockfile: next } : { ok: false, error: commit.error };
}

export function preservedFileMessage(file: PreservedFile): string {
  if (file.reason === "shared") return `Kept ${file.target}: another installed package still uses it.`;
  if (file.reason === "symlink") {
    return `Kept ${file.target}: it is a symlink, so Feather left it in place and no longer manages it.`;
  }
  return `Kept ${file.target}: it has local changes, so Feather left it in place and no longer manages it. Delete it yourself if you do not need the edits.`;
}
