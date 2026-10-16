import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
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
  throw new Error('Missing Lua runtime. Run `pnpm --filter @kyonru/feather run bundle:lua` first.');
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

// Platform binaries are bundled only when asked for (`--binaries`, which
// `extension:package` passes after building them). Picking them up merely
// because `apps/cli/bin` exists let a months-old binary left over from an
// earlier package run shadow the CLI being developed, under a manifest that
// claimed the current platform.
const cliBinaries = ['feather', 'feather-darwin-x64', 'feather-linux-x64', 'feather-win-x64.exe'];
const wantBinaries = process.argv.includes('--binaries');

let bundleMode;
if (wantBinaries) {
  const cliEntryTime = statSync(join(repoRoot, 'apps', 'cli', 'dist', 'index.js')).mtimeMs;
  const problems = cliBinaries.flatMap((name) => {
    const path = join(cliBin, name);
    if (!existsSync(path)) return [`  ${name} is missing`];
    if (statSync(path).mtimeMs < cliEntryTime) return [`  ${name} is older than apps/cli/dist/index.js`];
    return [];
  });
  if (problems.length > 0) {
    throw new Error(
      `--binaries was requested but the CLI binaries are not a build of the current CLI:\n${problems.join('\n')}\n` +
        'Run `pnpm run extension:binary` first.',
    );
  }
  cpSync(cliBin, bundledBin, { recursive: true });
  bundleMode = 'platform binaries';
} else {
  // Local extension development does not require Bun-compiled binaries. The
  // extension detects this file and launches the compiled CLI with Node.
  //
  // The import is derived from where the CLI actually is, not written by hand:
  // a literal path silently pointed at the pre-v4 root `cli/` after the move to
  // `apps/cli`, and nothing ran the launcher to notice.
  const cliEntry = join(repoRoot, 'apps', 'cli', 'dist', 'index.js');
  if (!existsSync(cliEntry)) {
    throw new Error(`Missing ${cliEntry}. Run \`pnpm run cli:build\` first.`);
  }
  const cliImport = relative(bundledBin, cliEntry).split(sep).join('/');
  writeFileSync(
    join(bundledBin, 'feather-dev.mjs'),
    `#!/usr/bin/env node
import { runCli } from '${cliImport}';

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

// CLI policy the extension needs to *show* (the init picker preselects these)
// but must not keep its own copy of. Read from the CLI build so a change to the
// CLI's defaults reaches the extension without anyone editing it twice.
const { defaultIncludedPluginIds } = await import(join(repoRoot, 'apps', 'cli', 'dist', 'ui', 'init', 'model.js'));
if (!Array.isArray(defaultIncludedPluginIds)) {
  throw new Error('apps/cli/dist/ui/init/model.js no longer exports defaultIncludedPluginIds; update prepare.mjs.');
}
writeFileSync(
  join(bundledBin, 'cli-defaults.json'),
  `${JSON.stringify({ initPlugins: defaultIncludedPluginIds }, null, 2)}\n`,
);

// Recorded beside the binaries so the extension can report it at runtime, and
// so an unpacked VSIX says which platform it carries.
writeFileSync(
  join(bundledBin, 'platform.json'),
  `${JSON.stringify({ featherPlatform: declaredPlatform, cli: bundledCliVersion, runtime: bundledRuntimeVersion }, null, 2)}\n`,
);

console.log(
  `Prepared bundled-bin/ with ${bundleMode}, lua/, registry.json, plugin-catalog.json, cli-defaults.json, ` +
    `and platform.json (platform ${declaredPlatform}).`,
);
