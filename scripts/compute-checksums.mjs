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
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
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
