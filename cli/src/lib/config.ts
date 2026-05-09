import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface FeatherConfig {
  sessionName?: string;
  include?: string[];
  exclude?: string[];
  pluginOptions?: Record<string, Record<string, unknown>>;
  host?: string;
  port?: number;
  [key: string]: unknown;
}

// Minimal Lua table parser for simple `return { key = value, ... }` configs.
// Handles strings, numbers, booleans, and flat string arrays.
function parseLuaTable(src: string): Record<string, unknown> {
  // Strip the outer `return { ... }` wrapper
  const match = src.match(/return\s*\{([\s\S]*)\}/);
  if (!match) return {};

  const body = match[1];
  const result: Record<string, unknown> = {};

  // key = "string"
  for (const m of body.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) {
    result[m[1]] = m[2];
  }
  // key = 'string'
  for (const m of body.matchAll(/(\w+)\s*=\s*'([^']*)'/g)) {
    result[m[1]] = m[2];
  }
  // key = number
  for (const m of body.matchAll(/(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\b/g)) {
    result[m[1]] = Number(m[2]);
  }
  // key = true/false
  for (const m of body.matchAll(/(\w+)\s*=\s*(true|false)\b/g)) {
    result[m[1]] = m[2] === "true";
  }
  // key = { "a", "b", ... }  (string array)
  for (const m of body.matchAll(/(\w+)\s*=\s*\{([^}]*)\}/g)) {
    const items = [...m[2].matchAll(/"([^"]*)"/g)].map((i) => i[1]);
    if (items.length > 0) result[m[1]] = items;
  }

  return result;
}

export function loadConfig(gamePath: string, override?: string): FeatherConfig | null {
  const candidates = override
    ? [resolve(override)]
    : [
        join(gamePath, "feather.config.lua"),
        join(gamePath, ".featherrc.lua"),
      ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const src = readFileSync(path, "utf8");
      return parseLuaTable(src) as FeatherConfig;
    } catch (err) {
      throw new Error(`Failed to parse ${path}: ${(err as Error).message}`);
    }
  }

  return null;
}

export function configTemplate(): string {
  return `-- feather.config.lua
-- Optional per-project Feather configuration.
-- See https://github.com/Kyonru/feather for full reference.

return {
  sessionName = "My Game",

  -- Force-enable opt-in plugins (e.g. "console")
  -- include = { "console" },

  -- Remove plugins you don't need
  -- exclude = { "hump.signal", "lua-state-machine" },

  -- Per-plugin option overrides
  -- pluginOptions = {
  --   screenshots = { fps = 60 },
  -- },
}
`;
}
