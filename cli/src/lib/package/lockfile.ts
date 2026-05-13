import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type LockfileEntry = {
  parent?: string;
  version: string;
  trust: "verified" | "known" | "experimental";
  source:
    | { repo: string; tag: string }
    | { url: string };
  files: { name: string; target: string; sha256: string }[];
  installedAt: string;
};

export type Lockfile = {
  lockfileVersion: 1;
  generatedAt: string;
  packages: Record<string, LockfileEntry>;
};

const LOCKFILE_NAME = "feather.lock.json";

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
  lockfile.packages[id] = { ...entry, installedAt: new Date().toISOString() };
}

export function removeFromLockfile(lockfile: Lockfile, id: string): boolean {
  if (!(id in lockfile.packages)) return false;
  delete lockfile.packages[id];
  return true;
}
