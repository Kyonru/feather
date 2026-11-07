import { existsSync, lstatSync } from "node:fs";
import { sha256File } from "./checksum.js";
import type { Lockfile } from "./lockfile.js";
import { resolveProjectTarget } from "./target.js";

/**
 * `unsafe` means the locked target resolves outside the project (for example through a symlinked
 * directory) and was not read.
 */
export type AuditStatus = "verified" | "modified" | "missing" | "unsafe";

export type AuditEntry = {
  id: string;
  file: string;
  target: string;
  status: AuditStatus;
  expected: string;
  actual: string | null;
};

export async function auditLockfile(
  projectDir: string,
  lockfile: Lockfile
): Promise<AuditEntry[]> {
  const results: AuditEntry[] = [];

  for (const [id, entry] of Object.entries(lockfile.packages)) {
    for (const file of entry.files) {
      const absPath = resolveProjectTarget(projectDir, file.target);
      if (!absPath) {
        results.push({ id, file: file.name, target: file.target, status: "unsafe", expected: file.sha256, actual: null });
        continue;
      }

      if (!existsSync(absPath)) {
        results.push({ id, file: file.name, target: file.target, status: "missing", expected: file.sha256, actual: null });
        continue;
      }

      if (!lstatSync(absPath).isFile()) {
        // A directory or symlink where a package file belongs is not the locked file.
        results.push({ id, file: file.name, target: file.target, status: "modified", expected: file.sha256, actual: null });
        continue;
      }

      const actual = await sha256File(absPath);
      const status: AuditStatus = actual === file.sha256 ? "verified" : "modified";
      results.push({ id, file: file.name, target: file.target, status, expected: file.sha256, actual });
    }
  }

  return results;
}
