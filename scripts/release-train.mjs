#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, "..");
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

const TRAIN_ALIASES = new Map([
  ["cli", "cli"],
  ["runtime", "runtime"],
  ["desktop", "desktop"],
  ["inspector", "desktop"],
  ["ext", "ext"],
  ["extension", "ext"],
  ["studio", "studio"],
  ["platform", "platform"],
]);

const TAG_PREFIXES = {
  cli: "cli-v",
  runtime: "runtime-v",
  desktop: "desktop-v",
  ext: "ext-v",
  studio: "studio-v",
  platform: "v",
};

function usage() {
  return `Usage: node scripts/release-train.mjs <train> [options]

Trains: cli, runtime, desktop (or inspector), ext (or extension), studio, platform

Options:
  --version <semver>  Require this version instead of deriving it from the train
  --remote <name>     Push to this Git remote (default: origin)
  --push              Create and push the exact release tag
  --dry-run           Validate and print the plan without changing Git (default)
  --json              Print the plan as JSON
  --help              Show this help

Examples:
  pnpm run release:cli
  pnpm run release:desktop -- --push
  pnpm run release:studio -- --version 0.2.0 --push
  pnpm run release:platform -- --version 4.1.0 --push`;
}

export function canonicalTrain(value) {
  return TRAIN_ALIASES.get(value) ?? null;
}

export function tagFor(train, version) {
  const prefix = TAG_PREFIXES[train];
  if (!prefix) throw new Error(`Unknown release train: ${train}`);
  if (!SEMVER.test(version)) throw new Error(`Invalid semver version: ${version}`);
  return `${prefix}${version}`;
}

export function parseArgs(argv) {
  const options = {
    train: null,
    version: null,
    remote: "origin",
    push: false,
    explicitDryRun: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--push") options.push = true;
    else if (value === "--dry-run") options.explicitDryRun = true;
    else if (value === "--json") options.json = true;
    else if (value === "--version" || value === "--remote") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${value} requires a value.`);
      options[value.slice(2)] = next;
      index += 1;
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else if (options.train) {
      throw new Error(`Unexpected argument: ${value}`);
    } else {
      options.train = value;
    }
  }

  if (options.push && options.explicitDryRun) {
    throw new Error("Choose either --push or --dry-run, not both.");
  }
  return options;
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function readCargoVersion(root, relativePath) {
  const source = readFileSync(resolve(root, relativePath), "utf8");
  const match = source.match(/^version = "([^"]+)"/m);
  if (!match) throw new Error(`Could not read package version from ${relativePath}.`);
  return match[1];
}

function readRuntimeVersion(root) {
  const path = "packages/runtime-lua/feather/init.lua";
  const source = readFileSync(resolve(root, path), "utf8");
  const match = source.match(/^local FEATHER_VERSION_NAME = "([^"]+)"/m);
  if (!match) throw new Error(`Could not read runtime version from ${path}.`);
  return match[1];
}

export function trainVersions(root, train) {
  const desktop = () => ({
    "package.json": readJson(root, "package.json").version,
    "apps/inspector/src-tauri/Cargo.toml": readCargoVersion(
      root,
      "apps/inspector/src-tauri/Cargo.toml",
    ),
    "apps/inspector/src-tauri/tauri.conf.json": readJson(
      root,
      "apps/inspector/src-tauri/tauri.conf.json",
    ).version,
  });

  switch (train) {
    case "cli":
      return { "apps/cli/package.json": readJson(root, "apps/cli/package.json").version };
    case "runtime":
      return { "packages/runtime-lua/feather/init.lua": readRuntimeVersion(root) };
    case "desktop":
      return desktop();
    case "ext":
      return {
        "apps/vscode-extension/package.json": readJson(
          root,
          "apps/vscode-extension/package.json",
        ).version,
      };
    case "studio":
      return {
        "apps/studio/package.json": readJson(root, "apps/studio/package.json").version,
        "apps/studio/src-tauri/Cargo.toml": readCargoVersion(
          root,
          "apps/studio/src-tauri/Cargo.toml",
        ),
        "apps/studio/src-tauri/tauri.conf.json": readJson(
          root,
          "apps/studio/src-tauri/tauri.conf.json",
        ).version,
      };
    case "platform": {
      const extension = readJson(root, "apps/vscode-extension/package.json");
      return {
        ...desktop(),
        "apps/cli/package.json": readJson(root, "apps/cli/package.json").version,
        "packages/runtime-lua/feather/init.lua": readRuntimeVersion(root),
        "apps/vscode-extension/package.json#featherPlatform": extension.featherPlatform,
      };
    }
    default:
      throw new Error(`Unknown release train: ${train}`);
  }
}

export function validateTrainVersions(train, versions, requestedVersion = null) {
  const entries = Object.entries(versions);
  if (entries.length === 0) throw new Error(`No version sources declared for ${train}.`);
  const version = requestedVersion ?? entries[0][1];
  if (!SEMVER.test(version ?? "")) throw new Error(`Invalid semver version: ${version}`);

  const mismatches = entries.filter(([, actual]) => actual !== version);
  if (mismatches.length > 0) {
    const detail = mismatches.map(([file, actual]) => `${file} is ${actual ?? "unset"}`).join("; ");
    throw new Error(
      `${train} is not ready for ${version}: ${detail}. Fix with: bash scripts/set-version.sh ${train} ${version}`,
    );
  }
  return version;
}

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || "git failed").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

function assertClean(root) {
  const status = git(root, ["status", "--porcelain", "--untracked-files=normal"]).stdout.trim();
  if (status) {
    throw new Error("Release tags require a clean worktree. Commit or stash the listed changes first.");
  }
}

function localTagCommit(root, tag) {
  const exists = git(root, ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], {
    allowFailure: true,
  });
  if (exists.status === 1) return null;
  if (exists.status !== 0) throw new Error(`Could not inspect local tag ${tag}.`);
  return git(root, ["rev-parse", `${tag}^{}`]).stdout.trim();
}

function assertRemoteTagMissing(root, remote, tag) {
  const result = git(
    root,
    ["ls-remote", "--exit-code", "--tags", remote, `refs/tags/${tag}`],
    { allowFailure: true },
  );
  if (result.status === 0) throw new Error(`Remote tag ${remote}/${tag} already exists.`);
  if (result.status !== 2) {
    throw new Error(`Could not check ${remote} for ${tag}: ${(result.stderr || result.stdout).trim()}`);
  }
}

export function resolveReleasePlan(root, requestedTrain, requestedVersion = null) {
  const train = canonicalTrain(requestedTrain);
  if (!train) {
    throw new Error(
      `Unknown release train: ${requestedTrain}. Expected cli, runtime, desktop, ext, studio, or platform.`,
    );
  }
  const versions = trainVersions(root, train);
  const version = validateTrainVersions(train, versions, requestedVersion);
  return { train, version, tag: tagFor(train, version), versions };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.train) throw new Error(`Missing release train.\n\n${usage()}`);

  const root = DEFAULT_ROOT;
  assertClean(root);
  const plan = resolveReleasePlan(root, options.train, options.version);
  const commit = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(root, ["branch", "--show-current"]).stdout.trim() || "(detached HEAD)";
  const existingLocalCommit = localTagCommit(root, plan.tag);
  if (existingLocalCommit && existingLocalCommit !== commit) {
    throw new Error(`Local tag ${plan.tag} points to ${existingLocalCommit}, not HEAD ${commit}.`);
  }
  assertRemoteTagMissing(root, options.remote, plan.tag);

  const result = {
    ...plan,
    branch,
    commit,
    remote: options.remote,
    mode: options.push ? "push" : "dry-run",
    localTag: existingLocalCommit ? "reuse" : "create",
  };

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`[feather] ${options.push ? "Releasing" : "Release dry run"}`);
    console.log(`  train:   ${plan.train}`);
    console.log(`  version: ${plan.version}`);
    console.log(`  tag:     ${plan.tag}`);
    console.log(`  commit:  ${commit} (${branch})`);
    console.log(`  remote:  ${options.remote}`);
    for (const [file, version] of Object.entries(plan.versions)) {
      console.log(`  ${file}: ${version}`);
    }
  }

  if (!options.push) {
    if (!options.json) {
      console.log(`[feather] No changes made. Re-run with --push to create and push ${plan.tag}.`);
    }
    return;
  }

  if (!existingLocalCommit) git(root, ["tag", "--no-sign", plan.tag, commit]);
  git(root, ["push", options.remote, `refs/tags/${plan.tag}`]);
  if (!options.json) {
    console.log(`[feather] Pushed ${plan.tag}. Monitor: https://github.com/Kyonru/feather/actions`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[feather] ${error.message}`);
    process.exitCode = 1;
  });
}
