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

      if not pluginInstance:isSupported(feather.version) then
        self.logger:log({
          type = "error",
          str = "Plugin <" .. plugin.identifier .. "> is not supported by the current version of Feather",
        })
      end
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

function FeatherPluginManager:getPluginByUrl(url)
  for _, plugin in ipairs(self.plugins) do
    if url == "/plugins/" .. plugin.identifier then
      return plugin
    end
  end
end

function FeatherPluginManager:handleRequest(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  if plugin then
    local status, data = pcall(plugin.instance.handleRequest, plugin.instance, request, feather)

    if not status then
      feather.featherLogger.logger("[FeatherPluginManager] Error handling request: " .. data)
      return
    end
    return data
  end
end

function FeatherPluginManager:handleActionRequest(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  feather.featherLogger.logger("[FeatherPluginManager] Received action request: " .. request.path)

  if plugin then
    local status, data = pcall(plugin.instance.handleActionRequest, plugin.instance, request, feather)

    if not status then
      feather.featherLogger.logger("[FeatherPluginManager] Error handling action request: " .. data)
      return
    end
    return data
  end
end

function FeatherPluginManager:handleParamsUpdate(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  feather.featherLogger.logger("[FeatherPluginManager] Received params update: " .. request.path)

  if plugin then
    local status, data = pcall(plugin.instance.handleParamsUpdate, plugin.instance, request, feather)

    if not status then
      feather.featherLogger.logger("[FeatherPluginManager] Error handling params update: " .. data)
      return
    end
    return data
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

function FeatherPluginManager:action(plugin, action, params, feather)
  local request = {
    params = {},
    path = "/plugins/" .. plugin,
    method = "CUSTOM",
  }

  for key, value in pairs(params) do
    request.params[key] = value
  end

  request.params["action"] = action

  self.logger.logger("[FeatherPluginManager] Action: " .. plugin .. ":" .. action)
  self:handleActionRequest(request, feather)
end

return FeatherPluginManager
