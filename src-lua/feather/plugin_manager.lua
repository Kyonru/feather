local PATH = string.sub(..., 1, string.len(...) - string.len("plugin_manager"))

local Class = require(PATH .. ".lib.class")

--- @class FeatherPluginInstance
--- @field instance FeatherPlugin
--- @field identifier string

---@class FeatherPluginManager
---@field plugins FeatherPluginInstance[]
local FeatherPluginManager = Class({})

---@param feather Feather
---@param logger FeatherLogger
---@param observer FeatherObserver
function FeatherPluginManager:init(feather, logger, observer)
  self.plugins = {}
  self.logger = logger
  self.observer = observer

  if not feather.plugins then
    return
  end

  for i = 1, #feather.plugins do
    local plugin = feather.plugins[i]

    local ok, pluginInstance = pcall(plugin.plugin, {
      options = plugin.options,
      feather = feather,
      logger = logger,
      observer = observer,
    })

    if ok then
      table.insert(self.plugins, {
        instance = pluginInstance,
        identifier = plugin.identifier,
      })
    else
      self.logger:log({ type = "error", str = debug.traceback(pluginInstance) })
    end
  end
end

function FeatherPluginManager:update(dt, feather)
  for _, plugin in ipairs(self.plugins) do
    pcall(plugin.instance.update, plugin.instance, dt, feather)
  end
end

function FeatherPluginManager:onerror(msg, feather)
  for _, plugin in ipairs(self.plugins) do
    pcall(plugin.instance.onerror, plugin.instance, msg, feather)
  end
end

function FeatherPluginManager:handleRequest(request, feather)
  for _, plugin in ipairs(self.plugins) do
    pcall(plugin.instance.handleRequest, plugin.instance, request, feather)
  end
end

function FeatherPluginManager:finish(feather)
  for _, plugin in ipairs(self.plugins) do
    pcall(plugin.instance.finish, plugin.instance, feather)
  end
end

--- Create a plugin object to be used in the plugin manager
---@param plugin FeatherPlugin
---@param identifier string
---@param options table
function FeatherPluginManager.createPlugin(plugin, identifier, options)
  return {
    plugin = plugin,
    identifier = identifier,
    options = options,
  }
end

function FeatherPluginManager:getConfig()
  local pluginsConfig = {}

  for _, plugin in ipairs(self.plugins) do
    local config = plugin.instance:getConfig()

    pluginsConfig[plugin.identifier] = config
  end

  return pluginsConfig
end

return FeatherPluginManager
