#!/usr/bin/env node
/**
 * One-shot: discovers common upstream license files for packages/*.json and
 * writes install.licenses entries with SHA-256 checksums.
 *
 * Usage:
 *   node scripts/backfill-license-files.mjs --dry-run
 *   node scripts/backfill-license-files.mjs
 *   node scripts/backfill-license-files.mjs --force
 *   node scripts/backfill-license-files.mjs --package packages/anim8.json
 *   node scripts/backfill-license-files.mjs --package packages/anim8.json --license MIT-LICENSE.txt
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const packagesDir = join(root, "packages");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const packageIndex = args.indexOf("--package");
const packagePath = packageIndex >= 0 ? args[packageIndex + 1] : undefined;
const licenseIndex = args.indexOf("--license");
const explicitLicenseName = licenseIndex >= 0 ? args[licenseIndex + 1] : undefined;

const LICENSE_CANDIDATES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "COPYING.txt",
  "COPYRIGHT",
  "COPYRIGHT.md",
  "UNLICENSE",
];

function usage() {
  console.log("Usage: node scripts/backfill-license-files.mjs [--dry-run] [--force] [--package packages/anim8.json] [--license LICENSE-PATH]");
}

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

if (packageIndex >= 0 && !packagePath) {
  console.error("--package requires a package JSON path.");
  process.exit(1);
}

if (licenseIndex >= 0 && !explicitLicenseName) {
  console.error("--license requires an upstream license file path.");
  process.exit(1);
}

if (explicitLicenseName && !packagePath) {
  console.error("--license requires --package so the override applies to exactly one catalog entry.");
  process.exit(1);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function gitRepoUrl(repo) {
  if (/^(?:https?:\/\/|ssh:\/\/|git@)/i.test(repo)) return repo;
  if (repo.startsWith("/") || repo.startsWith("./") || repo.startsWith("../") || /^[A-Za-z]:[\\/]/.test(repo)) return repo;
  return `https://github.com/${repo}.git`;
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function safeInside(rootDir, path) {
  const absolute = resolve(rootDir, path);
  return absolute === rootDir || absolute.startsWith(`${rootDir}/`) ? absolute : null;
}

async function fetchRawLicense(pkg, name) {
  const baseUrl = pkg.source?.baseUrl;
  if (!baseUrl) return null;
  const url = baseUrl + name;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { name, sha256: sha256(buffer), size: buffer.byteLength };
}

function checkoutGitSource(pkg, callback) {
  const tempDir = mkdtempSync(join(tmpdir(), "feather-package-license-git-"));
  try {
    runGit(["init", "--quiet"], tempDir);
    runGit(["remote", "add", "origin", gitRepoUrl(pkg.source.repo)], tempDir);
    runGit(["fetch", "--depth=1", "--filter=blob:none", "origin", pkg.source.commitSha ?? pkg.source.tag], tempDir);
    runGit(["checkout", "--quiet", "--detach", "FETCH_HEAD"], tempDir);
    const commitSha = runGit(["rev-parse", "HEAD"], tempDir);
    if (pkg.source.commitSha && commitSha.toLowerCase() !== pkg.source.commitSha.toLowerCase()) {
      throw new Error(`expected ${pkg.source.commitSha}, got ${commitSha}`);
    }

    return callback(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readGitLicenseFile(tempDir, name) {
  const path = safeInside(tempDir, name);
  if (!path) return null;
  try {
    const buffer = readFileSync(path);
    return { name, sha256: sha256(buffer), size: buffer.byteLength };
  } catch {
    return null;
  }
}

function findGitLicense(pkg) {
  return checkoutGitSource(pkg, (tempDir) => {
    for (const name of LICENSE_CANDIDATES) {
      const result = readGitLicenseFile(tempDir, name);
      if (result) return result;
    }
    return null;
  });
}

async function findRawLicense(pkg) {
  for (const name of LICENSE_CANDIDATES) {
    const result = await fetchRawLicense(pkg, name);
    if (result) return result;
  }
  return null;
}

async function fetchExplicitLicense(pkg, name) {
  if (pkg.source.transport === "git") {
    return checkoutGitSource(pkg, (tempDir) => readGitLicenseFile(tempDir, name));
  }
  return fetchRawLicense(pkg, name);
}

async function discoverLicense(pkg) {
  if (!pkg.source?.repo || !pkg.source?.tag) return null;
  if (explicitLicenseName) return fetchExplicitLicense(pkg, explicitLicenseName);
  if (pkg.source.transport === "git") return findGitLicense(pkg);
  return findRawLicense(pkg);
}

function packageFiles() {
  if (packagePath) return [resolve(packagePath)];
  return readdirSync(packagesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => join(packagesDir, file));
}

let updated = 0;
let skipped = 0;
let missing = 0;
let failed = 0;

for (const path of packageFiles()) {
  const id = path.split("/").pop().replace(/\.json$/, "");
  const pkg = JSON.parse(readFileSync(path, "utf8"));

  if (pkg.install?.licenses?.length && !force && !explicitLicenseName) {
    console.log(`  SKIP  ${id}: already has install.licenses`);
    skipped++;
    continue;
  }

  process.stdout.write(`  ...   ${id}`);
  try {
    const license = await discoverLicense(pkg);
    if (!license) {
      process.stdout.write("  →  no license file found\n");
      missing++;
      continue;
    }

    process.stdout.write(`  →  ${license.name} ${license.sha256.slice(0, 12)} (${license.size} bytes)\n`);
    if (!dryRun) {
      pkg.install = pkg.install ?? {};
      pkg.install.licenses = [{ name: license.name, sha256: license.sha256 }];
      writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      updated++;
    } else {
      skipped++;
    }
  } catch (err) {
    process.stdout.write(`\n  FAIL  ${id}: ${err.message}\n`);
    failed++;
  }
}

console.log(`\n${updated} updated, ${skipped} skipped, ${missing} missing, ${failed} failed`);

if (updated > 0) {
  process.stdout.write("\nRegenerating registry… ");
  const result = spawnSync(process.execPath, [join(root, "scripts", "generate-registry.mjs")], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error("FAILED\n" + result.stderr);
    process.exit(1);
  }
  console.log("done");
}

if (failed > 0) process.exit(1);
