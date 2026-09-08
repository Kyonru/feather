import { existsSync } from "node:fs";
import { join } from "node:path";
import { sha256File } from "./checksum.js";
import type { Lockfile } from "./lockfile.js";

export type AuditStatus = "verified" | "modified" | "missing";

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
      const absPath = join(projectDir, file.target);

      if (!existsSync(absPath)) {
        results.push({ id, file: file.name, target: file.target, status: "missing", expected: file.sha256, actual: null });
        continue;
      }

      const actual = await sha256File(absPath);
      const status: AuditStatus = actual === file.sha256 ? "verified" : "modified";
      results.push({ id, file: file.name, target: file.target, status, expected: file.sha256, actual });
    }
  }

  return results;
}
