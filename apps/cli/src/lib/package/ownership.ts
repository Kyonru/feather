import { lstatSync, readFileSync } from "node:fs";
import { sha256Buffer } from "./checksum.js";
import { normalizeLockfileTarget, type Lockfile, type LockfileFile } from "./lockfile.js";
import { resolveProjectTarget } from "./target.js";

export type TargetOwner = { id: string; file: LockfileFile };

/** Canonical project-relative target → every lockfile entry that claims it. */
export type OwnershipIndex = Map<string, TargetOwner[]>;

export function canonicalTarget(target: string): string {
  return normalizeLockfileTarget(target) ?? target;
}

export function buildOwnershipIndex(lockfile: Lockfile): OwnershipIndex {
  const index: OwnershipIndex = new Map();
  for (const [id, entry] of Object.entries(lockfile.packages)) {
    for (const file of entry.files) {
      const key = canonicalTarget(file.target);
      index.set(key, [...(index.get(key) ?? []), { id, file }]);
    }
  }
  return index;
}

export type DiskState =
  | { kind: "missing" }
  | { kind: "file"; sha256: string }
  | { kind: "symlink" }
  | { kind: "other" };

export function inspectDiskTarget(absTarget: string): DiskState {
  let stat;
  try {
    stat = lstatSync(absTarget);
  } catch {
    return { kind: "missing" };
  }
  if (stat.isSymbolicLink()) return { kind: "symlink" };
  if (!stat.isFile()) return { kind: "other" };
  return { kind: "file", sha256: sha256Buffer(readFileSync(absTarget)) };
}

/** Packages that ship the same catalog files (a parent and its subpackages) may share targets. */
function sameFamily(lockfile: Lockfile, a: string, b: string, parentOf?: (id: string) => string | undefined): boolean {
  const parent = (id: string) => lockfile.packages[id]?.parent ?? parentOf?.(id);
  const rootA = parent(a) ?? a;
  const rootB = parent(b) ?? b;
  return rootA === rootB;
}

function short(sha: string | undefined): string {
  return sha ? sha.slice(0, 12) : "unknown";
}

export type TargetAction = "create" | "replace" | "unchanged";

export type TargetCheck =
  | { ok: true; target: string; absTarget: string; action: TargetAction; warning?: string; disk: DiskState }
  | { ok: false; target: string; error: string };

export type TargetCheckInput = {
  projectDir: string;
  lockfile: Lockfile;
  index: OwnershipIndex;
  packageId: string;
  target: string;
  /** Hash the new content will have, when known before download. */
  expectedSha256?: string;
  /** Overwrite untracked files and locally modified files of this package. */
  force?: boolean;
  /** Parent lookup for packages that are not in the lockfile yet. */
  parentOf?: (id: string) => string | undefined;
};

/**
 * Decide, before any download or write, whether `packageId` may write `target`.
 *
 * - another package's file: refuse (unless it is the same catalog file in a parent/subpackage family)
 * - symlink or directory at the target: refuse
 * - this package's unchanged file: replace
 * - this package's locally modified file: refuse unless forced
 * - untracked existing file: refuse unless forced, or adopt when it already has the expected bytes
 */
export function checkInstallTarget(input: TargetCheckInput): TargetCheck {
  const target = canonicalTarget(input.target);
  const absTarget = resolveProjectTarget(input.projectDir, target);
  if (!absTarget) return { ok: false, target, error: `${target} escapes the project root.` };

  const owners = input.index.get(target) ?? [];
  const own = owners.find((owner) => owner.id === input.packageId);
  for (const owner of owners) {
    if (owner.id === input.packageId) continue;
    const shared =
      sameFamily(input.lockfile, owner.id, input.packageId, input.parentOf)
      && input.expectedSha256 !== undefined
      && owner.file.sha256 === input.expectedSha256;
    if (!shared) {
      return { ok: false, target, error: `${target} is already managed by package "${owner.id}".` };
    }
  }

  const disk = inspectDiskTarget(absTarget);
  if (disk.kind === "symlink") {
    return {
      ok: false,
      target,
      error: `${target} is a symlink. Feather does not write package files through symlinks; replace it with a regular file or choose another install directory.`,
    };
  }
  if (disk.kind === "other") {
    return { ok: false, target, error: `${target} exists and is not a regular file.` };
  }
  if (disk.kind === "missing") return { ok: true, target, absTarget, action: "create", disk };

  if (input.expectedSha256 !== undefined && disk.sha256 === input.expectedSha256) {
    return { ok: true, target, absTarget, action: "unchanged", disk };
  }

  const lockedSha = own?.file.sha256 ?? owners[0]?.file.sha256;
  if (own || owners.length > 0) {
    if (disk.sha256 === lockedSha) return { ok: true, target, absTarget, action: "replace", disk };
    if (input.force) {
      return {
        ok: true,
        target,
        absTarget,
        action: "replace",
        disk,
        warning: `Overwriting locally modified ${target} (locked sha256 ${short(lockedSha)}, found ${short(disk.sha256)}).`,
      };
    }
    return {
      ok: false,
      target,
      error:
        `${target} has local changes (locked sha256 ${short(lockedSha)}, found ${short(disk.sha256)}). ` +
        `Back up your edits, then re-run with --force to overwrite them.`,
    };
  }

  if (input.force) {
    return { ok: true, target, absTarget, action: "replace", disk, warning: `Overwriting untracked file ${target}.` };
  }
  return {
    ok: false,
    target,
    error: `${target} already exists and is not managed by Feather. Move it aside, or re-run with --force to overwrite it.`,
  };
}
