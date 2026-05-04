--- Feather Auto — zero-config setup for Feather debugger.
---
--- Usage (one line in main.lua):
---   require("feather.auto")
---
--- Or with options:
---   require("feather.auto").setup({ sessionName = "My Game", host = "192.168.1.50" })
---
--- This creates a global DEBUGGER with all built-in plugins registered.
--- Call DEBUGGER:update(dt) in love.update().

local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")

-- Built-in plugins (safe-require each so missing ones don't break everything)
local function tryRequire(mod)
  local ok, result = pcall(require, mod)
  if ok then
    return result
  end
  return nil
end

local ScreenshotPlugin = tryRequire("plugins.screenshots")
local ConsolePlugin = tryRequire("plugins.console")
local ProfilerPlugin = tryRequire("plugins.profiler")
local BookmarkPlugin = tryRequire("plugins.bookmark")
local MemorySnapshotPlugin = tryRequire("plugins.memory-snapshot")
local NetworkInspectorPlugin = tryRequire("plugins.network-inspector")
local InputReplayPlugin = tryRequire("plugins.input-replay")
local EntityInspectorPlugin = tryRequire("plugins.entity-inspector")
local ConfigTweakerPlugin = tryRequire("plugins.config-tweaker")
local PhysicsDebugPlugin = tryRequire("plugins.physics-debug")
local ParticleEditorPlugin = tryRequire("plugins.particle-editor")

local auto = {}

--- Default plugin set. Each entry: { module, id, defaultOptions, optIn }
--- Plugins with optIn = true are excluded unless explicitly listed in config.include.
local DEFAULT_PLUGINS = {
  { mod = ScreenshotPlugin, id = "screenshots", opts = {} },
  { mod = ConsolePlugin, id = "console", opts = { evalEnabled = true }, optIn = true },
  { mod = ProfilerPlugin, id = "profiler", opts = {} },
  { mod = BookmarkPlugin, id = "bookmark", opts = {} },
  { mod = MemorySnapshotPlugin, id = "memory-snapshot", opts = {} },
  { mod = NetworkInspectorPlugin, id = "network-inspector", opts = {} },
  { mod = InputReplayPlugin, id = "input-replay", opts = {} },
  { mod = EntityInspectorPlugin, id = "entity-inspector", opts = { sources = {} } },
  { mod = ConfigTweakerPlugin, id = "config-tweaker", opts = { fields = {} } },
  { mod = PhysicsDebugPlugin, id = "physics-debug", opts = {} },
  { mod = ParticleEditorPlugin, id = "particle-editor", opts = {} },
}

--- Set up Feather with all built-in plugins.
---@param config table|nil  Optional Feather config overrides (host, port, sessionName, etc.)
---@return Feather
function auto.setup(config)
  config = config or {}

  -- Build plugin list from defaults, skip any that failed to load
  local plugins = {}
  local exclude = {}
  if config.exclude then
    for _, id in ipairs(config.exclude) do
      exclude[id] = true
    end
    config.exclude = nil
  end

  -- Opt-in plugins require explicit inclusion
  local include = {}
  if config.include then
    for _, id in ipairs(config.include) do
      include[id] = true
    end
    config.include = nil
  end

  -- Allow user to pass extra plugin options per ID
  local pluginOptions = config.pluginOptions or {}
  config.pluginOptions = nil

  for _, entry in ipairs(DEFAULT_PLUGINS) do
    if entry.mod and not exclude[entry.id] then
      -- Skip opt-in plugins unless explicitly included
      if entry.optIn and not include[entry.id] then
        goto continue
      end
      local opts = entry.opts
      if pluginOptions[entry.id] then
        -- Merge user options over defaults
        opts = {}
        for k, v in pairs(entry.opts) do
          opts[k] = v
        end
        for k, v in pairs(pluginOptions[entry.id]) do
          opts[k] = v
        end
      end
      plugins[#plugins + 1] = FeatherPluginManager.createPlugin(entry.mod, entry.id, opts)
    end
    ::continue::
  end

  -- Append any extra user plugins
  if config.plugins then
    for _, p in ipairs(config.plugins) do
      plugins[#plugins + 1] = p
    end
  end

  -- Merge into final config
  local finalConfig = {
    debug = true,
    wrapPrint = true,
    autoRegisterErrorHandler = true,
  }
  for k, v in pairs(config) do
    finalConfig[k] = v
  end
  finalConfig.plugins = plugins

  DEBUGGER = FeatherDebugger(finalConfig)

  return DEBUGGER
end

-- Auto-setup on require if DEBUGGER doesn't exist yet
if not DEBUGGER then
  auto.setup()
end

return auto
