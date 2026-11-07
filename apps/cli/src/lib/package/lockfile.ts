import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, posix } from "node:path";
import { writeFileAtomicSync } from "../atomic-write.js";

export type LockfileRepoSource = {
  repo: string;
  /** Version label. For catalog installs this is the catalog tag; for overrides the requested ref. */
  tag: string;
  /** Immutable commit the files were fetched from. This is the reproducibility identity. */
  commitSha?: string;
  resolvedRef?: string;
  /** The ref the user asked for (`anim8@v2.2.0` records `v2.2.0`) when it differs from the catalog pin. */
  requestedRef?: string;
  /** When `requestedRef` was resolved to `commitSha`. */
  resolvedAt?: string;
  transport?: "raw" | "git";
};

export type LockfileUrlSource = {
  kind?: "url";
  url: string;
  urls?: string[];
};

export type LockfileFile = {
  name: string;
  url?: string;
  target: string;
  sha256: string;
  role?: "license";
  generated?: {
    type: "require-alias";
    require: string;
  };
};

export type LockfileEntry = {
  parent?: string;
  version: string;
  trust: "verified" | "known" | "experimental";
  source: LockfileRepoSource | LockfileUrlSource;
  files: LockfileFile[];
  /** Catalog dependencies recorded at install time, used to refuse removing a required package. */
  dependencies?: string[];
  installDir?: string;
  installedAt: string;
};

export type Lockfile = {
  lockfileVersion: 1;
  requiresFeather?: string;
  features?: string[];
  generatedAt: string;
  packages: Record<string, LockfileEntry>;
};

export const LOCKFILE_NAME = "feather.lock.json";
const COMMIT_SHA_RE = /^[a-f0-9]{40}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;
const TRUST_VALUES = new Set(["verified", "known", "experimental"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateLockfileSource(source: unknown): void {
  if (!isObject(source)) throw new Error("Lockfile source must be an object");

  if ("repo" in source) {
    if (typeof source.repo !== "string" || !source.repo) throw new Error("Lockfile source.repo must be a string");
    if (typeof source.tag !== "string" || !source.tag) throw new Error("Lockfile source.tag must be a string");
    if (source.commitSha !== undefined && (typeof source.commitSha !== "string" || !COMMIT_SHA_RE.test(source.commitSha))) {
      throw new Error("Lockfile source.commitSha must be a 40-character SHA");
    }
    if (source.resolvedRef !== undefined && typeof source.resolvedRef !== "string") {
      throw new Error("Lockfile source.resolvedRef must be a string");
    }
    if (source.requestedRef !== undefined && (typeof source.requestedRef !== "string" || !source.requestedRef)) {
      throw new Error("Lockfile source.requestedRef must be a non-empty string");
    }
    if (source.resolvedAt !== undefined && typeof source.resolvedAt !== "string") {
      throw new Error("Lockfile source.resolvedAt must be a string");
    }
    if (source.transport !== undefined && source.transport !== "raw" && source.transport !== "git") {
      throw new Error('Lockfile source.transport must be "raw" or "git"');
    }
    return;
  }

  if (typeof source.url !== "string" || !source.url) throw new Error("Lockfile source.url must be a string");
  if (source.kind !== undefined && source.kind !== "url") throw new Error('Lockfile source.kind must be "url"');
  if (source.urls !== undefined) {
    if (!Array.isArray(source.urls) || source.urls.length === 0 || source.urls.some((url) => typeof url !== "string" || !url)) {
      throw new Error("Lockfile source.urls must be non-empty strings");
    }
  }
}

export function lockfilePath(projectDir: string): string {
  return join(projectDir, LOCKFILE_NAME);
}

/**
 * Project-relative target in canonical form (forward slashes, no leading `./`), or null when the
 * value is not a plain relative path that stays inside the project. This is a structural check;
 * symlink escapes are checked against the filesystem by `resolveProjectTarget`.
 */
export function normalizeLockfileTarget(target: unknown): string | null {
  if (typeof target !== "string" || !target) return null;
  const slashed = target.replace(/\\/g, "/");
  if (slashed.startsWith("/") || isAbsolute(slashed) || /^[A-Za-z]:/.test(slashed)) return null;
  const normalized = posix.normalize(slashed).replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  if (!normalized || normalized === "." || normalized.split("/").includes("..")) return null;
  return normalized;
}

function invalid(path: string, message: string): never {
  throw new Error(`${path} ${message}`);
}

function validateLockfileFile(file: unknown, path: string): void {
  if (!isObject(file)) invalid(path, "must be an object");
  if (typeof file.name !== "string" || !file.name) invalid(`${path}.name`, "must be a non-empty string");
  if (!normalizeLockfileTarget(file.target)) {
    invalid(`${path}.target`, `must be a relative path inside the project (got ${JSON.stringify(file.target)})`);
  }
  if (typeof file.sha256 !== "string" || !SHA256_RE.test(file.sha256)) invalid(`${path}.sha256`, "must be a SHA-256 hex digest");
  if (file.url !== undefined && (typeof file.url !== "string" || !file.url)) invalid(`${path}.url`, "must be a non-empty string");
  if (file.role !== undefined && file.role !== "license") invalid(`${path}.role`, 'must be "license"');
  if (file.generated !== undefined) {
    if (!isObject(file.generated) || file.generated.type !== "require-alias") {
      invalid(`${path}.generated.type`, 'must be "require-alias"');
    }
    if (typeof file.generated.require !== "string" || !/^[A-Za-z0-9_.-]+$/.test(file.generated.require)) {
      invalid(`${path}.generated.require`, "must be a Lua module path");
    }
  }
}

function validateLockfileEntry(id: string, entry: unknown): void {
  const path = `packages[${JSON.stringify(id)}]`;
  // eslint-disable-next-line no-control-regex
  if (!id || /[\u0000-\u001f]/.test(id)) invalid(path, "has an invalid package id");
  if (!isObject(entry)) invalid(path, "must be an object");
  if (entry.parent !== undefined && (typeof entry.parent !== "string" || !entry.parent)) {
    invalid(`${path}.parent`, "must be a non-empty string");
  }
  if (typeof entry.version !== "string") invalid(`${path}.version`, "must be a string");
  if (typeof entry.trust !== "string" || !TRUST_VALUES.has(entry.trust)) {
    invalid(`${path}.trust`, "must be verified, known, or experimental");
  }
  try {
    validateLockfileSource(entry.source);
  } catch (error) {
    invalid(`${path}.source`, `is invalid: ${(error as Error).message}`);
  }
  if (!Array.isArray(entry.files)) invalid(`${path}.files`, "must be an array");
  entry.files.forEach((file, index) => validateLockfileFile(file, `${path}.files[${index}]`));
  if (entry.dependencies !== undefined) {
    if (!Array.isArray(entry.dependencies) || entry.dependencies.some((dependency) => typeof dependency !== "string" || !dependency)) {
      invalid(`${path}.dependencies`, "must be an array of package ids");
    }
  }
  if (entry.installDir !== undefined && !normalizeLockfileTarget(entry.installDir)) {
    invalid(`${path}.installDir`, "must be a relative path inside the project");
  }
  if (entry.installedAt !== undefined && typeof entry.installedAt !== "string") {
    invalid(`${path}.installedAt`, "must be a string");
  }
}

/**
 * Validate an untrusted parsed lockfile. Every consumer reads the lockfile through this, so a
 * malformed or adversarial file cannot steer reads or writes outside the project.
 */
export function validateLockfile(value: unknown): Lockfile {
  if (!isObject(value)) throw new Error("must be a JSON object");
  if (value.lockfileVersion !== 1) throw new Error("lockfileVersion must be 1");
  if (value.generatedAt !== undefined && typeof value.generatedAt !== "string") throw new Error("generatedAt must be a string");
  if (value.requiresFeather !== undefined && typeof value.requiresFeather !== "string") {
    throw new Error("requiresFeather must be a string");
  }
  if (value.features !== undefined && (!Array.isArray(value.features) || value.features.some((feature) => typeof feature !== "string"))) {
    throw new Error("features must be an array of strings");
  }
  if (!isObject(value.packages)) throw new Error("packages must be an object");
  for (const [id, entry] of Object.entries(value.packages)) validateLockfileEntry(id, entry);
  return value as unknown as Lockfile;
}

export function emptyLockfile(): Lockfile {
  return { lockfileVersion: 1, generatedAt: new Date().toISOString(), packages: {} };
}

export function parseLockfile(source: string): Lockfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Failed to parse ${LOCKFILE_NAME}. Fix or delete it and re-run.`, { cause: error });
  }
  try {
    return validateLockfile(parsed);
  } catch (error) {
    throw new Error(`${LOCKFILE_NAME} is invalid: ${(error as Error).message}. Fix or delete it and re-run.`, { cause: error });
  }
}

/** The one validated lockfile read. Missing file → empty lockfile; malformed file → throws. */
export function readLockfile(projectDir: string): Lockfile {
  const path = lockfilePath(projectDir);
  if (!existsSync(path)) return emptyLockfile();
  return parseLockfile(readFileSync(path, "utf8"));
}

export function serializeLockfile(lockfile: Lockfile): string {
  return JSON.stringify(lockfile, null, 2) + "\n";
}

export function cloneLockfile(lockfile: Lockfile): Lockfile {
  return JSON.parse(JSON.stringify(lockfile)) as Lockfile;
}

/** Atomic replace: an interrupted write leaves the previous lockfile readable. */
export function writeLockfile(projectDir: string, lockfile: Lockfile): void {
  lockfile.generatedAt = new Date().toISOString();
  writeFileAtomicSync(lockfilePath(projectDir), serializeLockfile(lockfile));
}

export function addToLockfile(
  lockfile: Lockfile,
  id: string,
  entry: Omit<LockfileEntry, "installedAt">
): void {
  validateLockfileSource(entry.source);
  lockfile.packages[id] = { ...entry, installedAt: new Date().toISOString() };
}

export function markLockfileFeature(lockfile: Lockfile, feature: string, requiresFeather?: string): void {
  lockfile.features = [...new Set([...(lockfile.features ?? []), feature])].sort();
  if (requiresFeather) lockfile.requiresFeather = maxRequiredFeather(lockfile.requiresFeather, requiresFeather);
}

function parseMinimumVersion(requirement: string | undefined): [number, number, number] | null {
  if (!requirement) return null;
  const match = requirement.trim().match(/^>=\s*(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function maxRequiredFeather(current: string | undefined, next: string): string {
  const currentVersion = parseMinimumVersion(current);
  const nextVersion = parseMinimumVersion(next);
  if (!currentVersion || !nextVersion) return next;
  for (let i = 0; i < 3; i += 1) {
    if (nextVersion[i]! > currentVersion[i]!) return next;
    if (nextVersion[i]! < currentVersion[i]!) return current!;
  }
  return current!;
}

export function removeFromLockfile(lockfile: Lockfile, id: string): boolean {
  if (!(id in lockfile.packages)) return false;
  delete lockfile.packages[id];
  return true;
}
