#!/usr/bin/env node
/**
 * Dev helper: fetch files and compute SHA-256 checksums.
 *
 * Usage:
 *   node scripts/compute-checksums.mjs <url> [url2] ...
 *   node scripts/compute-checksums.mjs --package <packages/anim8.json>
 *   node scripts/compute-checksums.mjs --all
 *
 * Output is JSON, one entry per file:
 *   { "url": "...", "sha256": "...", "size": 1234 }
 *
 * Use this to compute checksums before adding new packages to packages/*.json.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(__dirname, "../packages");

async function sha256FromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) return { url, error: `HTTP ${res.status}` };
  const buf = await res.arrayBuffer();
  const hash = createHash("sha256").update(Buffer.from(buf)).digest("hex");
  return { url, sha256: hash, size: buf.byteLength };
}

async function checkPackageFile(filePath) {
  const pkg = JSON.parse(readFileSync(filePath, "utf8"));
  if (pkg.source?.transport === "git") return checkGitPackageFile(pkg);
  const baseUrl = pkg.source?.baseUrl;
  if (!baseUrl) return [];

  const results = [];
  for (const file of pkg.install?.files ?? []) {
    const url = baseUrl + file.name;
    const result = await sha256FromUrl(url);
    result.name = file.name;
    result.expected = file.sha256;
    result.match = result.sha256 === file.sha256;
    results.push(result);
  }
  return results;
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

function safeInside(root, path) {
  const absolute = resolve(root, path);
  return absolute === root || absolute.startsWith(`${root}/`) ? absolute : null;
}

function checkGitPackageFile(pkg) {
  const tempDir = mkdtempSync(join(tmpdir(), "feather-package-checksum-git-"));
  try {
    runGit(["init", "--quiet"], tempDir);
    runGit(["remote", "add", "origin", gitRepoUrl(pkg.source.repo)], tempDir);
    runGit(["fetch", "--depth=1", "--filter=blob:none", "origin", pkg.source.commitSha ?? pkg.source.tag], tempDir);
    runGit(["checkout", "--quiet", "--detach", "FETCH_HEAD"], tempDir);
    const commitSha = runGit(["rev-parse", "HEAD"], tempDir);
    if (pkg.source.commitSha && commitSha.toLowerCase() !== pkg.source.commitSha.toLowerCase()) {
      throw new Error(`expected ${pkg.source.commitSha}, got ${commitSha}`);
    }

    return (pkg.install?.files ?? []).map((file) => {
      const path = safeInside(tempDir, file.name);
      if (!path) return { name: file.name, error: "file escapes checkout" };
      const buf = readFileSync(path);
      const sha256 = createHash("sha256").update(buf).digest("hex");
      return {
        name: file.name,
        sha256,
        size: buf.byteLength,
        expected: file.sha256,
        match: sha256 === file.sha256,
      };
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/compute-checksums.mjs <url> [url2] ...");
  console.error("       node scripts/compute-checksums.mjs --package <path>");
  console.error("       node scripts/compute-checksums.mjs --all");
  process.exit(1);
}

if (args[0] === "--all") {
  const files = readdirSync(packagesDir).filter((f) => f.endsWith(".json"));
  let anyMismatch = false;
  for (const file of files) {
    const results = await checkPackageFile(join(packagesDir, file));
    console.log(`\n${file}:`);
    for (const r of results) {
      if (r.error) {
        console.log(`  ERROR  ${r.name}: ${r.error}`);
        anyMismatch = true;
      } else if (r.match) {
        console.log(`  OK     ${r.name}  ${r.sha256}`);
      } else {
        console.log(`  FAIL   ${r.name}`);
        console.log(`         expected: ${r.expected ?? "(none)"}`);
        console.log(`         got:      ${r.sha256}`);
        anyMismatch = true;
      }
    }
  }
  process.exit(anyMismatch ? 1 : 0);
} else if (args[0] === "--package") {
  const results = await checkPackageFile(args[1]);
  results.forEach((r) => console.log(JSON.stringify(r, null, 2)));
} else {
  const results = await Promise.all(args.map(sha256FromUrl));
  results.forEach((r) => console.log(JSON.stringify(r, null, 2)));
}
