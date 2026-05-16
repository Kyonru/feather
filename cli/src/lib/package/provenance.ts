import type { Lockfile, LockfileEntry } from "./lockfile.js";

export type PackageUrlTrust = {
  trusted: boolean;
  reason?: string;
  host?: string;
};

export type LockfileUrlFinding = {
  id: string;
  name: string;
  target: string;
  url: string;
  reason: string;
};

const TRUSTED_PACKAGE_URL_HOSTS = new Set(["raw.githubusercontent.com"]);

export function lockfileFileUrl(entry: LockfileEntry, file: LockfileEntry["files"][number]): string {
  if (file.url) return file.url;
  if ("url" in entry.source) return entry.source.url;

  const ref = entry.source.resolvedRef ?? entry.source.commitSha ?? entry.source.tag;
  return `https://raw.githubusercontent.com/${entry.source.repo}/${ref}/${file.name}`;
}

export function assessPackageUrl(url: string): PackageUrlTrust {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { trusted: false, reason: "invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { trusted: false, reason: `${parsed.protocol || "unknown"} URL`, host: parsed.host || undefined };
  }

  if (!TRUSTED_PACKAGE_URL_HOSTS.has(parsed.hostname)) {
    return { trusted: false, reason: `untrusted host ${parsed.hostname}`, host: parsed.hostname };
  }

  return { trusted: true, host: parsed.hostname };
}

export function lockfileEntryUrlFindings(id: string, entry: LockfileEntry): LockfileUrlFinding[] {
  const findings: LockfileUrlFinding[] = [];

  for (const file of entry.files) {
    const url = lockfileFileUrl(entry, file);
    const trust = assessPackageUrl(url);
    if (!trust.trusted) {
      findings.push({
        id,
        name: file.name,
        target: file.target,
        url,
        reason: trust.reason ?? "untrusted URL",
      });
    }
  }

  return findings;
}

export function lockfileUrlFindings(lockfile: Lockfile): LockfileUrlFinding[] {
  return Object.entries(lockfile.packages).flatMap(([id, entry]) => lockfileEntryUrlFindings(id, entry));
}

export function lockfileEntryRequiresUntrustedRepair(id: string, entry: LockfileEntry): boolean {
  return entry.trust === "experimental" || lockfileEntryUrlFindings(id, entry).length > 0;
}

function packageUrlSummary(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.host) return `${parsed.protocol}//${parsed.host}`;
    return `${parsed.protocol} URL`;
  } catch {
    return "invalid URL";
  }
}

export function lockfileEntrySourceSummary(id: string, entry: LockfileEntry): string {
  if ("url" in entry.source) return packageUrlSummary(entry.source.url);
  if (entry.source.commitSha) return `${entry.source.repo}@${entry.source.commitSha}`;
  if (entry.source.resolvedRef) return `${entry.source.repo}@${entry.source.resolvedRef}`;
  return `${entry.source.repo}@${entry.source.tag || id}`;
}
