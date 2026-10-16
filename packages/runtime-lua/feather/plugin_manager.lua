local Class = require(FEATHER_PATH .. ".lib.class")
local BasePlugin = require(FEATHER_PATH .. ".core.base")
local Policy = require(FEATHER_PATH .. ".plugin_policy")
local Health = require(FEATHER_PATH .. ".plugin_health")
local Scheduler = require(FEATHER_PATH .. ".plugin_scheduler")
local Actions = require(FEATHER_PATH .. ".plugin_actions")

--- The plugin manager is a facade over four policies, each in its own module:
---
---   plugin_policy     manifest validation, API compatibility, capability grants
---   plugin_health     one structured health record per plugin
---   plugin_scheduler  update/push gating, forced refresh, payload envelope
---   plugin_actions    action routing, requestId correlation, cancellation
---
--- What stays here is lifecycle: registration, activation, LÖVE callback
--- wiring, enable/disable, and the plugin list sent to the desktop.
---
--- Activation is decided once, before any plugin code runs:
---
---   manifest valid AND module callable AND API compatible
---   AND every required capability granted     -> otherwise `blocked`
---   AND enabled (manifest default, include, or toggled on) -> otherwise `disabled`
---
--- A blocked plugin is never instantiated: no init, update, callbacks, payload
--- builds or actions, and it cannot be enabled. A disabled plugin is not
--- instantiated by Feather either; it starts when it is enabled. Game code that
--- integrates with a plugin through `getPlugin(id).instance` still gets the
--- instance (it is created on that first access), but update, callbacks,
--- payloads and actions stay off until the plugin is enabled.

--- @class FeatherPluginInstance
--- @field instance FeatherPlugin|nil
--- @field identifier string
--- @field disabled boolean
--- @field blocked boolean
--- @field inactiveReason table|nil
--- @field errorCount number
--- @field capabilities string[]
--- @field callbackDisposers function[]|nil

---@class FeatherPluginManager
---@field plugins FeatherPluginInstance[]
local FeatherPluginManager = Class({})

local LOVE_CALLBACKS = {
  { name = "draw", method = "onDraw" },
  { name = "keypressed", method = "onKeypressed" },
  { name = "keyreleased", method = "onKeyreleased" },
  { name = "mousepressed", method = "onMousepressed" },
  { name = "mousereleased", method = "onMousereleased" },
  { name = "mousemoved", method = "onMousemoved" },
  { name = "touchpressed", method = "onTouchpressed" },
  { name = "touchreleased", method = "onTouchreleased" },
  { name = "touchmoved", method = "onTouchmoved" },
  { name = "joystickpressed", method = "onJoystickpressed" },
  { name = "joystickreleased", method = "onJoystickreleased" },
  { name = "joystickhat", method = "onJoystickhat" },
  { name = "joystickaxis", method = "onJoystickaxis" },
  { name = "gamepadpressed", method = "onGamepadpressed" },
  { name = "gamepadreleased", method = "onGamepadreleased" },
  { name = "gamepadaxis", method = "onGamepadaxis" },
}

local function isCallable(value)
  if type(value) == "function" then
    return true
  end
  local meta = type(value) == "table" and getmetatable(value) or nil
  return type(meta) == "table" and type(meta.__call) == "function"
end

local function hasPluginCallback(instance, method)
  if not instance or type(method) ~= "string" then
    return false
  end
  local callback = instance[method]
  return type(callback) == "function" and callback ~= BasePlugin[method]
end

local function callbackTraceback(err)
  return debug.traceback(tostring(err), 2)
end

local function instanceOf(record)
  return rawget(record, "instance")
end

-- ── Registration ───────────────────────────────────────────────────────────

---@param feather Feather
---@param logger FeatherLogger
---@param observer FeatherObserver
function FeatherPluginManager:init(feather, logger, observer)
  self.plugins = {}
  self.logger = logger
  self.observer = observer
  self.feather = feather
  self.callbackBus = feather.callbackBus
  self._hookedCallbacks = nil
  self._grants = Policy.grantSet(feather.capabilities)
  self._refreshQueue = {}
  self._inflight = {}

  if not feather.plugins then
    return
  end

  for i = 1, #feather.plugins do
    local plugin = feather.plugins[i]
    if plugin.identifier == "profiler" then
      feather._legacyProfilerPluginWarning = true
      self.logger:log({
        type = "warn",
        str = "[Profiler] The profiler plugin was removed. Use DEBUGGER.profiler and the Performance > Profiler tab instead.",
      })
    else
      self:_register(plugin)
    end
  end
end

function FeatherPluginManager:_log(level, message)
  if self.logger and self.logger.log then
    self.logger:log({ type = level, str = message })
  end
end

function FeatherPluginManager:_register(plugin)
  local compatibility = Policy.normalizeApiCompatibility(plugin.compatibility or plugin.api)
  compatibility.minApi = compatibility.minApi or plugin.minApi
  compatibility.maxApi = compatibility.maxApi or plugin.maxApi
  compatibility.currentApi = self.feather.version

  local manifest = Policy.readManifest(plugin)
  local manifestExtra = type(plugin.manifest) == "table" and plugin.manifest or {}
  local record = {
    identifier = plugin.identifier,
    name = plugin.name,
    version = plugin.version,
    description = manifestExtra.description,
    factory = plugin.plugin,
    options = plugin.options,
    disabled = plugin.disabled or false,
    blocked = false,
    incompatible = false,
    incompatibilityReason = nil,
    inactiveReason = nil,
    capabilities = manifest.capabilities,
    optionalCapabilities = manifest.optionalCapabilities,
    compatibility = compatibility,
    runtime = manifest.runtime,
    runtimeDeclared = manifest.runtimeDeclared,
    actions = manifest.actions,
    manifestErrors = manifest.errors,
    manifestWarnings = manifest.warnings,
    errorCount = 0,
    health = Health.new(),
    callbackDisposers = {},
  }
  -- `record.instance` is created on first access for permitted plugins (see
  -- the note at the top of this file). Internal code reads it with rawget.
  local manager = self
  setmetatable(record, {
    __index = function(target, key)
      if key == "instance" then
        return manager:_materialize(target)
      end
      return nil
    end,
  })
  table.insert(self.plugins, record)

  for _, warning in ipairs(record.manifestWarnings) do
    self:_log("warn", "[Plugin " .. tostring(record.identifier) .. "] " .. warning)
  end

  local blocking = Policy.blockingReason(record, self._grants, self.feather.version, isCallable)
  if blocking then
    self:_block(record, blocking)
    return record
  end

  if record.disabled then
    record.inactiveReason = Policy.disabledReason(record)
  else
    self:_materialize(record)
  end
  return record
end

function FeatherPluginManager:_block(record, reason)
  record.blocked = true
  record.disabled = true
  record.inactiveReason = reason
  if reason.code == "incompatible-api" then
    record.incompatible = true
    record.incompatibilityReason = reason.message
  end
  self:disposePluginCallbacks(record)
  self:_log(
    reason.code == "capability-denied" and "warn" or "error",
    "Plugin <" .. tostring(record.identifier) .. "> will not run: " .. reason.message .. " " .. reason.remediation
  )
end

--- Run the plugin's constructor (init) if it is permitted and not yet created.
function FeatherPluginManager:_materialize(record)
  local existing = instanceOf(record)
  if existing or record.blocked then
    return existing
  end

  local feather = self.feather
  local granted = Policy.grantedCapabilities(record, self._grants)
  local ok, instance = xpcall(record.factory, function(err)
    return type(err) == "string" and debug.traceback(err, 2) or debug.traceback(tostring(err), 2)
  end, {
    options = record.options,
    feather = feather,
    logger = self.logger,
    observer = self.observer,
    callbacks = self:createCallbackRegistrar(record),
    grantedCapabilities = granted,
    api = record.compatibility.api,
    minApi = record.compatibility.minApi,
    maxApi = record.compatibility.maxApi,
  })

  if not ok or instance == nil then
    Health.recordFailure(record.health, "init", instance)
    self:_block(record, Policy.initFailedReason(ok and "constructor returned nothing" or instance))
    return nil
  end

  rawset(record, "instance", instance)

  local supported = true
  if type(instance) == "table" and type(instance.isSupported) == "function" then
    local supportedOk, result = pcall(instance.isSupported, instance, feather.version)
    supported = supportedOk and result ~= false
  end
  if not supported then
    self:_block(record, {
      code = "incompatible-api",
      message = Policy.describeApiCompatibility(record.compatibility, feather.version),
      remediation = "Update this plugin or use a matching Feather runtime and desktop version.",
    })
    return instance
  end

  self:registerPluginCallbacks(record)
  return instance
end

-- ── Health ─────────────────────────────────────────────────────────────────

function FeatherPluginManager:_recordSuccess(record, phase)
  Health.recordSuccess(record.health, phase)
  if phase == "update" then
    record.errorCount = 0
  end
end

--- Record a failure in any phase. Ten consecutive failures in one phase switch
--- the plugin off, as update() errors always have.
function FeatherPluginManager:_recordFailure(record, phase, err, feather)
  local count = Health.recordFailure(record.health, phase, err)
  if phase == "update" or phase == "suspendedUpdate" then
    record.errorCount = count
  end
  self:_log(
    "error",
    "[Plugin " .. tostring(record.identifier) .. "] " .. phase .. " error (" .. count .. "): " .. tostring(err)
  )
  if count >= Health.FAILURE_THRESHOLD and not record.disabled then
    record.disabled = true
    record.inactiveReason = Policy.erroredReason(phase, count, record.health.lastError.message)
    record.health.disabledReason = record.inactiveReason.message
    self:_log(
      "error",
      "[Plugin " .. tostring(record.identifier) .. "] disabled after " .. count .. " consecutive errors"
    )
    Actions.abandon(self, record, feather or self.feather, "Plugin was disabled after repeated errors.")
    self:_announceStatusChange(feather or self.feather)
  end
  return count
end

--- Tell the desktop a plugin's status changed on its own (not by command).
function FeatherPluginManager:_announceStatusChange(feather)
  if feather and feather.wsConnected and feather.__connState == "connected" and feather.__sendHello then
    pcall(feather.__sendHello, feather)
  end
end

-- ── LÖVE callbacks ─────────────────────────────────────────────────────────

function FeatherPluginManager:_handleOriginalCallbackError(name, err)
  local message = "[FeatherPluginManager] love." .. name .. " original callback error: " .. tostring(err)

  if self.logger then
    self.logger:log({
      type = "error",
      str = message,
    })
  end

  local feather = self.feather
  if feather and feather.continueOnGameError and feather.gameErrorToast and feather.debugOverlay then
    feather.debugOverlay:showToast("error", "love." .. name .. " crashed; Feather kept the game running.")
  end
end

function FeatherPluginManager:createCallbackRegistrar(plugin)
  local manager = self
  return {
    register = function(name, fn, opts)
      local disposer = self.callbackBus:register(name, function(...)
        if plugin.disabled then
          return
        end

        -- A plugin's callback error is the plugin's, not the game's: record it
        -- instead of letting it unwind through love.draw.
        local ok, err = pcall(fn, ...)
        if ok then
          Health.recordSuccess(plugin.health, "callback")
        else
          manager:_recordFailure(plugin, "callback", err)
        end
      end, opts)

      plugin.callbackDisposers[#plugin.callbackDisposers + 1] = disposer
      return disposer
    end,
  }
end

function FeatherPluginManager:registerPluginCallbacks(plugin)
  local instance = instanceOf(plugin)
  if not instance then
    return
  end

  local manager = self
  for _, callback in ipairs(LOVE_CALLBACKS) do
    if hasPluginCallback(instance, callback.method) then
      local disposer = self.callbackBus:register(callback.name, function(...)
        local current = instanceOf(plugin)
        if plugin.disabled or not current then
          return
        end

        local method = current[callback.method]
        if type(method) ~= "function" then
          return
        end

        local ok, err = pcall(method, current, ...)
        if ok then
          Health.recordSuccess(plugin.health, "callback")
        else
          manager:_recordFailure(plugin, "callback", err)
        end
      end)

      plugin.callbackDisposers[#plugin.callbackDisposers + 1] = disposer
    end
  end
end

function FeatherPluginManager:disposePluginCallbacks(plugin)
  if not plugin.callbackDisposers then
    return
  end

  for _, dispose in ipairs(plugin.callbackDisposers) do
    dispose()
  end

  plugin.callbackDisposers = {}
end

-- ── Update ─────────────────────────────────────────────────────────────────

local function isRunnable(record)
  return instanceOf(record) ~= nil and not record.disabled and not record.blocked
end

function FeatherPluginManager:isPluginUpdateActive(plugin, feather)
  return Scheduler.isUpdateActive(plugin, feather)
end

function FeatherPluginManager:isPluginPushActive(plugin, feather, force)
  return Scheduler.isPushActive(plugin, feather, force)
end

function FeatherPluginManager:hasInterestedPlugins(feather)
  if Scheduler.hasPendingRefresh(self) then
    return true
  end
  for _, plugin in ipairs(self.plugins) do
    if isRunnable(plugin) and Scheduler.isPushActive(plugin, feather, false) then
      return true
    end
  end
  return false
end

function FeatherPluginManager:update(dt, feather)
  for _, plugin in ipairs(self.plugins) do
    local instance = instanceOf(plugin)
    if
      isRunnable(plugin)
      and type(instance.update) == "function"
      and Scheduler.isUpdateActive(plugin, feather)
    then
      local startedAt = Health.clock()
      local overheadStartedAt = feather and feather.overhead and feather.overhead:begin()
      local ok, err = pcall(instance.update, instance, dt, feather)
      if feather and feather.overhead then
        feather.overhead:recordPlugin("update", plugin.identifier, overheadStartedAt)
      end
      plugin.health.lastUpdateMs = (Health.clock() - startedAt) * 1000
      if ok then
        self:_recordSuccess(plugin, "update")
      else
        self:_recordFailure(plugin, "update", err, feather)
      end
    end
  end
end

function FeatherPluginManager:updateSuspended(dt, feather)
  for _, plugin in ipairs(self.plugins) do
    local instance = instanceOf(plugin)
    if isRunnable(plugin) and type(instance.onSuspendedUpdate) == "function" then
      local ok, err = pcall(instance.onSuspendedUpdate, instance, dt, feather)
      if ok then
        self:_recordSuccess(plugin, "suspendedUpdate")
      else
        self:_recordFailure(plugin, "suspendedUpdate", err, feather)
      end
    end
  end
end

function FeatherPluginManager:onerror(msg, feather)
  for _, plugin in ipairs(self.plugins) do
    local instance = instanceOf(plugin)
    if isRunnable(plugin) and type(instance.onerror) == "function" then
      pcall(instance.onerror, instance, msg, feather)
    end
  end
end

-- ── Lookup ─────────────────────────────────────────────────────────────────

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

-- ── Requests and actions ───────────────────────────────────────────────────

function FeatherPluginManager:handleRequest(request, feather)
  local plugin = self:getPluginByUrl(request.path)
  local instance = plugin and instanceOf(plugin)

  if plugin and isRunnable(plugin) and type(instance.handleRequest) == "function" then
    local status, data = pcall(instance.handleRequest, instance, request, feather)

    if not status then
      self:_recordFailure(plugin, "payload", data, feather)
      return
    end
    return data
  end
end

function FeatherPluginManager:handleActionRequest(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  if plugin and (plugin.disabled or plugin.blocked) then
    self.logger:logger("[FeatherPluginManager] Ignoring action request for inactive plugin: " .. request.path)
    local reason = plugin.inactiveReason
    if reason then
      return nil, "Plugin is not running: " .. reason.message .. " " .. reason.remediation
    end
    return nil, "Plugin is disabled: " .. (request.path or "?")
  end

  if plugin and isRunnable(plugin) then
    self.logger:logger("[FeatherPluginManager] Received action request: " .. request.path)
    if type(instanceOf(plugin).handleActionRequest) ~= "function" then
      return nil, "Plugin " .. plugin.identifier .. " does not handle actions."
    end
    return Actions.dispatch(self, plugin, request, feather)
  end

  return nil, "Plugin not found: " .. (request.path or "?")
end

function FeatherPluginManager:handleParamsUpdate(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  self.logger:logger("[FeatherPluginManager] Received params update: " .. request.path)

  local instance = plugin and instanceOf(plugin)
  if plugin and isRunnable(plugin) and type(instance.handleParamsUpdate) == "function" then
    local status, data = pcall(instance.handleParamsUpdate, instance, request, feather)

    if not status then
      self:_recordFailure(plugin, "params", data, feather)
      return
    end
    self:_recordSuccess(plugin, "params")
    return data
  end
end

--- Cancel an in-flight action on a plugin
function FeatherPluginManager:handleActionCancel(request, feather)
  local plugin = self:getPluginByUrl(request.path)

  if plugin and isRunnable(plugin) then
    return Actions.cancel(self, plugin, request, feather)
  end
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

-- ── Pushes ─────────────────────────────────────────────────────────────────

--- Refresh every running plugin's payload for the desktop (`req:plugins`).
--- Queues the work at raised priority; the sample loop serves it within the
--- same per-frame batch and budget as normal pushes. Nothing is built here.
function FeatherPluginManager:pushAll(feather)
  return Scheduler.requestRefresh(self, feather)
end

--- Push a bounded number of plugin payloads to the desktop.
---@param feather Feather
---@param startIndex number|nil
---@param maxPlugins number|nil
---@param opts table|nil
---@return number nextIndex
---@return boolean done
function FeatherPluginManager:pushSome(feather, startIndex, maxPlugins, opts)
  return Scheduler.pushSome(self, feather, startIndex, maxPlugins, opts)
end

-- ── love.* hooking ─────────────────────────────────────────────────────────

--- Patch love callbacks so all plugins receive events via their on* methods.
--- Safe to call repeatedly; if the game assigns love.draw after Feather starts,
--- this re-wraps the new callback without stacking duplicate wrappers.
function FeatherPluginManager:hookLoveCallbacks()
  if not love then
    return
  end

  local mgr = self

  local function dispatch(name, ...)
    mgr.callbackBus:dispatch(name, ...)
  end

  self._loveCallbackOriginals = self._loveCallbackOriginals or {}
  self._loveCallbackWrappers = self._loveCallbackWrappers or {}

  for _, callback in ipairs(LOVE_CALLBACKS) do
    local name = callback.name
    local method = callback.method
    local wrapper = self._loveCallbackWrappers[name]

    if not wrapper then
      self._dispatchingLoveCallbacks = self._dispatchingLoveCallbacks or {}

      wrapper = function(...)
        if mgr._dispatchingLoveCallbacks[name] then
          return
        end

        mgr._dispatchingLoveCallbacks[name] = true

        local original = mgr._loveCallbackOriginals and mgr._loveCallbackOriginals[name]

        if original and original ~= wrapper then
          local ok, err = xpcall(original, callbackTraceback, ...)
          if not ok then
            if mgr.feather and mgr.feather.featherDebugger then
              mgr.feather.featherDebugger:pauseOnCallbackError(name, err)
            end
            if mgr.feather and mgr.feather.continueOnGameError then
              mgr:_handleOriginalCallbackError(name, err)
            else
              if not mgr.feather or not mgr.feather.autoRegisterErrorHandler then
                mgr:_handleOriginalCallbackError(name, err)
              end
              mgr._dispatchingLoveCallbacks[name] = false
              error(err, 0)
            end
          end
        end

        dispatch(name, ...)

        local overlay = mgr.feather and mgr.feather.debugOverlay
        if overlay then
          if method == "onDraw" and overlay.onDraw then
            overlay:onDraw()
          elseif method == "onKeypressed" and overlay.onKeypressed then
            overlay:onKeypressed(...)
          elseif method == "onTouchpressed" and overlay.onTouchpressed then
            overlay:onTouchpressed(...)
          end
        end

        mgr._dispatchingLoveCallbacks[name] = false
      end
      self._loveCallbackWrappers[name] = wrapper
    end

    local current = love[name]
    local isFeatherOwnedWrapper = false
    if name == "draw" and self.feather and self.feather.assets and self.feather.assets.isDrawWrapper then
      isFeatherOwnedWrapper = self.feather.assets:isDrawWrapper(current)
    end

    if current ~= wrapper and (not isFeatherOwnedWrapper or self._loveCallbackOriginals[name] == nil) then
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
    -- Anything that was instantiated cleans up, enabled or not: its init may
    -- have installed hooks.
    local instance = instanceOf(plugin)
    if instance and type(instance.finish) == "function" then
      pcall(instance.finish, instance, feather)
    end
    self:disposePluginCallbacks(plugin)
  end
  self._inflight = {}
  self._refreshQueue = {}
end

-- ── Registration helper ────────────────────────────────────────────────────

--- Create a plugin object to be used in the plugin manager
---@param plugin FeatherPlugin
---@param identifier string
---@param options table
---@param disabled? boolean   Start the plugin in disabled state (visible in UI but not running)
---@param capabilities? string[] Required capabilities (from the manifest's `capabilities`)
---@param compatibility? table|number Feather plugin API compatibility metadata
---@param runtime? table Runtime cost/update/push policy metadata
---@param manifest? table Further manifest fields: description, optionalCapabilities, actions
function FeatherPluginManager.createPlugin(
  plugin,
  identifier,
  options,
  disabled,
  capabilities,
  compatibility,
  runtime,
  manifest
)
  local normalizedCompatibility = Policy.normalizeApiCompatibility(compatibility)
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
    runtime = runtime,
    manifest = manifest,
  }
end

-- ── Plugin list for the desktop ────────────────────────────────────────────

local function actionContractList(actions)
  if not actions then
    return nil
  end
  local list = {}
  for _, action in pairs(actions) do
    list[#list + 1] = { name = action.name, cancellable = action.cancellable }
  end
  table.sort(list, function(a, b)
    return a.name < b.name
  end)
  return list
end

function FeatherPluginManager:getConfig()
  local pluginsConfig = {}

  for _, plugin in ipairs(self.plugins) do
    local instance = instanceOf(plugin)
    local config
    if instance and type(instance.getConfig) == "function" then
      local ok, result = pcall(instance.getConfig, instance)
      if ok and type(result) == "table" then
        config = result
      else
        Health.recordFailure(plugin.health, "config", ok and "getConfig() did not return a table" or result)
      end
    end
    if not config then
      -- Catalog metadata only: the plugin has not run, so its own config
      -- (tab name, icon, toolbar actions) is not available.
      config = {
        type = plugin.incompatible and "incompatible" or "inactive",
        tabName = plugin.name or plugin.identifier,
        icon = plugin.blocked and "plug-zap" or "puzzle",
      }
    end
    config.disabled = plugin.disabled or false
    config.blocked = plugin.blocked or false
    config.active = isRunnable(plugin)
    config.inactiveReason = not config.active and plugin.inactiveReason or nil
    config.incompatible = plugin.incompatible or false
    config.incompatibilityReason = plugin.incompatibilityReason
    config.api = plugin.compatibility and plugin.compatibility.api or nil
    config.minApi = plugin.compatibility and plugin.compatibility.minApi or nil
    config.maxApi = plugin.compatibility and plugin.compatibility.maxApi or nil
    config.currentApi = plugin.compatibility and plugin.compatibility.currentApi or nil
    config.version = plugin.version or config.version
    config.name = config.name or plugin.name
    config.description = config.description or plugin.description
    config.capabilities = plugin.capabilities or {}
    config.optionalCapabilities = plugin.optionalCapabilities or {}
    config.grantedCapabilities = Policy.grantedCapabilities(plugin, self._grants)
    config.runtime = plugin.runtime
    config.runtimeDeclared = plugin.runtimeDeclared
    config.manifestWarnings = #plugin.manifestWarnings > 0 and plugin.manifestWarnings or nil
    config.actionContract = actionContractList(plugin.actions)
    config.uiSchemaVersion = Policy.contract.uiSchemaVersion
    config.health = Health.snapshot(plugin)
    pluginsConfig[plugin.identifier] = config
  end

  return pluginsConfig
end

-- ── Enable / disable ───────────────────────────────────────────────────────

local function refuse(self, plugin)
  local reason = plugin.inactiveReason
  self.logger:logger(
    "[FeatherPluginManager] Cannot enable "
      .. tostring(plugin.identifier)
      .. ": "
      .. (reason and (reason.message .. " " .. reason.remediation) or "plugin is blocked")
  )
  return false
end

--- Enable a plugin (after the error threshold, a manual disable, or a
--- disabled-by-default manifest). Blocked plugins cannot be enabled.
function FeatherPluginManager:enablePlugin(pluginId)
  local plugin = self:getPlugin(pluginId)
  if not plugin then
    return false
  end
  if plugin.blocked then
    return refuse(self, plugin)
  end
  if not self:_materialize(plugin) or plugin.blocked then
    return refuse(self, plugin)
  end
  plugin.disabled = false
  plugin.errorCount = 0
  plugin.inactiveReason = nil
  Health.reset(plugin.health)
  self.logger:logger("[FeatherPluginManager] Enabled plugin: " .. pluginId)
  return true
end

--- Disable a plugin so it stops consuming resources
function FeatherPluginManager:disablePlugin(pluginId)
  local plugin = self:getPlugin(pluginId)
  if not plugin then
    return false
  end
  if not plugin.blocked then
    plugin.disabled = true
    plugin.inactiveReason = Policy.disabledReason(plugin)
    Actions.abandon(self, plugin, self.feather, "Plugin was disabled.")
  end
  self.logger:logger("[FeatherPluginManager] Disabled plugin: " .. pluginId)
  return true
end

--- Disable all plugins so they stop consuming resources.
---@return number count Number of plugins newly disabled
function FeatherPluginManager:disableAllPlugins()
  local count = 0
  for _, plugin in ipairs(self.plugins) do
    if not plugin.disabled then
      self:disablePlugin(plugin.identifier)
      count = count + 1
    end
  end
  return count
end

--- Toggle a plugin's enabled/disabled state
---@param pluginId string
---@return boolean|nil enabled  New state, or nil if plugin not found
function FeatherPluginManager:togglePlugin(pluginId)
  local plugin = self:getPlugin(pluginId)
  if not plugin then
    return nil
  end
  if plugin.blocked then
    return refuse(self, plugin)
  end
  if plugin.disabled then
    return self:enablePlugin(pluginId)
  end
  self:disablePlugin(pluginId)
  return false
end

return FeatherPluginManager
