--- Feather Auto — zero-config setup for Feather debugger.
---
--- Usage (one line in main.lua):
---   require("feather.auto")
---
--- Or with options:
---   require("feather.auto").setup({ sessionName = "My Game", host = "192.168.1.50" })
---
--- This creates a global DEBUGGER with all built-in plugins registered.
--- Plugins marked as disabled start inactive but appear in the UI for toggling.
--- Use config.include to force-enable specific plugins, config.exclude to remove them entirely.
--- Call DEBUGGER:update(dt) in love.update().

local PATH = string.sub(..., 1, string.len(...) - string.len("auto"))

local FeatherDebugger = require(PATH .. "init")
local FeatherPluginManager = require(PATH .. "plugin_manager")

local function tryRequire(mod)
  local ok, result = pcall(require, mod)
  if ok then
    return result
  end
  return nil
end

FEATHER_PLUGIN_PATH = FEATHER_PLUGIN_PATH or PATH

-- Convert a Lua module path (dot-separated) to a filesystem path (slash-separated).
-- "feather." -> "feather"  |  "feather.plugins" -> "feather/plugins"
local function toFsPath(modulePath)
  return modulePath:gsub("%.$", ""):gsub("%.", "/")
end

--- Load a manifest.lua from a filesystem path.
---@param fsPath string  Absolute-ish path understood by love.filesystem
---@return table|nil
local function loadManifest(fsPath)
  if not love or not love.filesystem then
    return nil
  end
  local chunk, _ = love.filesystem.load(fsPath)
  if not chunk then
    return nil
  end
  local ok, result = pcall(chunk)
  if ok and type(result) == "table" then
    return result
  end
  return nil
end

--- Scan the plugins directory and build an entry list from manifest.lua files.
--- Falls back to an empty table if the filesystem is unavailable.
---@return table[]
local function scanPlugins()
  local fsDir = toFsPath(FEATHER_PLUGIN_PATH .. "plugins")
  local pluginModPath = FEATHER_PLUGIN_PATH .. "plugins."
  local entries = {}

  if not love or not love.filesystem then
    return entries
  end
  local items = love.filesystem.getDirectoryItems(fsDir)
  if not items then
    return entries
  end

  for _, dirName in ipairs(items) do
    local manifest = loadManifest(fsDir .. "/" .. dirName .. "/manifest.lua")
    if manifest and manifest.id then
      local mod = tryRequire(pluginModPath .. manifest.id)
      entries[#entries + 1] = {
        mod = mod,
        id = manifest.id,
        opts = manifest.opts or {},
        optIn = manifest.optIn or false,
        disabled = manifest.disabled ~= false,
        permissions = manifest.permissions or {},
      }
    end
  end

  return entries
end

local auto = {}

--- @class AutoConfig: FeatherConfig
--- @field debug boolean|nil Enable debug mode (default: true)
--- @field include string[]|nil List of plugin IDs to force-include (register and enable even if optIn or disabled)
--- @field exclude string[]|nil List of plugin IDs to exclude entirely (not registered at all)
--- @field pluginOptions table<string, table>|nil Optional per-plugin options, keyed by plugin ID

--- Set up Feather with all built-in plugins.
---@param config AutoConfig|nil  Optional AutoConfig overrides (host, port, sessionName, etc.)
---@return Feather
function auto.setup(config)
  config = config or {}

  local exclude = {}
  if config.exclude then
    for _, id in ipairs(config.exclude) do
      exclude[id] = true
    end
    config.exclude = nil
  end

  local include = {}
  if config.include then
    for _, id in ipairs(config.include) do
      include[id] = true
    end
    config.include = nil
  end

  local pluginOptions = config.pluginOptions or {}
  config.pluginOptions = nil

  local plugins = {}
  for _, entry in ipairs(scanPlugins()) do
    if entry.mod and not exclude[entry.id] then
      if entry.optIn and not include[entry.id] then
        goto continue
      end
      local opts = entry.opts
      if pluginOptions[entry.id] then
        opts = {}
        for k, v in pairs(entry.opts) do
          opts[k] = v
        end
        for k, v in pairs(pluginOptions[entry.id]) do
          opts[k] = v
        end
      end
      local disabled = entry.disabled and not include[entry.id]
      plugins[#plugins + 1] = FeatherPluginManager.createPlugin(entry.mod, entry.id, opts, disabled, entry.permissions)
    end
    ::continue::
  end

  -- Append any extra user plugins
  if config.plugins then
    for _, p in ipairs(config.plugins) do
      plugins[#plugins + 1] = p
    end
  end

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

if not DEBUGGER then
  auto.setup()
end

return auto
