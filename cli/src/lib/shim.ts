import { mkdtempSync, writeFileSync, rmSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Path to the bundled Lua library shipped with this CLI package
const BUNDLED_LUA = resolve(__dirname, '../../lua');

export interface ShimOptions {
  gamePath: string;
  sessionName?: string;
  noPlugins?: boolean;
  featherOverride?: string;
  pluginsOverride?: string;
  userConfig?: Record<string, unknown>;
}

export interface Shim {
  dir: string;
  cleanup: () => void;
}

function featherRoot(override?: string): string {
  if (override) return resolve(override);
  return join(BUNDLED_LUA, 'feather');
}

function pluginsRoot(featherDir: string, override?: string): string {
  if (override) return join(resolve(override), '..', 'plugins');
  const localPlugins = join(featherDir, '..', 'plugins');
  if (existsSync(localPlugins)) return resolve(localPlugins);
  return join(BUNDLED_LUA, 'plugins');
}

/** Read plugin IDs from a plugins directory by checking for manifest.lua in each subdir. */
function scanPluginIds(pluginsDir: string): string[] {
  if (!existsSync(pluginsDir)) return [];
  try {
    return readdirSync(pluginsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(pluginsDir, e.name, 'manifest.lua')))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function serializeLuaConfig(cfg: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (typeof v === 'string') lines.push(`  ${k} = ${JSON.stringify(v)},`);
    else if (typeof v === 'number' || typeof v === 'boolean') lines.push(`  ${k} = ${v},`);
    else if (Array.isArray(v)) {
      const items = v.map((i) => (typeof i === 'string' ? JSON.stringify(i) : String(i)));
      lines.push(`  ${k} = { ${items.join(', ')} },`);
    }
  }
  return lines.join('\n');
}

function buildMainLua(opts: ShimOptions, pluginsDir?: string): string {
  const sessionName = opts.sessionName ?? '';
  const configLines = opts.userConfig ? serializeLuaConfig(opts.userConfig) : '';

  const pluginIds = !opts.noPlugins && pluginsDir ? scanPluginIds(pluginsDir) : [];
  const pluginListLine = pluginIds.length > 0
    ? `FEATHER_PLUGIN_LIST = { ${pluginIds.map((id) => JSON.stringify(id)).join(', ')} }`
    : '';
  // Add the plugins parent dir to package.path so require("plugins.X") resolves
  // via the OS filesystem (no PhysFS / symlink dependency).
  const packagePathLine = pluginsDir && pluginIds.length > 0
    ? `package.path = package.path .. ";${dirname(pluginsDir).replace(/\\/g, '/')}/?.lua;${dirname(pluginsDir).replace(/\\/g, '/')}/?/init.lua"`
    : '';

  return `-- Feather CLI injector — generated, do not edit
-- Game files are symlinked into this directory so love.filesystem works as normal.
-- We only override main.lua and conf.lua; everything else is the game's own files.

${packagePathLine}
${pluginListLine}
FEATHER_PATH = "feather"
FEATHER_PLUGIN_PATH = ""
${opts.noPlugins ? 'FEATHER_SKIP_PLUGINS = true' : ''}
require("feather.auto").setup({
  debug = true,
  wrapPrint = true,
  sessionName = os.getenv("FEATHER_SESSION_NAME") or ${JSON.stringify(sessionName)},
${configLines}
})

-- Load the game's main.lua via absolute OS path to avoid shadowing by this file
local gamePath = os.getenv("FEATHER_GAME_PATH")
if gamePath then
  local chunk, err = loadfile(gamePath .. "/main.lua")
  if not chunk then
    error("[feather] Could not load game: " .. (err or "unknown"))
  end
  chunk()
end
`;
}

function buildConfLua(): string {
  return `-- Feather CLI injector — delegate window/module config to the real game
local gamePath = os.getenv("FEATHER_GAME_PATH")
if gamePath then
  local chunk = loadfile(gamePath .. "/conf.lua")
  if chunk then chunk() end
end
`;
}

// Files the shim itself provides — never symlink the game's version of these
const SHIM_OWNED = new Set(['main.lua', 'conf.lua', 'feather', 'plugins']);

export function createShim(opts: ShimOptions): Shim {
  const absGame = resolve(opts.gamePath);
  const dir = mkdtempSync(join(tmpdir(), 'feather-'));

  // Resolve plugins directory early so buildMainLua can embed the ID list and
  // package.path addition (bypasses PhysFS symlink dependency in auto.lua).
  const resolvedPluginsDir = opts.noPlugins
    ? undefined
    : existsSync(join(dir, 'plugins'))
      ? undefined
      : (() => {
          const p = opts.pluginsOverride
            ? resolve(opts.pluginsOverride)
            : pluginsRoot(featherRoot(opts.featherOverride), opts.featherOverride);
          return existsSync(p) ? p : undefined;
        })();

  // 1. Write shim entry points
  writeFileSync(join(dir, 'main.lua'), buildMainLua(opts, resolvedPluginsDir));
  writeFileSync(join(dir, 'conf.lua'), buildConfLua());

  // 2. Symlink every file/dir from the game into the shim root, except shim-owned names.
  //    This gives love.filesystem full access to game assets without any mount() call.
  for (const entry of readdirSync(absGame, { withFileTypes: true })) {
    if (SHIM_OWNED.has(entry.name)) continue;
    symlinkSync(join(absGame, entry.name), join(dir, entry.name), entry.isDirectory() ? 'dir' : 'file');
  }

  // 3. Add feather library — prefer game-local install (already symlinked above if present)
  if (!existsSync(join(dir, 'feather'))) {
    symlinkSync(featherRoot(opts.featherOverride), join(dir, 'feather'), 'dir');
  }

  // 4. Add plugins directory symlink — still created for love.filesystem access to
  //    plugin assets (images, audio); FEATHER_PLUGIN_LIST handles discovery instead.
  if (resolvedPluginsDir && !existsSync(join(dir, 'plugins'))) {
    symlinkSync(resolvedPluginsDir, join(dir, 'plugins'), 'dir');
  }

  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

export function shimEnv(gamePath: string, sessionName?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FEATHER_GAME_PATH: resolve(gamePath),
    ...(sessionName ? { FEATHER_SESSION_NAME: sessionName } : {}),
  };
}
