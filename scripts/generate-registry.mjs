#!/usr/bin/env node
/**
 * Compose cli/src/generated/registry.json from packages/*.json.
 *
 * Usage:
 *   node scripts/generate-registry.mjs
 *
 * Run this before publishing a new CLI release or when adding/updating packages.
 * The Husky pre-commit hook runs this automatically.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(__dirname, "../packages");
const outputPath = join(__dirname, "../cli/src/generated/registry.json");

const packageFiles = readdirSync(packagesDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

const packages = {};
let warnings = 0;

for (const file of packageFiles) {
  const id = basename(file, ".json");
  const pkg = JSON.parse(readFileSync(join(packagesDir, file), "utf8"));

  // Validate required fields
  if (!pkg.trust) {
    console.warn(`  WARN  ${id}: missing "trust" field`);
    warnings++;
  }
  if (!pkg.source?.baseUrl) {
    console.warn(`  WARN  ${id}: missing source.baseUrl`);
    warnings++;
  }

  // Warn about missing or placeholder checksums
  for (const f of pkg.install?.files ?? []) {
    if (!f.sha256 || f.sha256 === "TODO") {
      console.warn(`  WARN  ${id}/${f.name}: missing sha256 — run scripts/compute-checksums.mjs --all`);
      warnings++;
    }
  }

  // Register subpackages as top-level aliases pointing to parent
  if (pkg.subpackages) {
    for (const [subId, sub] of Object.entries(pkg.subpackages)) {
      packages[subId] = {
        parent: id,
        type: pkg.type,
        trust: pkg.trust,
        description: sub.description ?? `${id} — ${subId.split(".").pop()} module`,
        tags: pkg.tags ?? [],
        homepage: pkg.homepage,
        license: pkg.license,
        source: pkg.source,
        install: {
          files: (pkg.install?.files ?? []).filter((f) =>
            sub.files.includes(f.name)
          ),
        },
        require: sub.require,
        example: sub.example ?? `local ${subId.split(".").pop()} = require('${sub.require}')`,
      };
    }
  }

  packages[id] = {
    type: pkg.type,
    trust: pkg.trust,
    description: pkg.description,
    tags: pkg.tags ?? [],
    homepage: pkg.homepage,
    license: pkg.license,
    source: pkg.source,
    install: pkg.install,
    subpackages: pkg.subpackages ? Object.keys(pkg.subpackages) : undefined,
    require: pkg.require,
    example: pkg.example,
  };
}

const registry = {
  version: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  packages,
};

writeFileSync(outputPath, JSON.stringify(registry, null, 2) + "\n");
console.log(`Generated registry with ${packageFiles.length} packages (${Object.keys(packages).length} entries including subpackages).`);
if (warnings > 0) {
  console.warn(`${warnings} warning(s) — see above.`);
  process.exit(1);
}
