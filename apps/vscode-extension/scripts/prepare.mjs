import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, '..');
const repoRoot = join(extensionRoot, '../..');

const cliBin = join(repoRoot, 'apps', 'cli', 'bin');
const cliLua = join(repoRoot, 'apps', 'cli', 'lua');
const sourceLua = join(repoRoot, 'packages/runtime-lua');
const cliGenerated = join(repoRoot, 'apps', 'cli', 'dist', 'generated');
const bundledBin = join(extensionRoot, 'bundled-bin');

const luaSource = existsSync(join(cliLua, 'feather', 'init.lua')) ? cliLua : sourceLua;
if (!existsSync(join(luaSource, 'feather', 'init.lua'))) {
  throw new Error('Missing Lua runtime. Run `npm run bundle:lua --workspace=cli` first.');
}

// The extension vendors a whole platform snapshot rather than calling the
// user's CLI, so it must record which one — and prove it. A VSIX whose manifest
// claims 4.0.0 while carrying a 4.1.0 runtime is worse than one that fails here,
// because the mismatch only shows up as strange behaviour in someone's editor.
const manifest = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8'));
const declaredPlatform = manifest.featherPlatform;
if (!declaredPlatform) {
  throw new Error('vscode-extension/package.json is missing "featherPlatform". It records which platform snapshot this VSIX vendors.');
}

const bundledCliVersion = JSON.parse(
  readFileSync(join(repoRoot, 'apps', 'cli', 'package.json'), 'utf8'),
).version;
const bundledRuntimeVersion = readFileSync(join(luaSource, 'feather', 'init.lua'), 'utf8')
  .match(/^local FEATHER_VERSION_NAME = "([^"]+)"/m)?.[1];

const mismatches = [
  ['CLI', bundledCliVersion],
  ['Lua runtime', bundledRuntimeVersion],
].filter(([, actual]) => actual !== declaredPlatform);

if (mismatches.length > 0) {
  const detail = mismatches.map(([what, actual]) => `  ${what} is ${actual ?? 'unknown'}`).join('\n');
  throw new Error(
    `vscode-extension declares featherPlatform ${declaredPlatform}, but the snapshot it would bundle does not match:\n` +
      `${detail}\n` +
      `Set featherPlatform to the platform version being vendored, or rebuild the CLI and runtime at that version.`,
  );
}

rmSync(bundledBin, { recursive: true, force: true });
mkdirSync(bundledBin, { recursive: true });

let bundleMode;
if (existsSync(cliBin)) {
  // Copy platform binaries for packaged extension builds.
  cpSync(cliBin, bundledBin, { recursive: true });
  bundleMode = 'platform binaries';
} else {
  // Local extension development does not require Bun-compiled binaries. The
  // extension detects this file and launches the compiled CLI with Node.
  writeFileSync(
    join(bundledBin, 'feather-dev.mjs'),
    `#!/usr/bin/env node
import { runCli } from '../../../cli/dist/index.js';

process.exitCode = await runCli();
`,
  );
  bundleMode = 'dev CLI launcher';
}

// Copy Lua runtime next to the binaries (bundledLuaRoot() checks process.execPath + '/lua')
cpSync(luaSource, join(bundledBin, 'lua'), { recursive: true });

// Copy registry.json for the packages catalog
cpSync(join(cliGenerated, 'registry.json'), join(bundledBin, 'registry.json'));

// Generate plugin-catalog.json from the ESM plugin-catalog.js
const { pluginCatalog } = await import(join(cliGenerated, 'plugin-catalog.js'));
writeFileSync(join(bundledBin, 'plugin-catalog.json'), JSON.stringify(pluginCatalog, null, 2) + '\n');

// eslint-disable-next-line no-undef
// Recorded beside the binaries so the extension can report it at runtime, and
// so an unpacked VSIX says which platform it carries.
writeFileSync(
  join(bundledBin, 'platform.json'),
  `${JSON.stringify({ featherPlatform: declaredPlatform, cli: bundledCliVersion, runtime: bundledRuntimeVersion }, null, 2)}\n`,
);

console.log(
  `Prepared bundled-bin/ with ${bundleMode}, lua/, registry.json, plugin-catalog.json, ` +
    `and platform.json (platform ${declaredPlatform}).`,
);
