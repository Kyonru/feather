import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type LockfileRepoSource = {
  repo: string;
  tag: string;
  commitSha?: string;
  resolvedRef?: string;
  transport?: "raw" | "git";
};

export type LockfileUrlSource = {
  kind?: "url";
  url: string;
  urls?: string[];
};

export type LockfileEntry = {
  parent?: string;
  version: string;
  trust: "verified" | "known" | "experimental";
  source: LockfileRepoSource | LockfileUrlSource;
  files: {
    name: string;
    url?: string;
    target: string;
    sha256: string;
    role?: "license";
    generated?: {
      type: "require-alias";
      require: string;
    };
  }[];
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

const LOCKFILE_NAME = "feather.lock.json";
const COMMIT_SHA_RE = /^[a-f0-9]{40}$/i;

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

export function readLockfile(projectDir: string): Lockfile {
  const path = lockfilePath(projectDir);
  if (!existsSync(path)) {
    return { lockfileVersion: 1, generatedAt: new Date().toISOString(), packages: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Lockfile;
  } catch {
    throw new Error(`Failed to parse ${LOCKFILE_NAME}. Fix or delete it and re-run.`);
  }
}

export function writeLockfile(projectDir: string, lockfile: Lockfile): void {
  lockfile.generatedAt = new Date().toISOString();
  writeFileSync(lockfilePath(projectDir), JSON.stringify(lockfile, null, 2) + "\n");
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
