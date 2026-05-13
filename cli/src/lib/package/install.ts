import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { sha256Buffer } from "./checksum.js";
import { addToLockfile, type Lockfile, type LockfileEntry } from "./lockfile.js";
import type { ResolvedPackage } from "./resolve.js";

export type InstallOptions = {
  projectDir: string;
  dryRun?: boolean;
  targetOverride?: string;
  onFileStart?: (name: string) => void;
  onFileComplete?: (result: InstallFileResult) => void;
};

export type InstallFileResult = {
  name: string;
  target: string;
  sha256: string;
  ok: boolean;
  error?: string;
};

export type InstallResult = {
  id: string;
  ok: boolean;
  files: InstallFileResult[];
  error?: string;
};

async function downloadVerified(url: string, expectedSha256: string): Promise<Buffer | { error: string }> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    return { error: `Network error: ${(err as Error).message}` };
  }
  if (!res.ok) return { error: `HTTP ${res.status} fetching ${url}` };

  const buf = Buffer.from(await res.arrayBuffer());
  const actual = sha256Buffer(buf);
  if (actual !== expectedSha256) {
    return { error: `Checksum mismatch for ${url}\n  expected: ${expectedSha256}\n  got:      ${actual}` };
  }
  return buf;
}

async function downloadLive(url: string, repo: string, version: string): Promise<Buffer | { error: string }> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    return { error: `Network error: ${(err as Error).message}` };
  }
  if (res.status === 404) {
    return { error: `Version ${version} not found for ${repo} (HTTP 404). Check available releases at github.com/${repo}/releases` };
  }
  if (!res.ok) return { error: `HTTP ${res.status} fetching ${url}` };
  return Buffer.from(await res.arrayBuffer());
}

function safeTarget(projectDir: string, relTarget: string): string | null {
  const abs = resolvePath(projectDir, relTarget);
  if (!abs.startsWith(resolvePath(projectDir))) return null;
  return abs;
}

export async function installPackage(
  pkg: ResolvedPackage,
  lockfile: Lockfile,
  opts: InstallOptions
): Promise<InstallResult> {
  const { projectDir, dryRun, targetOverride, onFileStart, onFileComplete } = opts;
  const fileResults: InstallFileResult[] = [];
  const lockedFiles: LockfileEntry["files"] = [];

  const src = pkg.entry.source;
  const effectiveTag = pkg.versionOverride ?? src.tag;
  const baseUrl = pkg.versionOverride
    ? src.baseUrl.replace(src.tag, pkg.versionOverride)
    : src.baseUrl;

  for (const file of pkg.files) {
    const relTarget = targetOverride
      ? join(targetOverride, file.name.split("/").pop()!)
      : file.target;

    const absTarget = safeTarget(projectDir, relTarget);
    if (!absTarget) {
      fileResults.push({ name: file.name, target: relTarget, sha256: "", ok: false, error: "Target path escapes project root" });
      continue;
    }

    const url = baseUrl + file.name;

    if (dryRun) {
      fileResults.push({ name: file.name, target: relTarget, sha256: file.sha256, ok: true });
      continue;
    }

    onFileStart?.(file.name);

    let fileSha256: string;
    if (pkg.versionOverride) {
      const result = await downloadLive(url, src.repo ?? pkg.id, pkg.versionOverride);
      if ("error" in result) {
        const fileResult: InstallFileResult = { name: file.name, target: relTarget, sha256: "", ok: false, error: result.error };
        onFileComplete?.(fileResult);
        return { id: pkg.id, ok: false, files: fileResults, error: result.error };
      }
      fileSha256 = sha256Buffer(result);
      mkdirSync(dirname(absTarget), { recursive: true });
      writeFileSync(absTarget, result);
    } else {
      const result = await downloadVerified(url, file.sha256);
      if ("error" in result) {
        const fileResult: InstallFileResult = { name: file.name, target: relTarget, sha256: "", ok: false, error: result.error };
        onFileComplete?.(fileResult);
        return { id: pkg.id, ok: false, files: fileResults, error: result.error };
      }
      fileSha256 = file.sha256;
      mkdirSync(dirname(absTarget), { recursive: true });
      writeFileSync(absTarget, result);
    }

    const fileResult: InstallFileResult = { name: file.name, target: relTarget, sha256: fileSha256, ok: true };
    onFileComplete?.(fileResult);
    fileResults.push(fileResult);
    lockedFiles.push({ name: file.name, target: relTarget, sha256: fileSha256 });
  }

  const allOk = fileResults.every((f) => f.ok);

  if (allOk && !dryRun) {
    addToLockfile(lockfile, pkg.id, {
      parent: pkg.entry.parent,
      version: effectiveTag,
      trust: pkg.versionOverride ? "experimental" : pkg.entry.trust,
      source: { repo: src.repo, tag: effectiveTag },
      files: lockedFiles,
    });
  }

  return { id: pkg.id, ok: allOk, files: fileResults };
}

export type ExperimentalInstallOptions = {
  projectDir: string;
  url: string;
  target: string;
  dryRun?: boolean;
};

export type ExperimentalInstallResult = {
  ok: boolean;
  sha256: string;
  size: number;
  error?: string;
};

export async function installFromUrl(
  lockfile: Lockfile,
  opts: ExperimentalInstallOptions
): Promise<ExperimentalInstallResult & { target: string }> {
  const { projectDir, url, target, dryRun } = opts;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    return { ok: false, sha256: "", size: 0, target, error: `Network error: ${(err as Error).message}` };
  }
  if (!res.ok) return { ok: false, sha256: "", size: 0, target, error: `HTTP ${res.status}` };

  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256Buffer(buf);

  if (dryRun) {
    return { ok: true, sha256: hash, size: buf.byteLength, target };
  }

  const absTarget = safeTarget(projectDir, target);
  if (!absTarget) return { ok: false, sha256: hash, size: buf.byteLength, target, error: "Target path escapes project root" };

  mkdirSync(dirname(absTarget), { recursive: true });
  writeFileSync(absTarget, buf);

  const name = url.split("/").pop() ?? "package.lua";
  addToLockfile(lockfile, name.replace(/\.lua$/, ""), {
    version: "0.0.0",
    trust: "experimental",
    source: { url },
    files: [{ name, target, sha256: hash }],
  });

  return { ok: true, sha256: hash, size: buf.byteLength, target };
}

export type RestoreOptions = {
  projectDir: string;
  dryRun?: boolean;
  onFileStart?: (name: string) => void;
  onFileComplete?: (result: InstallFileResult) => void;
};

export async function restorePackage(
  id: string,
  entry: LockfileEntry,
  opts: RestoreOptions,
): Promise<InstallResult> {
  const { projectDir, dryRun, onFileStart, onFileComplete } = opts;
  const fileResults: InstallFileResult[] = [];

  for (const file of entry.files) {
    const absTarget = safeTarget(projectDir, file.target);
    if (!absTarget) {
      fileResults.push({ name: file.name, target: file.target, sha256: "", ok: false, error: "Target path escapes project root" });
      continue;
    }

    // Skip files already on disk with the correct locked checksum
    if (!dryRun && existsSync(absTarget)) {
      if (sha256Buffer(readFileSync(absTarget)) === file.sha256) {
        fileResults.push({ name: file.name, target: file.target, sha256: file.sha256, ok: true });
        continue;
      }
    }

    if (dryRun) {
      fileResults.push({ name: file.name, target: file.target, sha256: file.sha256, ok: true });
      continue;
    }

    onFileStart?.(file.name);

    const url = "url" in entry.source
      ? entry.source.url
      : `https://raw.githubusercontent.com/${entry.source.repo}/${entry.source.tag}/${file.name}`;

    const result = await downloadVerified(url, file.sha256);
    if ("error" in result) {
      const fileResult: InstallFileResult = { name: file.name, target: file.target, sha256: "", ok: false, error: result.error };
      onFileComplete?.(fileResult);
      return { id, ok: false, files: fileResults, error: result.error };
    }

    mkdirSync(dirname(absTarget), { recursive: true });
    writeFileSync(absTarget, result);

    const fileResult: InstallFileResult = { name: file.name, target: file.target, sha256: file.sha256, ok: true };
    onFileComplete?.(fileResult);
    fileResults.push(fileResult);
  }

  return { id, ok: fileResults.every((f) => f.ok), files: fileResults };
}
