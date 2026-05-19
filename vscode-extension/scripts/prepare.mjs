import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, '..');
const repoRoot = join(extensionRoot, '..');

const cliBin = join(repoRoot, 'cli', 'bin');
const cliLua = join(repoRoot, 'cli', 'lua');
const cliGenerated = join(repoRoot, 'cli', 'dist', 'generated');
const bundledBin = join(extensionRoot, 'bundled-bin');

if (!existsSync(cliBin)) {
  throw new Error('Missing cli/bin/. Run `npm run build:binary --workspace=cli` first.');
}

if (!existsSync(join(cliLua, 'feather', 'init.lua'))) {
  throw new Error('Missing cli/lua/feather/init.lua. Run `npm run bundle:lua --workspace=cli` first.');
}

rmSync(bundledBin, { recursive: true, force: true });

// Copy platform binaries
cpSync(cliBin, bundledBin, { recursive: true });

// Copy Lua runtime next to the binaries (bundledLuaRoot() checks process.execPath + '/lua')
cpSync(cliLua, join(bundledBin, 'lua'), { recursive: true });

// Copy registry.json for the packages catalog
cpSync(join(cliGenerated, 'registry.json'), join(bundledBin, 'registry.json'));

// Generate plugin-catalog.json from the ESM plugin-catalog.js
const { pluginCatalog } = await import(join(cliGenerated, 'plugin-catalog.js'));
writeFileSync(
  join(bundledBin, 'plugin-catalog.json'),
  JSON.stringify(pluginCatalog, null, 2) + '\n',
);

console.log('Prepared bundled-bin/ with platform binaries, lua/, registry.json, and plugin-catalog.json');
