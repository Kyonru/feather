import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sha256Buffer } from "./checksum.js";
import { addToLockfile, type Lockfile, writeLockfile } from "./lockfile.js";
import { resolveProjectTarget } from "./target.js";

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
  selectedFiles: string[];
  targetMap: Record<string, string>;
  projectDir: string;
  lockfile: Lockfile;
  onFileStart?: (name: string) => void;
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
};

function validateTargets(projectDir: string, files: Array<{ target: string }>): string[] | { error: string } {
  const targets: string[] = [];
  for (const file of files) {
    const absoluteTarget = resolveProjectTarget(projectDir, file.target);
    if (!absoluteTarget) return { error: `Target path escapes project root: ${file.target}` };
    targets.push(absoluteTarget);
  }
  return targets;
}

export async function installCustomRepoPackage(input: CustomRepoPackageInput): Promise<CustomPackageInstallResult> {
  if (input.commitSha !== undefined && !COMMIT_SHA_RE.test(input.commitSha)) {
    return { ok: false, files: [], error: "commitSha must be a 40-character SHA" };
  }

  const plannedFiles = input.selectedFiles.map((name) => ({
    name,
    target: input.targetMap[name] ?? name,
  }));
  const targets = validateTargets(input.projectDir, plannedFiles);
  if ("error" in targets) return { ok: false, files: [], error: targets.error };

  const lockedFiles: CustomPackageFile[] = [];

  for (const [index, file] of plannedFiles.entries()) {
    input.onFileStart?.(file.name);

    const url = input.baseUrl + file.name;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      return { ok: false, files: lockedFiles, error: `Network error: ${(err as Error).message}` };
    }
    if (!res.ok) return { ok: false, files: lockedFiles, error: `HTTP ${res.status} fetching ${url}` };

    const buffer = Buffer.from(await res.arrayBuffer());
    const sha256 = sha256Buffer(buffer);
    const absoluteTarget = targets[index]!;
    mkdirSync(dirname(absoluteTarget), { recursive: true });
    writeFileSync(absoluteTarget, buffer);
    lockedFiles.push({ name: file.name, url, target: file.target, sha256 });
  }

  addToLockfile(input.lockfile, input.id, {
    version: input.tag,
    trust: "experimental",
    source: {
      repo: input.repoName,
      tag: input.tag,
      ...(input.commitSha ? { resolvedRef: input.commitSha, commitSha: input.commitSha } : {}),
    },
    files: lockedFiles,
  });
  writeLockfile(input.projectDir, input.lockfile);

  return { ok: true, files: lockedFiles };
}

export async function installCustomUrlPackage(input: CustomUrlPackageInput): Promise<CustomPackageInstallResult> {
  if (input.urlFiles.length === 0) return { ok: false, files: [], error: "No URL files selected" };

  const targets = validateTargets(input.projectDir, input.urlFiles);
  if ("error" in targets) return { ok: false, files: [], error: targets.error };

  const lockedFiles = input.urlFiles.map((file) => {
    const actualSha256 = sha256Buffer(file.buffer);
    return {
      name: file.name,
      url: file.url,
      target: file.target,
      sha256: actualSha256,
    };
  });

  for (const [index, file] of input.urlFiles.entries()) {
    const absoluteTarget = targets[index]!;
    mkdirSync(dirname(absoluteTarget), { recursive: true });
    writeFileSync(absoluteTarget, file.buffer);
  }

  addToLockfile(input.lockfile, input.id, {
    version: "url",
    trust: "experimental",
    source: {
      kind: "url",
      url: input.urlFiles[0]!.url,
      urls: input.urlFiles.map((file) => file.url),
    },
    files: lockedFiles,
  });
  writeLockfile(input.projectDir, input.lockfile);

  return { ok: true, files: lockedFiles };
}
