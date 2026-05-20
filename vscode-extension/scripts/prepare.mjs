import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, '..');
const repoRoot = join(extensionRoot, '..');

const cliBin = join(repoRoot, 'cli', 'bin');
const cliLua = join(repoRoot, 'cli', 'lua');
const sourceLua = join(repoRoot, 'src-lua');
const cliGenerated = join(repoRoot, 'cli', 'dist', 'generated');
const bundledBin = join(extensionRoot, 'bundled-bin');

const luaSource = existsSync(join(cliLua, 'feather', 'init.lua')) ? cliLua : sourceLua;
if (!existsSync(join(luaSource, 'feather', 'init.lua'))) {
  throw new Error('Missing Lua runtime. Run `npm run bundle:lua --workspace=cli` first.');
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
import { runCli } from '../../cli/dist/index.js';

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
console.log(`Prepared bundled-bin/ with ${bundleMode}, lua/, registry.json, and plugin-catalog.json`);
