import { sha256Buffer } from "./checksum.js";
import { PACKAGE_LOCK_FEATURE_REQUIREMENT, PACKAGE_LOCK_FEATURES } from "./compat.js";
import { fetchGitPackageFiles } from "./git-source.js";
import { addToLockfile, cloneLockfile, markLockfileFeature, type Lockfile } from "./lockfile.js";
import { buildOwnershipIndex, checkInstallTarget, type DiskState } from "./ownership.js";
import { resolveProjectTarget } from "./target.js";
import { commitPackageTransaction, type TransactionHooks } from "./transaction.js";

export type CustomPackageFile = {
  name: string;
  url?: string;
  target: string;
  sha256: string;
};

export type CustomPackageInstallResult = {
  ok: boolean;
  files: CustomPackageFile[];
  error?: string;
};

export type CustomRepoPackageInput = {
  id: string;
  repoName: string;
  tag: string;
  commitSha?: string;
  baseUrl: string;
  transport?: "raw" | "git";
  selectedFiles: string[];
  targetMap: Record<string, string>;
  projectDir: string;
  lockfile: Lockfile;
  onFileStart?: (name: string) => void;
  hooks?: TransactionHooks;
};

const COMMIT_SHA_RE = /^[a-f0-9]{40}$/i;

export type CustomUrlFileInput = {
  name: string;
  url: string;
  sha256: string;
  target: string;
  buffer: Buffer;
};

export type CustomUrlPackageInput = {
  id: string;
  urlFiles: CustomUrlFileInput[];
  projectDir: string;
  lockfile: Lockfile;
  hooks?: TransactionHooks;
};

type CheckedTarget = { absTarget: string; disk: DiskState };

/** Path safety plus ownership: refuse other packages' files, untracked files and symlinks before any fetch. */
function validateTargets(
  projectDir: string,
  lockfile: Lockfile,
  id: string,
  files: Array<{ target: string }>,
): CheckedTarget[] | { error: string } {
  const index = buildOwnershipIndex(lockfile);
  const targets: CheckedTarget[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!resolveProjectTarget(projectDir, file.target)) return { error: `Target path escapes project root: ${file.target}` };
    if (seen.has(file.target)) return { error: `Two selected files target ${file.target}` };
    seen.add(file.target);
    const check = checkInstallTarget({ projectDir, lockfile, index, packageId: id, target: file.target });
    if (!check.ok) return { error: check.error };
    targets.push({ absTarget: check.absTarget, disk: check.disk });
  }
  return targets;
}

/** Swap every file in and replace the lockfile last; on success `input.lockfile` becomes `next`. */
function commitCustomInstall(
  input: { projectDir: string; lockfile: Lockfile; hooks?: TransactionHooks },
  targets: CheckedTarget[],
  files: Array<{ target: string; buffer: Buffer; sha256: string }>,
  next: Lockfile,
): string | null {
  const writes = files.flatMap((file, index) => {
    const target = targets[index]!;
    if (target.disk.kind === "file" && target.disk.sha256 === file.sha256) return [];
    return [{ target: file.target, absTarget: target.absTarget, content: file.buffer }];
  });
  const commit = commitPackageTransaction({ projectDir: input.projectDir, writes, lockfile: next, hooks: input.hooks });
  if (!commit.ok) return commit.error;
  for (const key of Object.keys(input.lockfile) as Array<keyof Lockfile>) delete input.lockfile[key];
  Object.assign(input.lockfile, next);
  return null;
}

export async function installCustomRepoPackage(input: CustomRepoPackageInput): Promise<CustomPackageInstallResult> {
  if (input.commitSha !== undefined && !COMMIT_SHA_RE.test(input.commitSha)) {
    return { ok: false, files: [], error: "commitSha must be a 40-character SHA" };
  }

  const plannedFiles = input.selectedFiles.map((name) => ({
    name,
    target: input.targetMap[name] ?? name,
  }));
  const targets = validateTargets(input.projectDir, input.lockfile, input.id, plannedFiles);
  if ("error" in targets) return { ok: false, files: [], error: targets.error };

  const lockedFiles: CustomPackageFile[] = [];
  const fetchedFiles: Array<{ target: string; buffer: Buffer; sha256: string }> = [];

  if (input.transport === "git") {
    const result = fetchGitPackageFiles(
      {
        repo: input.repoName,
        tag: input.tag,
        ...(input.commitSha ? { commitSha: input.commitSha } : {}),
      },
      plannedFiles.map((file) => ({ name: file.name })),
    );
    if (!result.ok) return { ok: false, files: lockedFiles, error: result.error };
    for (const [index, file] of plannedFiles.entries()) {
      input.onFileStart?.(file.name);
      const fetched = result.files[index]!;
      fetchedFiles.push({ target: file.target, buffer: fetched.buffer, sha256: fetched.sha256 });
      lockedFiles.push({ name: file.name, target: file.target, sha256: fetched.sha256 });
    }
  } else {
    for (const file of plannedFiles) {
      input.onFileStart?.(file.name);

      const url = input.baseUrl + file.name;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      } catch (err) {
        return { ok: false, files: [], error: `Network error: ${(err as Error).message}` };
      }
      if (!res.ok) return { ok: false, files: [], error: `HTTP ${res.status} fetching ${url}` };

      const buffer = Buffer.from(await res.arrayBuffer());
      const sha256 = sha256Buffer(buffer);
      fetchedFiles.push({ target: file.target, buffer, sha256 });
      lockedFiles.push({ name: file.name, url, target: file.target, sha256 });
    }
  }

  const next = cloneLockfile(input.lockfile);
  if (input.transport === "git") {
    markLockfileFeature(next, PACKAGE_LOCK_FEATURES.gitPackageSources, PACKAGE_LOCK_FEATURE_REQUIREMENT);
  }
  addToLockfile(next, input.id, {
    version: input.tag,
    trust: "experimental",
    source: {
      repo: input.repoName,
      tag: input.tag,
      ...(input.transport === "git" ? { transport: "git" as const } : {}),
      ...(input.commitSha ? { resolvedRef: input.commitSha, commitSha: input.commitSha } : {}),
    },
    files: lockedFiles,
  });
  const error = commitCustomInstall(input, targets, fetchedFiles, next);
  if (error) return { ok: false, files: [], error };

  return { ok: true, files: lockedFiles };
}

export async function installCustomUrlPackage(input: CustomUrlPackageInput): Promise<CustomPackageInstallResult> {
  if (input.urlFiles.length === 0) return { ok: false, files: [], error: "No URL files selected" };

  const targets = validateTargets(input.projectDir, input.lockfile, input.id, input.urlFiles);
  if ("error" in targets) return { ok: false, files: [], error: targets.error };

  const lockedFiles = input.urlFiles.map((file) => ({
    name: file.name,
    url: file.url,
    target: file.target,
    sha256: sha256Buffer(file.buffer),
  }));

  const next = cloneLockfile(input.lockfile);
  addToLockfile(next, input.id, {
    version: "url",
    trust: "experimental",
    source: {
      kind: "url",
      url: input.urlFiles[0]!.url,
      urls: input.urlFiles.map((file) => file.url),
    },
    files: lockedFiles,
  });
  const error = commitCustomInstall(
    input,
    targets,
    input.urlFiles.map((file, index) => ({ target: file.target, buffer: file.buffer, sha256: lockedFiles[index]!.sha256 })),
    next,
  );
  if (error) return { ok: false, files: [], error };

  return { ok: true, files: lockedFiles };
}
