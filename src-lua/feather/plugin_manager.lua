local Class = require(FEATHER_PATH .. ".lib.class")

--- @class FeatherPluginInstance
--- @field instance FeatherPlugin
--- @field identifier string
--- @field disabled boolean
--- @field errorCount number
--- @field capabilities string[]

---@class FeatherPluginManager
---@field plugins FeatherPluginInstance[]
local FeatherPluginManager = Class({})

local function normalizeApiCompatibility(api)
  if api == nil then
    return {}
  end
  if type(api) == "number" then
    return { api = api, minApi = api, maxApi = api }
  end
  if type(api) == "table" then
    local compatibility = {}
    for key, value in pairs(api) do
      compatibility[key] = value
    end
    if #api > 0 then
      compatibility.api = api
    end
    if type(compatibility.api) == "table" and #compatibility.api == 0 then
      compatibility.minApi = compatibility.minApi or compatibility.api.min
      compatibility.maxApi = compatibility.maxApi or compatibility.api.max
      compatibility.api = nil
    end
    return compatibility
  end
  return {}
end

local function isApiCompatible(compatibility, currentApi)
  if not compatibility then
    return true
  end

  local accepted = compatibility.api
  if type(accepted) == "number" then
    return currentApi == accepted
  end
  if type(accepted) == "table" and #accepted > 0 then
    for _, api in ipairs(accepted) do
      if currentApi == api then
        return true
      end
    end
    return false
  end

  if compatibility.minApi ~= nil and currentApi < compatibility.minApi then
    return false
  end
  if compatibility.maxApi ~= nil and currentApi > compatibility.maxApi then
    return false
  end

  return true
end

local function describeApiCompatibility(compatibility, currentApi)
  if not compatibility then
    return "Requires a different Feather plugin API. Desktop API is " .. tostring(currentApi) .. "."
  end
  if type(compatibility.api) == "number" then
    return "Requires Feather plugin API "
      .. tostring(compatibility.api)
      .. "; desktop API is "
      .. tostring(currentApi)
      .. "."
  end
  if type(compatibility.api) == "table" and #compatibility.api > 0 then
    return "Requires Feather plugin API "
      .. table.concat(compatibility.api, ", ")
      .. "; desktop API is "
      .. tostring(currentApi)
      .. "."
  end
  if compatibility.minApi ~= nil or compatibility.maxApi ~= nil then
    local min = compatibility.minApi ~= nil and tostring(compatibility.minApi) or "any"
    local max = compatibility.maxApi ~= nil and tostring(compatibility.maxApi) or "any"
    return "Requires Feather plugin API "
      .. min
      .. "-"
      .. max
      .. "; desktop API is "
      .. tostring(currentApi)
      .. "."
  end
  return "Requires a different Feather plugin API. Desktop API is " .. tostring(currentApi) .. "."
end

local function callbackReferences(callback, target)
  if type(callback) ~= "function" or type(target) ~= "function" then
    return false
  end
  if not debug or not debug.getupvalue then
    return false
  end

  local index = 1
  while true do
    local name, value = debug.getupvalue(callback, index)
    if not name then
      break
    end
    if value == target then
      return true
    end
    index = index + 1
  end

  return false
end

---@param feather Feather
---@param logger FeatherLogger
---@param observer FeatherObserver
function FeatherPluginManager:init(feather, logger, observer)
  self.plugins = {}
  self.logger = logger
  self.observer = observer
  self.feather = feather
  self._hookedCallbacks = nil

  if not feather.plugins then
    return
  end

  -- Build allowed-capabilities set (nil / "all" = unrestricted)
  local allowedPerms = feather.capabilities
  if type(allowedPerms) == "table" then
    local set = {}
    for _, p in ipairs(allowedPerms) do
      set[p] = true
    end
    allowedPerms = set
  end

  for i = 1, #feather.plugins do
    local plugin = feather.plugins[i]
    local compatibility = normalizeApiCompatibility(plugin.compatibility or plugin.api)
    compatibility.minApi = compatibility.minApi or plugin.minApi
    compatibility.maxApi = compatibility.maxApi or plugin.maxApi
    compatibility.currentApi = feather.version

    if not isApiCompatible(compatibility, feather.version) then
      local message = describeApiCompatibility(compatibility, feather.version)
      table.insert(self.plugins, {
        instance = nil,
        identifier = plugin.identifier,
        disabled = true,
        incompatible = true,
        incompatibilityReason = message,
        capabilities = plugin.capabilities or {},
        compatibility = compatibility,
        name = plugin.name,
        version = plugin.version,
      })
      self.logger:log({
        type = "error",
        str = "Plugin <" .. plugin.identifier .. "> is not compatible: " .. message,
      })
      goto continue
    end

    local ok, pluginInstance = xpcall(plugin.plugin, function(err)
      return type(err) == "string" and debug.traceback(err, 2) or debug.traceback(tostring(err), 2)
    end, {
      options = plugin.options,
      feather = feather,
      logger = logger,
      observer = observer,
      api = compatibility.api,
      minApi = compatibility.minApi,
      maxApi = compatibility.maxApi,
    })

    if ok then
      local supported = true
      if pluginInstance and pluginInstance.isSupported then
        supported = pluginInstance:isSupported(feather.version)
      end
      table.insert(self.plugins, {
        instance = pluginInstance,
        identifier = plugin.identifier,
        disabled = plugin.disabled or not supported or false,
        incompatible = not supported,
        incompatibilityReason = (not supported) and describeApiCompatibility(compatibility, feather.version) or nil,
        capabilities = plugin.capabilities or {},
        compatibility = compatibility,
        name = plugin.name,
        version = plugin.version,
      })

      if not supported then
        self.logger:log({
          type = "error",
          str = "Plugin <" .. plugin.identifier .. "> is not compatible: " .. describeApiCompatibility(compatibility, feather.version),
        })
      end

      -- Warn if a plugin requests a capability not in the user's allowlist
      if allowedPerms and allowedPerms ~= "all" then
        for _, perm in ipairs(plugin.capabilities or {}) do
          if not allowedPerms[perm] then
            self.logger:log({
              type = "error",
              str = "[Plugin "
                .. plugin.identifier
                .. "] requests capability '"
                .. perm
                .. "' which is not in the allowlist",
            })
          end
        end
      end
    else
      -- pluginInstance is the formatted error+traceback string from the xpcall handler
      self.logger:log({ type = "error", str = tostring(pluginInstance) })
    end
    ::continue::
  end
end

function FeatherPluginManager:update(dt, feather)
  for _, plugin in ipairs(self.plugins) do
    if plugin.instance and not plugin.disabled then
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
    if plugin.instance then
      pcall(plugin.instance.onerror, plugin.instance, msg, feather)
    end
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

--- Get plugins
--- @return FeatherPluginInstance[]
function FeatherPluginManager:getPlugins()
  return self.plugins
end

function FeatherPluginManager:handleRequest(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  if plugin and plugin.instance then
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

  if plugin and plugin.instance then
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

  if plugin and plugin.instance then
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
    if plugin.instance and not plugin.disabled then
      fakeRequest.path = "/plugins/" .. plugin.identifier

      local ok, data = pcall(plugin.instance.handleRequest, plugin.instance, fakeRequest, feather)
      if ok and data then
        pcall(feather.pushPlugin, feather, plugin.identifier, data)
      end
    end
  end
end

--- Patch love callbacks so all plugins receive events via their on* methods.
--- Safe to call repeatedly; if the game assigns love.draw after Feather starts,
--- this re-wraps the new callback without stacking duplicate wrappers.
function FeatherPluginManager:hookLoveCallbacks()
  if not love then
    return
  end

  local mgr = self

  local function dispatch(method, ...)
    for _, p in ipairs(mgr.plugins) do
      if p.instance and not p.disabled then
        pcall(p.instance[method], p.instance, ...)
      end
    end
  end

  self._loveCallbackOriginals = self._loveCallbackOriginals or {}
  self._loveCallbackWrappers = self._loveCallbackWrappers or {}

  local callbacks = {
    { name = "draw", method = "onDraw" },
    { name = "keypressed", method = "onKeypressed" },
    { name = "keyreleased", method = "onKeyreleased" },
    { name = "mousepressed", method = "onMousepressed" },
    { name = "mousereleased", method = "onMousereleased" },
    { name = "touchpressed", method = "onTouchpressed" },
    { name = "touchreleased", method = "onTouchreleased" },
    { name = "joystickpressed", method = "onJoystickpressed" },
    { name = "joystickreleased", method = "onJoystickreleased" },
  }

  for _, callback in ipairs(callbacks) do
    local name = callback.name
    local method = callback.method
    local wrapper = self._loveCallbackWrappers[name]

    if not wrapper then
      wrapper = function(...)
        local original = mgr._loveCallbackOriginals and mgr._loveCallbackOriginals[name]
        if original and original ~= wrapper then
          original(...)
        end
        dispatch(method, ...)
      end
      self._loveCallbackWrappers[name] = wrapper
    end

    local current = love[name]
    if current ~= wrapper and not callbackReferences(current, wrapper) then
      self._loveCallbackOriginals[name] = current
      love[name] = wrapper
    end
  end

  self._hookedCallbacks = self._loveCallbackOriginals
end

--- Restore all love callbacks patched by hookLoveCallbacks.
function FeatherPluginManager:unhookLoveCallbacks()
  if not self._loveCallbackOriginals then
    return
  end
  if not love then
    return
  end
  for name, original in pairs(self._loveCallbackOriginals) do
    if love[name] == self._loveCallbackWrappers[name] then
      love[name] = original
    end
  end
  self._hookedCallbacks = nil
  self._loveCallbackOriginals = nil
  self._loveCallbackWrappers = nil
end

function FeatherPluginManager:finish(feather)
  self:unhookLoveCallbacks()
  for _, plugin in ipairs(self.plugins) do
    if plugin.instance then
      pcall(plugin.instance.finish, plugin.instance, feather)
    end
  end
end

--- Create a plugin object to be used in the plugin manager
---@param plugin FeatherPlugin
---@param identifier string
---@param options table
---@param disabled? boolean   Start the plugin in disabled state (visible in UI but not running)
---@param capabilities? string[] Capabilities declared by this plugin (from its manifest)
---@param compatibility? table|number Feather plugin API compatibility metadata
function FeatherPluginManager.createPlugin(plugin, identifier, options, disabled, capabilities, compatibility)
  local normalizedCompatibility = normalizeApiCompatibility(compatibility)
  return {
    plugin = plugin,
    identifier = identifier,
    options = options,
    disabled = disabled or false,
    capabilities = capabilities or {},
    compatibility = normalizedCompatibility,
    api = normalizedCompatibility.api,
    minApi = normalizedCompatibility.minApi,
    maxApi = normalizedCompatibility.maxApi,
    name = normalizedCompatibility.name,
    version = normalizedCompatibility.version,
  }
end

function FeatherPluginManager:getConfig()
  local pluginsConfig = {}

  for _, plugin in ipairs(self.plugins) do
    local config
    if plugin.instance then
      config = plugin.instance:getConfig()
    else
      config = {
        type = "incompatible",
        tabName = plugin.name or plugin.identifier,
        icon = "plug-zap",
      }
    end
    config.disabled = plugin.disabled or false
    config.incompatible = plugin.incompatible or false
    config.incompatibilityReason = plugin.incompatibilityReason
    config.api = plugin.compatibility and plugin.compatibility.api or nil
    config.minApi = plugin.compatibility and plugin.compatibility.minApi or nil
    config.maxApi = plugin.compatibility and plugin.compatibility.maxApi or nil
    config.currentApi = plugin.compatibility and plugin.compatibility.currentApi or nil
    config.version = plugin.version or config.version
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

  if plugin and plugin.instance and plugin.instance.handleActionCancel then
    local status, data = pcall(plugin.instance.handleActionCancel, plugin.instance, request, feather)

    if not status then
      feather.featherLogger:logger("[FeatherPluginManager] Error handling action cancel: " .. data)
      return nil, data
    end
    return data
  end
end

--- Re-enable a disabled plugin (after error threshold or manual disable)
function FeatherPluginManager:enablePlugin(pluginId)
  for _, plugin in ipairs(self.plugins) do
    if plugin.identifier == pluginId then
      if plugin.incompatible then
        self.logger:logger("[FeatherPluginManager] Cannot enable incompatible plugin: " .. pluginId)
        return false
      end
      plugin.disabled = false
      plugin.errorCount = 0
      self.logger:logger("[FeatherPluginManager] Re-enabled plugin: " .. pluginId)
      return true
    end
  end
  return false
end

--- Disable a plugin so it stops consuming resources
function FeatherPluginManager:disablePlugin(pluginId)
  for _, plugin in ipairs(self.plugins) do
    if plugin.identifier == pluginId then
      plugin.disabled = true
      self.logger:logger("[FeatherPluginManager] Disabled plugin: " .. pluginId)
      return true
    end
  end
  return false
end

--- Disable all plugins so they stop consuming resources.
---@return number count Number of plugins newly disabled
function FeatherPluginManager:disableAllPlugins()
  local count = 0
  for _, plugin in ipairs(self.plugins) do
    if not plugin.disabled then
      plugin.disabled = true
      count = count + 1
      self.logger:logger("[FeatherPluginManager] Disabled plugin: " .. plugin.identifier)
    end
  end
  return count
end

--- Toggle a plugin's enabled/disabled state
---@param pluginId string
---@return boolean|nil enabled  New state, or nil if plugin not found
function FeatherPluginManager:togglePlugin(pluginId)
  for _, plugin in ipairs(self.plugins) do
    if plugin.identifier == pluginId then
      if plugin.incompatible then
        self.logger:logger("[FeatherPluginManager] Cannot enable incompatible plugin: " .. pluginId)
        return false
      end
      plugin.disabled = not plugin.disabled
      plugin.errorCount = 0
      self.logger:logger(
        "[FeatherPluginManager] " .. (plugin.disabled and "Disabled" or "Enabled") .. " plugin: " .. pluginId
      )
      return not plugin.disabled
    end
  end
  return nil
end

return FeatherPluginManager
