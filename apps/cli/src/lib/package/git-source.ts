import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Buffer } from "./checksum.js";
import type { LockfileRepoSource } from "./lockfile.js";
import { resolveProjectTarget } from "./target.js";

export type GitRef = {
  value: string;
  label: string;
};

export type GitPackageFile = {
  name: string;
  buffer: Buffer;
  sha256: string;
};

export type GitPackageFetchResult =
  | { ok: true; commitSha: string; files: GitPackageFile[] }
  | { ok: false; error: string };

export type GitRunner = (
  args: string[],
  opts?: { cwd?: string },
) => SpawnSyncReturns<string>;

const COMMIT_SHA_RE = /^[a-f0-9]{40}$/i;

function defaultGitRunner(args: string[], opts: { cwd?: string } = {}): SpawnSyncReturns<string> {
  return spawnSync("git", args, {
    cwd: opts.cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
}

function gitError(result: SpawnSyncReturns<string>, fallback: string): string {
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    return "git is required to install this package. Install git and make sure it is on PATH.";
  }
  if (result.error) return `${fallback}: ${result.error.message}`;
  return (result.stderr || result.stdout || fallback).trim();
}

function runGit(runner: GitRunner, args: string[], opts?: { cwd?: string }): { ok: true; stdout: string } | { ok: false; error: string } {
  const result = runner(args, opts);
  if (result.status !== 0 || result.error) {
    return { ok: false, error: gitError(result, `git ${args.join(" ")} failed`) };
  }
  return { ok: true, stdout: result.stdout ?? "" };
}

export function gitRepoUrl(repo: string): string {
  if (/^(?:https?:\/\/|ssh:\/\/|git@)/i.test(repo)) return repo;
  if (repo.startsWith("/") || repo.startsWith("./") || repo.startsWith("../") || /^[A-Za-z]:[\\/]/.test(repo)) return repo;
  return `https://github.com/${repo}.git`;
}

function gitSourceRef(source: Pick<LockfileRepoSource, "tag" | "commitSha" | "resolvedRef">): string {
  return source.commitSha ?? source.resolvedRef ?? source.tag;
}

function checkoutGitSource(
  source: Pick<LockfileRepoSource, "repo" | "tag" | "commitSha" | "resolvedRef">,
  opts: { runner?: GitRunner } = {},
): { ok: true; dir: string; commitSha: string; cleanup: () => void } | { ok: false; error: string } {
  const runner = opts.runner ?? defaultGitRunner;
  const tempDir = mkdtempSync(join(tmpdir(), "feather-package-git-"));
  const cleanup = () => rmSync(tempDir, { recursive: true, force: true });

  const init = runGit(runner, ["init", "--quiet"], { cwd: tempDir });
  if (!init.ok) {
    cleanup();
    return init;
  }

  const remote = runGit(runner, ["remote", "add", "origin", gitRepoUrl(source.repo)], { cwd: tempDir });
  if (!remote.ok) {
    cleanup();
    return remote;
  }

  const requestedRef = gitSourceRef(source);
  let fetch = runGit(runner, ["fetch", "--depth=1", "--filter=blob:none", "origin", requestedRef], { cwd: tempDir });
  if (!fetch.ok && source.commitSha && source.tag && source.tag !== source.commitSha) {
    fetch = runGit(runner, ["fetch", "--depth=1", "--filter=blob:none", "origin", source.tag], { cwd: tempDir });
  }
  if (!fetch.ok) {
    cleanup();
    return { ok: false, error: `Git fetch failed for ${source.repo}@${requestedRef}: ${fetch.error}` };
  }

  const checkout = runGit(runner, ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: tempDir });
  if (!checkout.ok) {
    cleanup();
    return checkout;
  }

  const rev = runGit(runner, ["rev-parse", "HEAD"], { cwd: tempDir });
  if (!rev.ok) {
    cleanup();
    return rev;
  }
  const commitSha = rev.stdout.trim();
  if (!COMMIT_SHA_RE.test(commitSha)) {
    cleanup();
    return { ok: false, error: `Git checkout for ${source.repo}@${requestedRef} did not produce a commit SHA.` };
  }
  if (source.commitSha && commitSha.toLowerCase() !== source.commitSha.toLowerCase()) {
    cleanup();
    return {
      ok: false,
      error: `Git ref mismatch for ${source.repo}@${source.tag}: expected ${source.commitSha}, got ${commitSha}.`,
    };
  }

  return { ok: true, dir: tempDir, commitSha, cleanup };
}

export function fetchGitPackageFiles(
  source: Pick<LockfileRepoSource, "repo" | "tag" | "commitSha" | "resolvedRef">,
  files: Array<{ name: string; sha256?: string }>,
  opts: { runner?: GitRunner } = {},
): GitPackageFetchResult {
  const checkout = checkoutGitSource(source, opts);
  if (!checkout.ok) return checkout;

  try {
    const results: GitPackageFile[] = [];
    for (const file of files) {
      const absolute = resolveProjectTarget(checkout.dir, file.name);
      if (!absolute) return { ok: false, error: `Package file escapes Git checkout: ${file.name}` };
      let buffer: Buffer;
      try {
        buffer = readFileSync(absolute);
      } catch {
        return { ok: false, error: `Package file not found in Git checkout: ${file.name}` };
      }
      const sha256 = sha256Buffer(buffer);
      if (file.sha256 && sha256 !== file.sha256) {
        return {
          ok: false,
          error: `Checksum mismatch for ${file.name}\n  expected: ${file.sha256}\n  got:      ${sha256}`,
        };
      }
      results.push({ name: file.name, buffer, sha256 });
    }
    return { ok: true, commitSha: checkout.commitSha, files: results };
  } finally {
    checkout.cleanup();
  }
}

function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git") return [];
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFiles(dir, path);
    return entry.isFile() ? [path] : [];
  });
}

export function listGitLuaFiles(
  source: Pick<LockfileRepoSource, "repo" | "tag" | "commitSha" | "resolvedRef">,
  opts: { runner?: GitRunner } = {},
): { ok: true; files: string[]; commitSha: string } | { ok: false; error: string } {
  const checkout = checkoutGitSource(source, opts);
  if (!checkout.ok) return checkout;
  try {
    return {
      ok: true,
      commitSha: checkout.commitSha,
      files: listFiles(checkout.dir).filter((file) => file.endsWith(".lua")).sort(),
    };
  } finally {
    checkout.cleanup();
  }
}

export function listGitRefs(repo: string, opts: { runner?: GitRunner } = {}): { ok: true; refs: GitRef[] } | { ok: false; error: string } {
  const runner = opts.runner ?? defaultGitRunner;
  const result = runGit(runner, ["ls-remote", "--heads", "--tags", gitRepoUrl(repo)]);
  if (!result.ok) return { ok: false, error: `Git ref lookup failed for ${repo}: ${result.error}` };

  const tags: GitRef[] = [];
  const branches: GitRef[] = [];
  const seen = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (!sha || !ref || ref.endsWith("^{}")) continue;
    if (ref.startsWith("refs/tags/")) {
      const value = ref.slice("refs/tags/".length);
      if (!seen.has(`tag:${value}`)) {
        tags.push({ value, label: value });
        seen.add(`tag:${value}`);
      }
    } else if (ref.startsWith("refs/heads/")) {
      const value = ref.slice("refs/heads/".length);
      if (!seen.has(`branch:${value}`)) {
        branches.push({ value, label: `⎇  ${value}` });
        seen.add(`branch:${value}`);
      }
    }
  }
  return { ok: true, refs: [...tags.sort((a, b) => a.value.localeCompare(b.value)), ...branches.sort((a, b) => a.value.localeCompare(b.value))] };
}

export function resolveGitRef(repo: string, ref: string, opts: { runner?: GitRunner } = {}): { ok: true; commitSha: string } | { ok: false; error: string } {
  const runner = opts.runner ?? defaultGitRunner;
  const result = runGit(runner, ["ls-remote", gitRepoUrl(repo), ref, `refs/heads/${ref}`, `refs/tags/${ref}`, `refs/tags/${ref}^{}`]);
  if (!result.ok) return { ok: false, error: `Git ref lookup failed for ${repo}@${ref}: ${result.error}` };
  for (const line of result.stdout.split(/\r?\n/)) {
    const [sha, refName] = line.trim().split(/\s+/);
    if (sha && COMMIT_SHA_RE.test(sha) && (refName?.endsWith("^{}") || refName === ref || refName?.endsWith(`/${ref}`))) {
      return { ok: true, commitSha: sha };
    }
  }
  const firstSha = result.stdout.trim().split(/\s+/)[0];
  if (firstSha && COMMIT_SHA_RE.test(firstSha)) return { ok: true, commitSha: firstSha };
  return { ok: false, error: `Git ref ${ref} was not found for ${repo}.` };
}
