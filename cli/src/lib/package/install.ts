import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sha256Buffer } from "./checksum.js";
import { addToLockfile, type Lockfile, type LockfileEntry } from "./lockfile.js";
import { lockfileFileUrl } from "./provenance.js";
import { planPackageTarget, resolveProjectTarget } from "./target.js";
import type { ResolvedPackage } from "./resolve.js";
import { checkDependencyAliasTarget, packageDependencyAliasContent, planDependencyAliases } from "./aliases.js";

export type InstallOptions = {
  projectDir: string;
  dryRun?: boolean;
  targetOverride?: string;
  installDir?: string;
  saveInstallDir?: boolean;
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

export async function installPackage(
  pkg: ResolvedPackage,
  lockfile: Lockfile,
  opts: InstallOptions
): Promise<InstallResult> {
  const { projectDir, dryRun, targetOverride, installDir, saveInstallDir, onFileStart, onFileComplete } = opts;
  const fileResults: InstallFileResult[] = [];
  const lockedFiles: LockfileEntry["files"] = [];
  const savedInstallDir = lockfile.packages[pkg.id]?.installDir;
  const layout = pkg.entry.install?.layout;
  const fixedLayout = layout === "fixed";

  if (fixedLayout && targetOverride) {
    return {
      id: pkg.id,
      ok: false,
      files: [],
      error: `${pkg.id} has fixed runtime paths and cannot be flattened.`,
    };
  }

  const effectiveInstallDir = targetOverride || fixedLayout ? undefined : (installDir ?? savedInstallDir);
  const shouldSaveInstallDir = !targetOverride && !fixedLayout && (installDir ? !!saveInstallDir : !!savedInstallDir);

  const src = pkg.entry.source;
  const effectiveTag = pkg.versionOverride ?? src.tag ?? 'url';
  const baseUrl =
    pkg.versionOverride && src.baseUrl && src.tag
      ? src.baseUrl.replace(src.tag, pkg.versionOverride)
      : (src.baseUrl ?? '');

  const plannedFiles = pkg.files.map((file) => ({
    file,
    relTarget: planPackageTarget(file, { targetOverride, installDir: effectiveInstallDir, layout }),
  }));
  const aliasResult = planDependencyAliases(pkg, lockfile, { installDir, targetOverride, dryRun });
  if (!aliasResult.ok) {
    return { id: pkg.id, ok: false, files: [], error: aliasResult.error };
  }
  const resolvedTargets: string[] = [];

  for (const { file, relTarget } of plannedFiles) {
    const absTarget = resolveProjectTarget(projectDir, relTarget);
    if (!absTarget) {
      return {
        id: pkg.id,
        ok: false,
        files: [{ name: file.name, target: relTarget, sha256: "", ok: false, error: "Target path escapes project root" }],
        error: "Target path escapes project root",
      };
    }
    resolvedTargets.push(absTarget);
  }
  for (const alias of aliasResult.aliases) {
    if (plannedFiles.some((planned) => planned.relTarget === alias.target)) {
      return {
        id: pkg.id,
        ok: false,
        files: [{ name: alias.name, target: alias.target, sha256: alias.sha256, ok: false, error: "Dependency alias target overlaps an installed file" }],
        error: "Dependency alias target overlaps an installed file",
      };
    }
    const absTarget = resolveProjectTarget(projectDir, alias.target);
    if (!absTarget) {
      return {
        id: pkg.id,
        ok: false,
        files: [{ name: alias.name, target: alias.target, sha256: "", ok: false, error: "Target path escapes project root" }],
        error: "Target path escapes project root",
      };
    }
    const collision = checkDependencyAliasTarget(projectDir, lockfile, pkg.id, alias);
    if (collision) {
      return {
        id: pkg.id,
        ok: false,
        files: [{ name: alias.name, target: alias.target, sha256: alias.sha256, ok: false, error: collision }],
        error: collision,
      };
    }
  }

  for (const [index, { file, relTarget }] of plannedFiles.entries()) {
    const absTarget = resolvedTargets[index]!;

    const url = file.url ?? baseUrl + file.name;

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

  for (const alias of aliasResult.aliases) {
    if (dryRun) {
      fileResults.push({ name: alias.name, target: alias.target, sha256: alias.sha256, ok: true });
      continue;
    }

    const absTarget = resolveProjectTarget(projectDir, alias.target);
    if (!absTarget) {
      const fileResult: InstallFileResult = { name: alias.name, target: alias.target, sha256: "", ok: false, error: "Target path escapes project root" };
      onFileComplete?.(fileResult);
      return { id: pkg.id, ok: false, files: fileResults, error: "Target path escapes project root" };
    }

    onFileStart?.(alias.name);
    mkdirSync(dirname(absTarget), { recursive: true });
    writeFileSync(absTarget, alias.content);
    const fileResult: InstallFileResult = { name: alias.name, target: alias.target, sha256: alias.sha256, ok: true };
    onFileComplete?.(fileResult);
    fileResults.push(fileResult);
    lockedFiles.push({
      name: alias.name,
      target: alias.target,
      sha256: alias.sha256,
      generated: { type: "require-alias", require: alias.requirePath },
    });
  }

  const allOk = fileResults.every((f) => f.ok);

  if (allOk && !dryRun) {
    addToLockfile(lockfile, pkg.id, {
      parent: pkg.entry.parent,
      version: effectiveTag,
      trust: pkg.versionOverride ? "experimental" : pkg.entry.trust,
      source: {
        repo: src.repo ?? pkg.id,
        tag: effectiveTag,
        ...(!pkg.versionOverride && src.commitSha ? { resolvedRef: src.commitSha, commitSha: src.commitSha } : {}),
      },
      files: lockedFiles,
      ...(shouldSaveInstallDir && effectiveInstallDir ? { installDir: effectiveInstallDir } : {}),
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

  const absTarget = resolveProjectTarget(projectDir, target);
  if (!absTarget) return { ok: false, sha256: hash, size: buf.byteLength, target, error: "Target path escapes project root" };

  mkdirSync(dirname(absTarget), { recursive: true });
  writeFileSync(absTarget, buf);

  const name = url.split("/").pop() ?? "package.lua";
  addToLockfile(lockfile, name.replace(/\.lua$/, ""), {
    version: "0.0.0",
    trust: "experimental",
    source: { kind: "url", url, urls: [url] },
    files: [{ name, url, target, sha256: hash }],
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
  const resolvedTargets: string[] = [];

  for (const file of entry.files) {
    const absTarget = resolveProjectTarget(projectDir, file.target);
    if (!absTarget) {
      return {
        id,
        ok: false,
        files: [{ name: file.name, target: file.target, sha256: "", ok: false, error: "Target path escapes project root" }],
        error: "Target path escapes project root",
      };
    }
    resolvedTargets.push(absTarget);
  }

  for (const [index, file] of entry.files.entries()) {
    const absTarget = resolvedTargets[index]!;

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

    if (file.generated?.type === "require-alias") {
      const content = packageDependencyAliasContent(file.generated.require);
      const actualSha = sha256Buffer(Buffer.from(content, "utf8"));
      if (actualSha !== file.sha256) {
        const fileResult: InstallFileResult = { name: file.name, target: file.target, sha256: "", ok: false, error: "Generated alias checksum mismatch" };
        onFileComplete?.(fileResult);
        return { id, ok: false, files: fileResults, error: fileResult.error };
      }
      mkdirSync(dirname(absTarget), { recursive: true });
      writeFileSync(absTarget, content);
      const fileResult: InstallFileResult = { name: file.name, target: file.target, sha256: file.sha256, ok: true };
      onFileComplete?.(fileResult);
      fileResults.push(fileResult);
      continue;
    }

    const url = lockfileFileUrl(entry, file);

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
