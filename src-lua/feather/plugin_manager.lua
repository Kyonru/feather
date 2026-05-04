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
    if not plugin.disabled then
      local ok, err = pcall(plugin.instance.update, plugin.instance, dt, feather)
      if not ok then
        plugin.errorCount = (plugin.errorCount or 0) + 1
        self.logger:log({
          type = "error",
          str = "[Plugin " .. plugin.identifier .. "] update error (" .. plugin.errorCount .. "): " .. tostring(err),
        })
        -- Disable plugin after 10 consecutive errors to prevent spam
        if plugin.errorCount >= 10 then
          plugin.disabled = true
          self.logger:log({
            type = "error",
            str = "[Plugin " .. plugin.identifier .. "] disabled after 10 consecutive errors",
          })
        end
      else
        plugin.errorCount = 0
      end
    end
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

--- Look up a registered plugin by its identifier string.
---@param identifier string
---@return FeatherPluginInstance|nil
function FeatherPluginManager:getPlugin(identifier)
  for _, plugin in ipairs(self.plugins) do
    if plugin.identifier == identifier then
      return plugin
    end
  end
end

function FeatherPluginManager:handleRequest(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  if plugin then
    local status, data = pcall(plugin.instance.handleRequest, plugin.instance, request, feather)

    if not status then
      feather.featherLogger:logger("[FeatherPluginManager] Error handling request: " .. data)
      return
    end
    return data
  end
end

function FeatherPluginManager:handleActionRequest(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  if plugin then
    feather.featherLogger:logger("[FeatherPluginManager] Received action request: " .. request.path)

    local status, data = pcall(plugin.instance.handleActionRequest, plugin.instance, request, feather)

    if not status then
      feather.featherLogger:logger("[FeatherPluginManager] Error handling action request: " .. data)
      return nil, data
    end
    return data
  end

  return nil, "Plugin not found: " .. (request.path or "?")
end

function FeatherPluginManager:handleParamsUpdate(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  feather.featherLogger:logger("[FeatherPluginManager] Received params update: " .. request.path)

  if plugin then
    local status, data = pcall(plugin.instance.handleParamsUpdate, plugin.instance, request, feather)

    if not status then
      feather.featherLogger:logger("[FeatherPluginManager] Error handling params update: " .. data)
      return
    end
    return data
  end
end

--- Push current data for every plugin to the desktop over WS.
--- Called at the throttled updateInterval cadence from Feather:update().
function FeatherPluginManager:pushAll(feather)
  local fakeRequest = { method = "GET", params = {}, headers = {} }

  for _, plugin in ipairs(self.plugins) do
    if not plugin.disabled then
      fakeRequest.path = "/plugins/" .. plugin.identifier

      local ok, data = pcall(plugin.instance.handleRequest, plugin.instance, fakeRequest, feather)
      if ok and data then
        pcall(feather.pushPlugin, feather, plugin.identifier, data)
      end
    end
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

  self.logger:logger("[FeatherPluginManager] Action: " .. plugin .. ":" .. action)
  return self:handleActionRequest(request, feather)
end

--- Cancel an in-flight action on a plugin
function FeatherPluginManager:handleActionCancel(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  if plugin and plugin.instance.handleActionCancel then
    local status, data = pcall(plugin.instance.handleActionCancel, plugin.instance, request, feather)

    if not status then
      feather.featherLogger:logger("[FeatherPluginManager] Error handling action cancel: " .. data)
      return nil, data
    end
    return data
  end
end

--- Re-enable a disabled plugin (after error threshold)
function FeatherPluginManager:enablePlugin(pluginId)
  for _, plugin in ipairs(self.plugins) do
    if plugin.identifier == pluginId then
      plugin.disabled = false
      plugin.errorCount = 0
      self.logger:logger("[FeatherPluginManager] Re-enabled plugin: " .. pluginId)
      return true
    end
  end
  return false
end

return FeatherPluginManager
