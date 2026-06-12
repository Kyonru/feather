#!/usr/bin/env node
/**
 * One-shot: resolves each package's source.tag/branch to a commit SHA and
 * rewrites source.commitSha + source.baseUrl in packages/*.json, then
 * regenerates the registry.
 *
 * Skips packages that already have source.commitSha set.
 * Uses --force to re-resolve and overwrite even if commitSha is already present.
 *
 * Usage:
 *   node scripts/backfill-commit-shas.mjs
 *   node scripts/backfill-commit-shas.mjs --force
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');

const force = process.argv.includes('--force');
const GH_HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

function gitRepoUrl(repo) {
  if (/^(?:https?:\/\/|ssh:\/\/|git@)/i.test(repo)) return repo;
  if (repo.startsWith("/") || repo.startsWith("./") || repo.startsWith("../") || /^[A-Za-z]:[\\/]/.test(repo)) return repo;
  return `https://github.com/${repo}.git`;
}

async function resolveCommitSha(repo, ref, transport) {
  if (transport === 'git' || /^(?:https?:\/\/|ssh:\/\/|git@|\/|\.\/|\.\.\/)/i.test(repo)) {
    const result = spawnSync('git', ['ls-remote', gitRepoUrl(repo), ref, `refs/heads/${ref}`, `refs/tags/${ref}`, `refs/tags/${ref}^{}`], {
      encoding: 'utf8',
    });
    if (result.status !== 0 || result.error) {
      throw new Error(result.error?.message || result.stderr || result.stdout || `git ls-remote failed for ${repo}@${ref}`);
    }
    const sha = result.stdout.trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error(`Git ref ${ref} was not found for ${repo}`);
    return sha;
  }
  const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: GH_HEADERS });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${repo}@${ref}`);
  const data = await res.json();
  return data.sha;
}

const files = readdirSync(packagesDir).filter((f) => f.endsWith('.json')).sort();
let updated = 0;
let skipped = 0;
let failed = 0;

for (const file of files) {
  const id = file.replace(/\.json$/, '');
  const path = join(packagesDir, file);
  const pkg = JSON.parse(readFileSync(path, 'utf8'));

  if (!pkg.source?.repo || !pkg.source?.tag) {
    console.log(`  SKIP  ${id}: missing source.repo or source.tag`);
    skipped++;
    continue;
  }

  if (pkg.source.commitSha && !force) {
    console.log(`  SKIP  ${id}: already has commitSha ${pkg.source.commitSha.slice(0, 7)}`);
    skipped++;
    continue;
  }

  process.stdout.write(`  ...   ${id} (${pkg.source.repo}@${pkg.source.tag})`);
  try {
    const sha = await resolveCommitSha(pkg.source.repo, pkg.source.tag, pkg.source.transport);
    pkg.source.commitSha = sha;
    if (pkg.source.transport !== 'git') {
      pkg.source.baseUrl = `https://raw.githubusercontent.com/${pkg.source.repo}/${sha}/`;
    }
    writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    process.stdout.write(`  →  ${sha.slice(0, 7)}\n`);
    updated++;
  } catch (err) {
    process.stdout.write(`\n  FAIL  ${id}: ${err.message}\n`);
    failed++;
  }
}

console.log(`\n${updated} updated, ${skipped} skipped, ${failed} failed`);

if (updated > 0) {
  process.stdout.write('\nRegenerating registry… ');
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'generate-registry.mjs')], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error('FAILED\n' + result.stderr);
    process.exit(1);
  }
  console.log('done');
}
