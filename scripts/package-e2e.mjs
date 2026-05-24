#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Package loadability e2e.
 *
 * Installs every catalog package into a temp game directory, then runs
 * Love2D to verify each package can be required without error.
 *
 * Requirements: network access (downloads from GitHub), Love2D binary.
 * Set LOVE_BIN to override the Love2D binary path.
 * Set PACKAGE_E2E_TIMEOUT_MS to override the Love2D run timeout (default 60s).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(root, 'cli/dist/index.js');
// Use the dist registry so the script and the CLI binary are always in sync.
// Run `npm run cli:build` to update both after editing packages/*.json.
const registryPath = join(root, 'cli/dist/generated/registry.json');

// ── Prerequisites ─────────────────────────────────────────────────────────────

function findOnPath(name) {
  const r = spawnSync('which', [name], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function findLove() {
  if (process.env.LOVE_BIN && existsSync(process.env.LOVE_BIN)) return process.env.LOVE_BIN;
  if (process.platform === 'darwin' && existsSync('/Applications/love.app/Contents/MacOS/love')) {
    return '/Applications/love.app/Contents/MacOS/love';
  }
  return findOnPath('love') ?? findOnPath('love2d');
}

const love = findLove();
if (!love) {
  console.error('package-e2e: Love2D binary not found. Install love or set LOVE_BIN.');
  process.exit(1);
}

if (!existsSync(cliPath) || !existsSync(registryPath)) {
  console.error('package-e2e: CLI build not found. Run npm run cli:build first.');
  process.exit(1);
}

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const allPackages = registry.packages;

// Top-level packages to install (not subpackage aliases).
const installable = Object.entries(allPackages)
  .filter(([, pkg]) => !pkg.parent && pkg.install?.files?.length > 0)
  .map(([name]) => name);

// Which top-level packages are referenced as a parent by at least one alias.
const parentSet = new Set(
  Object.values(allPackages)
    .filter((pkg) => pkg.parent)
    .map((pkg) => pkg.parent),
);

// Collect the require paths to test:
// - All alias requires (e.g. hump.camera → lib.hump.camera): always testable once
//   the parent package is installed.
// - Top-level non-parent requires (e.g. anim8 → lib.anim8): direct single-file
//   packages, always testable.
// - Top-level parent requires (e.g. hump → lib.hump): only testable when the
//   require path maps to an installed file (direct .lua or /init.lua). Packages
//   like hump ship independent modules with no common init.lua, so their
//   top-level require is intentionally skipped here; the aliases cover them.
const requireTargets = Object.entries(allPackages)
  .filter(([name, pkg]) => {
    if (!pkg.require) return false;
    if (!pkg.parent && parentSet.has(name)) {
      const requirePath = pkg.require.replace(/\./g, '/');
      const files = (pkg.install?.files ?? []).map((f) => f.target);
      return files.some((f) => f === `${requirePath}.lua` || f === `${requirePath}/init.lua`);
    }
    return true;
  })
  .map(([name, pkg]) => ({ name, requirePath: pkg.require }))
  .sort((a, b) => a.name.localeCompare(b.name));

console.log(`package-e2e: ${installable.length} packages to install, ${requireTargets.length} require paths to test`);

// ── Game dir — local cache or fresh temp ─────────────────────────────────────
//
// Set FEATHER_PACKAGE_E2E_GAME_DIR to a stable directory to reuse installed
// packages across runs. Useful during catalog development: install once, then
// iterate on the load test without network round-trips.
//
//   FEATHER_PACKAGE_E2E_GAME_DIR=/tmp/pkg-e2e npm run test:packages:e2e
//
// Whether to skip install is determined by the local registry: if every file
// listed in the registry's install entries is already present in the game dir,
// the install step is skipped. Any missing file triggers a fresh install.

const envGameDir = process.env.FEATHER_PACKAGE_E2E_GAME_DIR?.trim();

let gameDir;
if (envGameDir) {
  gameDir = resolve(envGameDir);
  if (!existsSync(gameDir)) {
    mkdirSync(gameDir, { recursive: true });
  }
} else {
  gameDir = mkdtempSync(join(tmpdir(), 'feather-package-e2e-'));
}

console.log(`package-e2e: game dir ${gameDir}`);

writeFileSync(
  join(gameDir, 'conf.lua'),
  `function love.conf(t)
  t.window.width = 1
  t.window.height = 1
  t.window.title = "Feather Package E2E"
  t.console = false
end
`,
);

// ── Install all packages ──────────────────────────────────────────────────────

// Collect every install target declared in the local registry for the
// installable packages. If they are all present on disk the install is skipped.
const expectedFiles = installable.flatMap((name) => {
  const pkg = allPackages[name];
  return (pkg?.install?.files ?? []).map((f) => join(gameDir, f.target));
});

const missingFiles = expectedFiles.filter((f) => !existsSync(f));
const skipInstall = envGameDir && missingFiles.length === 0;

if (skipInstall) {
  console.log(`package-e2e: all ${expectedFiles.length} registry files present — skipping install`);
} else {
  if (envGameDir && missingFiles.length > 0) {
    console.log(`package-e2e: ${missingFiles.length} registry file(s) missing — installing`);
  }
  console.log(`package-e2e: installing ${installable.length} packages...`);
  const installResult = spawnSync(
    process.execPath,
    [cliPath, 'package', 'install', ...installable, '--dir', gameDir, '--yes', '--offline', '--allow-non-lua-files'],
    { encoding: 'utf8', timeout: 5 * 60 * 1000 },
  );

  process.stdout.write(installResult.stdout ?? '');
  process.stderr.write(installResult.stderr ?? '');

  if (installResult.status !== 0) {
    console.error('package-e2e: package install failed');
    process.exit(installResult.status ?? 1);
  }
}

// ── Generate main.lua ─────────────────────────────────────────────────────────

const packageRows = requireTargets
  .map(({ name, requirePath }) => `  { name = ${JSON.stringify(name)}, requirePath = ${JSON.stringify(requirePath)} },`)
  .join('\n');

const mainLua = `-- Generated by scripts/package-e2e.mjs
-- Tests that every catalog package can be required without error.

local packages = {
${packageRows}
}

-- Require a module and fail if it errors OR emits any output during load.
-- Well-behaved modules are silent on require; any print/io.write indicates
-- a load-time warning or internal error being swallowed.
local function tryimport(requirePath)
  local captured = {}

  local _print = print
  local _write = io.write

  print = function(...)
    local t = {}
    for i = 1, select('#', ...) do t[i] = tostring(select(i, ...)) end
    captured[#captured + 1] = table.concat(t, "\\t")
  end

  io.write = function(...)
    local t = {}
    for i = 1, select('#', ...) do t[i] = tostring(select(i, ...)) end
    captured[#captured + 1] = table.concat(t, "")
  end

  local ok, err = pcall(require, requirePath)

  print = _print
  io.write = _write

  if not ok then
    return false, tostring(err)
  end

  if #captured > 0 then
    local output = table.concat(captured, "")
    local lower = output:lower()
    if lower:find("error") or lower:find("failed") or lower:find("not found") or lower:find("could not") then
      return false, "load-time error output:\\n" .. output
    end
  end

  return true, nil
end

local function run()
  local passed = 0
  local failed = 0
  local failures = {}

  for _, pkg in ipairs(packages) do
    local ok, err = tryimport(pkg.requirePath)
    if ok then
      passed = passed + 1
      io.write("\\27[32m[Package E2E] PASS\\27[0m " .. pkg.name .. "\\n")
    else
      failed = failed + 1
      failures[#failures + 1] = { name = pkg.name, err = tostring(err) }
      io.write("\\27[31m[Package E2E] FAIL\\27[0m " .. pkg.name .. ": " .. tostring(err) .. "\\n")
    end
    io.flush()
  end

  io.write("\\n")

  if #failures > 0 then
    io.write("\\27[31m[Package E2E] SUMMARY: " .. #failures .. " failed\\27[0m, " .. passed .. " passed\\n")
    for _, f in ipairs(failures) do
      io.write("  \\27[31m✖\\27[0m " .. f.name .. ": " .. f.err .. "\\n")
    end
    love.event.quit(1)
  else
    io.write("\\27[32m[Package E2E] PACKAGE_E2E_PASS " .. passed .. " packages loaded successfully\\27[0m\\n")
    love.event.quit(0)
  end
end

function love.load()
  local ok, err = xpcall(run, debug.traceback)
  if not ok then
    io.write("[Package E2E] ERROR: " .. tostring(err) .. "\\n")
    io.flush()
    love.event.quit(1)
  end
end
`;

writeFileSync(join(gameDir, 'main.lua'), mainLua);

// ── Run Love2D ────────────────────────────────────────────────────────────────

console.log('package-e2e: running Love2D...');
const timeoutMs = Number.parseInt(process.env.PACKAGE_E2E_TIMEOUT_MS ?? '60000', 10);

let loveCmd = love;
let loveArgs = [gameDir];

if (process.platform === 'linux' && !process.env.DISPLAY) {
  const xvfb = findOnPath('xvfb-run');
  if (xvfb) {
    loveCmd = xvfb;
    loveArgs = ['-a', love, gameDir];
  }
}

const loveResult = spawnSync(loveCmd, loveArgs, {
  cwd: root,
  encoding: 'utf8',
  timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
});

const output = `${loveResult.stdout ?? ''}${loveResult.stderr ?? ''}`;
process.stdout.write(output);

if (loveResult.error) {
  console.error(`package-e2e: ${loveResult.error.message}`);
  process.exit(1);
}

if (loveResult.status !== 0 || !output.includes('PACKAGE_E2E_PASS')) {
  console.error('package-e2e: PASS marker not found in output.');
  process.exit(loveResult.status ?? 1);
}

console.log('package-e2e: passed');
