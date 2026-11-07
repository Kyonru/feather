import { fetchCommitSha } from "../github.js";
import { sha256Buffer } from "./checksum.js";
import { PACKAGE_LOCK_FEATURE_REQUIREMENT, PACKAGE_LOCK_FEATURES } from "./compat.js";
import {
  addToLockfile,
  cloneLockfile,
  markLockfileFeature,
  type Lockfile,
  type LockfileEntry,
  type LockfileFile,
  type LockfileRepoSource,
} from "./lockfile.js";
import { fetchGitPackageFiles } from "./git-source.js";
import { lockfileFileUrl } from "./provenance.js";
import { planPackageTarget, resolveProjectTarget } from "./target.js";
import type { ResolvedPackage } from "./resolve.js";
import type { PackageFile, RegistryEntry } from "./registry.js";
import { packageDependencyAliasContent, planDependencyAliases } from "./aliases.js";
import { planPackageLicenses } from "./licenses.js";
import {
  buildOwnershipIndex,
  canonicalTarget,
  checkInstallTarget,
  inspectDiskTarget,
  type DiskState,
  type OwnershipIndex,
} from "./ownership.js";
import {
  commitPackageTransaction,
  interruptedTransactionError,
  type TransactionDelete,
  type TransactionHooks,
  type TransactionWrite,
} from "./transaction.js";

/** Resolves a requested GitHub ref (tag, branch, or SHA) to an immutable commit SHA. */
export type RefResolver = (repo: string, ref: string) => Promise<string>;

export type InstallOptions = {
  projectDir: string;
  dryRun?: boolean;
  targetOverride?: string;
  installDir?: string;
  saveInstallDir?: boolean;
  includeLicenses?: boolean;
  /** Overwrite untracked files and locally modified package files at install targets. */
  force?: boolean;
  onFileStart?: (name: string) => void;
  onFileComplete?: (result: InstallFileResult) => void;
  /** Test seam: fault injection inside the commit. */
  hooks?: TransactionHooks;
  /** Test seam: replaces the GitHub API lookup used for raw version overrides. */
  resolveRef?: RefResolver;
};

export type BatchInstallOptions = Omit<InstallOptions, "onFileStart" | "onFileComplete"> & {
  onPackageStart?: (id: string) => void;
  onFileStart?: (id: string, name: string) => void;
  onFileComplete?: (id: string, result: InstallFileResult) => void;
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
  /** For version overrides: the ref that was asked for and the commit it resolved to. */
  requestedRef?: string;
  resolvedCommit?: string;
  warnings?: string[];
};

export type InstallBatchResult = {
  ok: boolean;
  results: InstallResult[];
  warnings: string[];
  error?: string;
};

const COMMIT_SHA_RE = /^[a-f0-9]{40}$/i;
const NOT_COMMITTED = "Not installed: another package in this command failed, so nothing was changed.";

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
    return { error: `File not found for ${repo}@${version} (HTTP 404): ${url}` };
  }
  if (!res.ok) return { error: `HTTP ${res.status} fetching ${url}` };
  return Buffer.from(await res.arrayBuffer());
}

async function defaultResolveRef(repo: string, ref: string): Promise<string> {
  return fetchCommitSha(repo, ref);
}

function isGitTransport(source: { transport?: "raw" | "git" }): boolean {
  return source.transport === "git";
}

/**
 * The raw base URL for `repo` at `commit`, keeping any subdirectory the catalog base URL uses.
 * The catalog URL is parsed, never string-rewritten: a version override must fetch the commit the
 * requested ref resolves to, and the catalog URL is pinned to a different commit.
 */
export function rawBaseUrlForCommit(source: RegistryEntry["source"], commit: string): string | { error: string } {
  const match = source.baseUrl?.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.*)$/);
  if (!match || !source.repo || `${match[1]}/${match[2]}`.toLowerCase() !== source.repo.toLowerCase()) {
    return { error: `Cannot apply a version override: catalog baseUrl for ${source.repo ?? "this package"} is not a raw GitHub URL for that repo.` };
  }
  if (source.commitSha && match[3] !== source.commitSha) {
    return { error: `Cannot apply a version override: catalog baseUrl is not pinned to source.commitSha.` };
  }
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${commit}/${match[4]}`;
}

type PlannedItem = {
  kind: "file" | "license" | "alias";
  name: string;
  target: string;
  absTarget: string;
  /** Catalog hash; undefined for live-computed overrides and generated aliases. */
  expectedSha256?: string;
  role?: "license";
  source?: PackageFile;
  disk: DiskState;
  content?: Buffer;
  sha256?: string;
  /** Generated aliases only: the module the shim requires. */
  requirePath?: string;
};

type PackagePlan = {
  pkg: ResolvedPackage;
  items: PlannedItem[];
  obsolete: TransactionDelete[];
  effectiveInstallDir?: string;
  shouldSaveInstallDir: boolean;
  warnings: string[];
  resolvedCommit?: string;
  resolvedAt?: string;
};

type PlanFailure = { id: string; target?: string; name?: string; error: string };

function failureResult(packages: ResolvedPackage[], failure: PlanFailure, warnings: string[] = []): InstallBatchResult {
  return {
    ok: false,
    error: failure.error,
    warnings,
    results: packages.map((pkg) =>
      pkg.id === failure.id
        ? {
            id: pkg.id,
            ok: false,
            files: failure.target
              ? [{ name: failure.name ?? failure.target, target: failure.target, sha256: "", ok: false, error: failure.error }]
              : [],
            error: failure.error,
          }
        : { id: pkg.id, ok: false, files: [], error: NOT_COMMITTED },
    ),
  };
}

/**
 * Files a package owned before this command but no longer plans to write. Unchanged ones are
 * deleted in the transaction; modified ones are left in place and reported.
 */
function planObsolete(
  projectDir: string,
  lockfile: Lockfile,
  index: OwnershipIndex,
  id: string,
  keepTargets: Set<string>,
): { deletes: TransactionDelete[]; warnings: string[] } {
  const deletes: TransactionDelete[] = [];
  const warnings: string[] = [];
  for (const file of lockfile.packages[id]?.files ?? []) {
    const target = canonicalTarget(file.target);
    if (keepTargets.has(target)) continue;
    if ((index.get(target) ?? []).some((owner) => owner.id !== id)) continue;
    const absTarget = resolveProjectTarget(projectDir, target);
    if (!absTarget) {
      warnings.push(`Left ${target} in place: it resolves outside the project.`);
      continue;
    }
    const disk = inspectDiskTarget(absTarget);
    if (disk.kind === "missing") continue;
    if (disk.kind === "file" && disk.sha256 === file.sha256) {
      deletes.push({ target, absTarget });
      continue;
    }
    warnings.push(`Kept ${target}: it has local changes, so Feather left it in place and no longer manages it.`);
  }
  return { deletes, warnings };
}

function lockedFilesFor(plan: PackagePlan): LockfileFile[] {
  return plan.items.map((item) => {
    if (item.kind === "alias") {
      return {
        name: item.name,
        target: item.target,
        sha256: item.sha256!,
        generated: { type: "require-alias" as const, require: item.requirePath! },
      };
    }
    return { name: item.name, target: item.target, sha256: item.sha256!, ...(item.role ? { role: item.role } : {}) };
  });
}

function planPackage(
  pkg: ResolvedPackage,
  lockfile: Lockfile,
  index: OwnershipIndex,
  batchTargets: Map<string, { id: string; sha256?: string }>,
  batchIds: Set<string>,
  parentOf: (id: string) => string | undefined,
  opts: BatchInstallOptions,
): PackagePlan | PlanFailure {
  const { projectDir, targetOverride, installDir, saveInstallDir } = opts;
  const savedInstallDir = lockfile.packages[pkg.id]?.installDir;
  const layout = pkg.entry.install?.layout;
  const fixedLayout = layout === "fixed";

  if (fixedLayout && targetOverride) {
    return { id: pkg.id, error: `${pkg.id} has fixed runtime paths and cannot be flattened.` };
  }

  const effectiveInstallDir = targetOverride || fixedLayout ? undefined : (installDir ?? savedInstallDir);
  const shouldSaveInstallDir = !targetOverride && !fixedLayout && (installDir ? !!saveInstallDir : !!savedInstallDir);
  const override = pkg.versionOverride;

  const rawItems: Array<Omit<PlannedItem, "absTarget" | "disk">> = [
    ...pkg.files.map((file) => ({
      kind: "file" as const,
      name: file.name,
      target: canonicalTarget(planPackageTarget(file, { targetOverride, installDir: effectiveInstallDir, layout })),
      expectedSha256: override ? undefined : file.sha256,
      source: file,
    })),
    ...(opts.includeLicenses
      ? planPackageLicenses(pkg.id, pkg.files, pkg.entry.install?.licenses, {
          targetOverride,
          installDir: effectiveInstallDir,
          layout,
        }).map((file) => ({
          kind: "license" as const,
          name: file.name,
          target: canonicalTarget(file.target),
          expectedSha256: override ? undefined : file.sha256,
          role: "license" as const,
          source: file,
        }))
      : []),
  ];

  const aliasPlan = planDependencyAliases(pkg, lockfile, { installDir, targetOverride, dryRun: true });
  if (!aliasPlan.ok) return { id: pkg.id, error: aliasPlan.error };
  for (const alias of aliasPlan.aliases) {
    if (!lockfile.packages[alias.dependency] && !batchIds.has(alias.dependency)) {
      return { id: pkg.id, error: `${pkg.id} dependency alias requires missing dependency "${alias.dependency}".` };
    }
    const target = canonicalTarget(alias.target);
    if (rawItems.some((item) => item.target === target)) {
      return { id: pkg.id, target, name: alias.name, error: "Dependency alias target overlaps an installed file" };
    }
    rawItems.push({ kind: "alias", name: alias.name, target });
  }

  const items: PlannedItem[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const item of rawItems) {
    if (seen.has(item.target)) {
      const error = item.role === "license" ? "License target overlaps another installed file" : "Package file target overlaps another installed file";
      return { id: pkg.id, target: item.target, name: item.name, error };
    }
    seen.add(item.target);

    const claimed = batchTargets.get(item.target);
    if (claimed && claimed.id !== pkg.id) {
      const shared = parentOf(claimed.id) === pkg.id || parentOf(pkg.id) === claimed.id || (parentOf(pkg.id) !== undefined && parentOf(pkg.id) === parentOf(claimed.id));
      if (!shared || !item.expectedSha256 || claimed.sha256 !== item.expectedSha256) {
        return { id: pkg.id, target: item.target, name: item.name, error: `${item.target} is also planned by package "${claimed.id}" in this command.` };
      }
    }

    const check = checkInstallTarget({
      projectDir,
      lockfile,
      index,
      packageId: pkg.id,
      target: item.target,
      expectedSha256: item.expectedSha256,
      force: opts.force,
      parentOf,
    });
    if (!check.ok) {
      const error = check.error.includes("escapes the project root") ? "Target path escapes project root" : check.error;
      return { id: pkg.id, target: item.target, name: item.name, error };
    }
    if (check.warning) warnings.push(check.warning);
    items.push({ ...item, absTarget: check.absTarget, disk: check.disk });
  }

  for (const item of items) batchTargets.set(item.target, { id: pkg.id, sha256: item.expectedSha256 });

  const obsolete = planObsolete(projectDir, lockfile, index, pkg.id, new Set(items.map((item) => item.target)));
  warnings.push(...obsolete.warnings);

  return { pkg, items, obsolete: obsolete.deletes, effectiveInstallDir, shouldSaveInstallDir, warnings };
}

async function stagePackage(plan: PackagePlan, opts: BatchInstallOptions): Promise<{ error: string; target?: string; name?: string } | null> {
  const { pkg } = plan;
  const src = pkg.entry.source;
  const override = pkg.versionOverride;
  const downloads = plan.items.filter((item) => item.kind !== "alias");
  const report = (item: PlannedItem, error?: string) =>
    opts.onFileComplete?.(pkg.id, {
      name: item.name,
      target: item.target,
      sha256: item.sha256 ?? "",
      ok: !error,
      ...(error ? { error } : {}),
    });

  if (isGitTransport(src)) {
    for (const item of downloads) opts.onFileStart?.(pkg.id, item.name);
    const result = fetchGitPackageFiles(
      {
        repo: src.repo ?? pkg.id,
        tag: override ?? src.tag ?? "url",
        ...(!override && src.commitSha ? { commitSha: src.commitSha } : {}),
        ...(!override && src.resolvedRef ? { resolvedRef: src.resolvedRef } : {}),
      },
      downloads.map((item) => ({ name: item.name, sha256: item.expectedSha256 })),
    );
    if (!result.ok) return { error: result.error };
    for (const [index, item] of downloads.entries()) {
      const fetched = result.files[index]!;
      item.content = fetched.buffer;
      item.sha256 = fetched.sha256;
      report(item);
    }
    if (override) {
      plan.resolvedCommit = result.commitSha;
      plan.resolvedAt = new Date().toISOString();
    }
    return null;
  }

  let base = src.baseUrl ?? "";
  if (override) {
    let commit: string;
    if (COMMIT_SHA_RE.test(override)) {
      commit = override.toLowerCase();
    } else {
      try {
        commit = await (opts.resolveRef ?? defaultResolveRef)(src.repo ?? pkg.id, override);
      } catch (err) {
        return {
          error:
            `Could not resolve ${pkg.id}@${override} to a commit: ${(err as Error).message}. ` +
            `Check available releases at github.com/${src.repo ?? pkg.id}/releases`,
        };
      }
      if (typeof commit !== "string" || !COMMIT_SHA_RE.test(commit)) {
        return { error: `Could not resolve ${pkg.id}@${override} to a commit SHA.` };
      }
    }
    const resolvedBase = rawBaseUrlForCommit(src, commit);
    if (typeof resolvedBase !== "string") return resolvedBase;
    base = resolvedBase;
    plan.resolvedCommit = commit;
    plan.resolvedAt = new Date().toISOString();
  }

  for (const item of downloads) {
    opts.onFileStart?.(pkg.id, item.name);
    if (override && item.source?.url) {
      const error = `${pkg.id} pins ${item.name} to a fixed URL, so it cannot be installed at another version.`;
      report(item, error);
      return { error, target: item.target, name: item.name };
    }
    const url = override ? base + item.name : (item.source?.url ?? base + item.name);
    const result = override
      ? await downloadLive(url, src.repo ?? pkg.id, override)
      : await downloadVerified(url, item.expectedSha256!);
    if ("error" in result) {
      report(item, result.error);
      return { error: result.error, target: item.target, name: item.name };
    }
    item.content = result;
    item.sha256 = sha256Buffer(result);
    report(item);
  }
  return null;
}

function lockSourceFor(plan: PackagePlan): LockfileRepoSource {
  const { pkg } = plan;
  const src = pkg.entry.source;
  const gitTransport = isGitTransport(src);
  const override = pkg.versionOverride;
  const tag = override ?? src.tag ?? "url";
  if (override) {
    return {
      repo: src.repo ?? pkg.id,
      tag,
      ...(gitTransport ? { transport: "git" as const } : {}),
      requestedRef: override,
      ...(plan.resolvedCommit ? { commitSha: plan.resolvedCommit, resolvedRef: plan.resolvedCommit } : {}),
      ...(plan.resolvedAt ? { resolvedAt: plan.resolvedAt } : {}),
    };
  }
  return {
    repo: src.repo ?? pkg.id,
    tag,
    ...(gitTransport ? { transport: "git" as const } : {}),
    ...(src.commitSha ? { resolvedRef: src.commitSha, commitSha: src.commitSha } : {}),
  };
}

function replaceLockfileContents(target: Lockfile, next: Lockfile): void {
  for (const key of Object.keys(target) as Array<keyof Lockfile>) delete target[key];
  Object.assign(target, next);
}

/**
 * Install every package in one transaction: plan and ownership-check every target, download and
 * verify everything, then swap all files and replace the lockfile last. Any failure changes nothing.
 * On success `lockfile` is updated in place to the committed state.
 */
export async function installPackages(
  packages: ResolvedPackage[],
  lockfile: Lockfile,
  opts: BatchInstallOptions,
): Promise<InstallBatchResult> {
  const leftover = interruptedTransactionError(opts.projectDir);
  if (leftover && !opts.dryRun) return failureResult(packages, { id: packages[0]?.id ?? "", error: leftover });

  const index = buildOwnershipIndex(lockfile);
  const batchIds = new Set(packages.map((pkg) => pkg.id));
  const parentById = new Map(packages.map((pkg) => [pkg.id, pkg.entry.parent]));
  const parentOf = (id: string) => lockfile.packages[id]?.parent ?? parentById.get(id);
  const batchTargets = new Map<string, { id: string; sha256?: string }>();

  // 1. Plan and check ownership for every package before any download or write.
  const plans: PackagePlan[] = [];
  for (const pkg of packages) {
    const plan = planPackage(pkg, lockfile, index, batchTargets, batchIds, parentOf, opts);
    if ("error" in plan) return failureResult(packages, plan);
    plans.push(plan);
  }
  const warnings = plans.flatMap((plan) => plan.warnings);

  if (opts.dryRun) {
    return {
      ok: true,
      warnings,
      results: plans.map((plan) => ({
        id: plan.pkg.id,
        ok: true,
        files: plan.items.map((item) => ({ name: item.name, target: item.target, sha256: item.expectedSha256 ?? "", ok: true })),
        ...(plan.warnings.length ? { warnings: plan.warnings } : {}),
      })),
    };
  }

  // 2. Stage every download in memory and verify checksums.
  for (const plan of plans) {
    opts.onPackageStart?.(plan.pkg.id);
    const failure = await stagePackage(plan, opts);
    if (failure) return failureResult(packages, { id: plan.pkg.id, ...failure }, warnings);
  }

  // 3. Build the next lockfile. Aliases are generated here because their require path depends on
  //    where this command places their dependency.
  const next = cloneLockfile(lockfile);
  for (const plan of plans) {
    const { pkg } = plan;
    const aliases = planDependencyAliases(pkg, next, {
      installDir: opts.installDir,
      targetOverride: opts.targetOverride,
    });
    if (!aliases.ok) return failureResult(packages, { id: pkg.id, error: aliases.error }, warnings);
    for (const alias of aliases.aliases) {
      const item = plan.items.find((candidate) => candidate.kind === "alias" && candidate.target === canonicalTarget(alias.target));
      if (!item) return failureResult(packages, { id: pkg.id, error: `Dependency alias ${alias.target} changed during planning.` }, warnings);
      item.content = Buffer.from(alias.content, "utf8");
      item.sha256 = alias.sha256;
      item.requirePath = alias.requirePath;
      opts.onFileComplete?.(pkg.id, { name: item.name, target: item.target, sha256: alias.sha256, ok: true });
    }

    const gitTransport = isGitTransport(pkg.entry.source);
    const files = lockedFilesFor(plan);
    if (pkg.entry.dependencies?.length || pkg.dependencyOf?.length || pkg.dependencyAliases?.length) {
      markLockfileFeature(next, PACKAGE_LOCK_FEATURES.packageDependencies, PACKAGE_LOCK_FEATURE_REQUIREMENT);
    }
    if (files.some((file) => file.generated?.type === "require-alias")) {
      markLockfileFeature(next, PACKAGE_LOCK_FEATURES.generatedRequireAliases, PACKAGE_LOCK_FEATURE_REQUIREMENT);
    }
    if (gitTransport) {
      markLockfileFeature(next, PACKAGE_LOCK_FEATURES.gitPackageSources, PACKAGE_LOCK_FEATURE_REQUIREMENT);
    }
    addToLockfile(next, pkg.id, {
      parent: pkg.entry.parent,
      version: pkg.versionOverride ?? pkg.entry.source.tag ?? "url",
      trust: pkg.versionOverride ? "experimental" : pkg.entry.trust,
      source: lockSourceFor(plan),
      files,
      ...(pkg.entry.dependencies?.length ? { dependencies: [...pkg.entry.dependencies] } : {}),
      ...(plan.shouldSaveInstallDir && plan.effectiveInstallDir ? { installDir: plan.effectiveInstallDir } : {}),
    });
  }

  // 4. Commit: swap every changed file, delete obsolete ones, replace the lockfile last.
  const writes: TransactionWrite[] = [];
  for (const plan of plans) {
    for (const item of plan.items) {
      if (item.disk.kind === "file" && item.disk.sha256 === item.sha256) continue;
      writes.push({ target: item.target, absTarget: item.absTarget, content: item.content! });
    }
  }
  const commit = commitPackageTransaction({
    projectDir: opts.projectDir,
    writes,
    deletes: plans.flatMap((plan) => plan.obsolete),
    lockfile: next,
    hooks: opts.hooks,
  });
  if (!commit.ok) {
    return {
      ok: false,
      error: commit.error,
      warnings,
      results: plans.map((plan) => ({ id: plan.pkg.id, ok: false, files: [], error: commit.error })),
    };
  }

  replaceLockfileContents(lockfile, next);
  return {
    ok: true,
    warnings,
    results: plans.map((plan) => ({
      id: plan.pkg.id,
      ok: true,
      files: plan.items.map((item) => ({ name: item.name, target: item.target, sha256: item.sha256!, ok: true })),
      ...(plan.pkg.versionOverride ? { requestedRef: plan.pkg.versionOverride } : {}),
      ...(plan.pkg.versionOverride && plan.resolvedCommit ? { resolvedCommit: plan.resolvedCommit } : {}),
      ...(plan.warnings.length ? { warnings: plan.warnings } : {}),
    })),
  };
}

/** Single-package convenience wrapper around `installPackages`. */
export async function installPackage(
  pkg: ResolvedPackage,
  lockfile: Lockfile,
  opts: InstallOptions,
): Promise<InstallResult> {
  const { onFileStart, onFileComplete, ...rest } = opts;
  const batch = await installPackages([pkg], lockfile, {
    ...rest,
    onFileStart: onFileStart ? (_id, name) => onFileStart(name) : undefined,
    onFileComplete: onFileComplete ? (_id, result) => onFileComplete(result) : undefined,
  });
  const result = batch.results[0] ?? { id: pkg.id, ok: false, files: [] };
  return batch.ok ? result : { ...result, ok: false, error: result.error ?? batch.error };
}

export type ExperimentalInstallOptions = {
  projectDir: string;
  url: string;
  target: string;
  dryRun?: boolean;
  force?: boolean;
  hooks?: TransactionHooks;
};

export type ExperimentalInstallResult = {
  ok: boolean;
  sha256: string;
  size: number;
  error?: string;
  warnings?: string[];
};

/** Install one file from a URL. Ownership is checked before the download; the write is transactional. */
export async function installFromUrl(
  lockfile: Lockfile,
  opts: ExperimentalInstallOptions
): Promise<ExperimentalInstallResult & { target: string }> {
  const { projectDir, url, dryRun } = opts;
  const name = url.split("/").pop() ?? "package.lua";
  const id = name.replace(/\.lua$/, "");
  const target = canonicalTarget(opts.target);

  if (!dryRun) {
    const leftover = interruptedTransactionError(projectDir);
    if (leftover) return { ok: false, sha256: "", size: 0, target, error: leftover };
  }
  const index = buildOwnershipIndex(lockfile);
  const check = checkInstallTarget({ projectDir, lockfile, index, packageId: id, target, force: opts.force });
  if (!check.ok) {
    const error = check.error.includes("escapes the project root") ? "Target path escapes project root" : check.error;
    return { ok: false, sha256: "", size: 0, target, error };
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    return { ok: false, sha256: "", size: 0, target, error: `Network error: ${(err as Error).message}` };
  }
  if (!res.ok) return { ok: false, sha256: "", size: 0, target, error: `HTTP ${res.status}` };

  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256Buffer(buf);
  const warnings = check.warning ? [check.warning] : [];

  if (dryRun) {
    return { ok: true, sha256: hash, size: buf.byteLength, target, warnings };
  }

  const obsolete = planObsolete(projectDir, lockfile, index, id, new Set([target]));
  const next = cloneLockfile(lockfile);
  addToLockfile(next, id, {
    version: "0.0.0",
    trust: "experimental",
    source: { kind: "url", url, urls: [url] },
    files: [{ name, url, target, sha256: hash }],
  });
  const unchanged = check.disk.kind === "file" && check.disk.sha256 === hash;
  const commit = commitPackageTransaction({
    projectDir,
    writes: unchanged ? [] : [{ target, absTarget: check.absTarget, content: buf }],
    deletes: obsolete.deletes,
    lockfile: next,
    hooks: opts.hooks,
  });
  if (!commit.ok) return { ok: false, sha256: hash, size: buf.byteLength, target, error: commit.error };

  replaceLockfileContents(lockfile, next);
  return { ok: true, sha256: hash, size: buf.byteLength, target, warnings: [...warnings, ...obsolete.warnings] };
}

export type RestoreOptions = {
  projectDir: string;
  dryRun?: boolean;
  /** Replace locally modified files with their locked versions. */
  force?: boolean;
  onFileStart?: (name: string) => void;
  onFileComplete?: (result: InstallFileResult) => void;
  hooks?: TransactionHooks;
};

export type BatchRestoreOptions = Omit<RestoreOptions, "onFileStart" | "onFileComplete"> & {
  onFileStart?: (id: string, name: string) => void;
  onFileComplete?: (id: string, result: InstallFileResult) => void;
};

type RestoreItem = { file: LockfileFile; target: string; absTarget: string; content?: Buffer };

/**
 * Restore missing (and, with `force`, modified) locked files for every entry in one transaction.
 * The lockfile itself is not changed.
 */
export async function restorePackages(
  entries: Array<[string, LockfileEntry]>,
  lockfile: Lockfile,
  opts: BatchRestoreOptions,
): Promise<InstallBatchResult> {
  const { projectDir, dryRun } = opts;
  const index = buildOwnershipIndex(lockfile);
  const packageIds = entries.map(([id]) => id);
  const asPackages = packageIds.map((id) => ({ id }) as ResolvedPackage);
  const warnings: string[] = [];
  const fail = (id: string, error: string, target?: string, name?: string) =>
    failureResult(asPackages, { id, error, ...(target ? { target, name } : {}) }, warnings);

  if (!dryRun) {
    const leftover = interruptedTransactionError(projectDir);
    if (leftover) return fail(packageIds[0] ?? "", leftover);
  }

  const pending = new Map<string, RestoreItem[]>();
  const results = new Map<string, InstallFileResult[]>();
  for (const [id, entry] of entries) {
    const items: RestoreItem[] = [];
    const fileResults: InstallFileResult[] = [];
    for (const file of entry.files) {
      const target = canonicalTarget(file.target);
      const absTarget = resolveProjectTarget(projectDir, target);
      if (!absTarget) return fail(id, "Target path escapes project root", target, file.name);
      const other = (index.get(target) ?? []).find((owner) => owner.id !== id && owner.file.sha256 !== file.sha256);
      if (other) return fail(id, `${target} is also claimed by package "${other.id}" with different contents.`, target, file.name);
      const disk = inspectDiskTarget(absTarget);
      if (disk.kind === "symlink") {
        return fail(id, `${target} is a symlink. Feather does not write package files through symlinks.`, target, file.name);
      }
      if (disk.kind === "other") return fail(id, `${target} exists and is not a regular file.`, target, file.name);
      if (disk.kind === "file" && disk.sha256 === file.sha256) {
        fileResults.push({ name: file.name, target: file.target, sha256: file.sha256, ok: true });
        continue;
      }
      if (disk.kind === "file") {
        if (!opts.force) {
          return fail(
            id,
            `${target} has local changes (locked sha256 ${file.sha256.slice(0, 12)}, found ${disk.sha256.slice(0, 12)}). ` +
              `Back up your edits, then re-run with --force to replace it with the locked version.`,
            target,
            file.name,
          );
        }
        warnings.push(`Replacing locally modified ${target} with the locked version.`);
      }
      items.push({ file, target, absTarget });
    }
    pending.set(id, items);
    results.set(id, fileResults);
  }

  if (dryRun) {
    return {
      ok: true,
      warnings,
      results: entries.map(([id]) => ({
        id,
        ok: true,
        files: [
          ...results.get(id)!,
          ...pending.get(id)!.map(({ file }) => ({ name: file.name, target: file.target, sha256: file.sha256, ok: true })),
        ],
      })),
    };
  }

  for (const [id, entry] of entries) {
    const items = pending.get(id)!;
    const fileResults = results.get(id)!;
    const report = (item: RestoreItem, error?: string) => {
      const result: InstallFileResult = {
        name: item.file.name,
        target: item.file.target,
        sha256: error ? "" : item.file.sha256,
        ok: !error,
        ...(error ? { error } : {}),
      };
      opts.onFileComplete?.(id, result);
      if (!error) fileResults.push(result);
    };

    const gitItems: RestoreItem[] = [];
    for (const item of items) {
      if (item.file.generated?.type === "require-alias") {
        opts.onFileStart?.(id, item.file.name);
        const content = Buffer.from(packageDependencyAliasContent(item.file.generated.require), "utf8");
        if (sha256Buffer(content) !== item.file.sha256) {
          report(item, "Generated alias checksum mismatch");
          return fail(id, "Generated alias checksum mismatch");
        }
        item.content = content;
        report(item);
        continue;
      }
      if ("repo" in entry.source && isGitTransport(entry.source)) {
        gitItems.push(item);
        continue;
      }
      opts.onFileStart?.(id, item.file.name);
      let url: string;
      try {
        url = lockfileFileUrl(entry, item.file);
      } catch (error) {
        report(item, (error as Error).message);
        return fail(id, (error as Error).message);
      }
      const result = await downloadVerified(url, item.file.sha256);
      if ("error" in result) {
        report(item, result.error);
        return fail(id, result.error);
      }
      item.content = result;
      report(item);
    }

    if (gitItems.length > 0 && "repo" in entry.source) {
      for (const item of gitItems) opts.onFileStart?.(id, item.file.name);
      const fetched = fetchGitPackageFiles(
        entry.source,
        gitItems.map((item) => ({ name: item.file.name, sha256: item.file.sha256 })),
      );
      if (!fetched.ok) return fail(id, fetched.error);
      for (const [indexInBatch, item] of gitItems.entries()) {
        item.content = fetched.files[indexInBatch]!.buffer;
        report(item);
      }
    }
  }

  const writes: TransactionWrite[] = [...pending.values()].flat().map((item) => ({
    target: item.target,
    absTarget: item.absTarget,
    content: item.content!,
  }));
  const commit = commitPackageTransaction({ projectDir, writes, hooks: opts.hooks });
  if (!commit.ok) return fail(packageIds[0] ?? "", commit.error);

  return {
    ok: true,
    warnings,
    results: entries.map(([id]) => ({ id, ok: true, files: results.get(id)! })),
  };
}

/** Single-entry convenience wrapper around `restorePackages`. */
export async function restorePackage(
  id: string,
  entry: LockfileEntry,
  opts: RestoreOptions,
): Promise<InstallResult> {
  const { onFileStart, onFileComplete, ...rest } = opts;
  const lockfile: Lockfile = { lockfileVersion: 1, generatedAt: new Date(0).toISOString(), packages: { [id]: entry } };
  const batch = await restorePackages([[id, entry]], lockfile, {
    ...rest,
    onFileStart: onFileStart ? (_id, name) => onFileStart(name) : undefined,
    onFileComplete: onFileComplete ? (_id, result) => onFileComplete(result) : undefined,
  });
  const result = batch.results[0] ?? { id, ok: false, files: [] };
  return batch.ok ? result : { ...result, ok: false, error: result.error ?? batch.error };
}
