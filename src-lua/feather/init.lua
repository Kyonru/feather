---@diagnostic disable: invisible
local utf8 = require("utf8")

-- lib Path
local PATH = (...):gsub("%.init$", "")
---@type string Global so plugins can locate the library regardless of install directory. Users may pre-set this before requiring feather; auto-detection is the fallback.
FEATHER_PATH = FEATHER_PATH or PATH

local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")
local errorhandler = require(FEATHER_PATH .. ".error_handler")
local FeatherCallbackBus = require(FEATHER_PATH .. ".callback_bus")
local FeatherPluginManager = require(FEATHER_PATH .. ".plugin_manager")
local FeatherLogger = require(FEATHER_PATH .. ".core.logger")
local FeatherObserver = require(FEATHER_PATH .. ".core.observer")
local FeatherPerformance = require(FEATHER_PATH .. ".core.performance")
local FeatherProfiler = require(FEATHER_PATH .. ".core.profiler")
local FeatherAssets = require(FEATHER_PATH .. ".core.assets")
local FeatherDebugOverlay = require(FEATHER_PATH .. ".core.debug_overlay")
local FeatherDebugger = require(FEATHER_PATH .. ".debugger")
local FeatherUI = require(FEATHER_PATH .. ".ui")
local get_current_dir = require(FEATHER_PATH .. ".utils").get_current_dir
local format = require(FEATHER_PATH .. ".utils").format

local FEATHER_VERSION_NAME = "2.0.0"
local FEATHER_API = 5

local FEATHER_VERSION = {
  name = FEATHER_VERSION_NAME,
  api = FEATHER_API,
}

local function is_absolute_path(path)
  return path:sub(1, 1) == "/" or path:match("^%a:[/\\]") ~= nil
end

local function join_path(base, child)
  if not child or #child == 0 then
    return base
  end
  if is_absolute_path(child) then
    return child
  end
  local suffix = base:sub(-1)
  if suffix == "/" or suffix == "\\" then
    return base .. child
  end
  return base .. "/" .. child
end

local CALLBACK_NAMES = {
  "draw",
  "keypressed",
  "keyreleased",
  "mousepressed",
  "mousereleased",
  "mousemoved",
  "touchpressed",
  "touchreleased",
  "touchmoved",
  "joystickpressed",
  "joystickreleased",
  "joystickhat",
  "joystickaxis",
  "gamepadpressed",
  "gamepadreleased",
  "gamepadaxis",
}

---@class Feather: FeatherConfig
---@field lastError number
---@field debug boolean
---@field featherLogger FeatherLogger
---@field API number
---@field VERSION number
---@field wsConnected boolean
---@field wsClient table|nil
---@field sessionId string
---@field observe fun(self: Feather, key: string, value: table | string | number | boolean) Updates value in the observers tab
---@field finish fun(self: Feather) Logs a finish line
---@field trace fun(self: Feather, ...) Prints a trace
---@field error fun(self: Feather, msg: string) Prints an error
---@field update fun(self: Feather, dt: number) Updates the Feather instance
---@field protected __onerror fun(self: Feather, msg: string, finish: boolean)
---@field protected __getConfig fun(self: Feather): FeatherConfig
---@field protected __setConfig fun(self: Feather, params: table): FeatherConfig
---@field protected __errorTraceback fun(self: Feather, msg: string): string
---@field protected __handleCommand fun(self: Feather, msg: table)
---@field protected __pushPerformance fun(self: Feather, dt: number)
---@field protected __pushProfiler fun(self: Feather, force?: boolean)
---@field protected __pushObservers fun(self: Feather)
---@field protected __pushAssets fun(self: Feather)
---@field attachBinary fun(self: Feather, mime: string, bytes: string): table
---@field startSessionReplay fun(self: Feather, opts?: table): string|nil
---@field stopSessionReplay fun(self: Feather): string|nil
---@field playSessionReplay fun(self: Feather, idOrPath?: string, opts?: table): boolean|nil
---@field seekSessionReplay fun(self: Feather, timeOrCheckpointId: number|string): boolean|nil
---@field replayInitialState fun(self: Feather, name: string, state: table, opts?: table): boolean|nil
---@field replayCheckpoint fun(self: Feather, nameOrOpts?: string|table, stateOverrides?: table): string|boolean|nil
---@field replayState fun(self: Feather, name: string, state: table, opts?: table): boolean|nil
---@field replay fun(self: Feather, name: string, state: table, opts?: table): boolean|nil
---@field replayRegister fun(self: Feather, name: string, captureFn?: function, restoreFn?: function, opts?: table): boolean|nil
---@field ui table Declarative UI node builders for plugins
---@field profiler FeatherProfiler Core explicit profiler service
local Feather = Class({})

local customErrorHandler = errorhandler

---@class FeatherConfig
---@field debug boolean
---@field outfile? string
---@field host? string  Desktop IP or hostname the game connects TO (default "127.0.0.1")
---@field port? number  Feather desktop WS server port (default 4004)
---@field baseDir? string
---@field wrapPrint? boolean
---@field maxTempLogs? number
---@field updateInterval? number
---@field sampleRate? number
---@field pluginPushBatchSize? number
---@field gcStepAmount? number
---@field sessionName? string  Custom display name shown in desktop session tabs (e.g. "My RPG")
---@field deviceId? string  Override persistent device ID (auto-generated and saved to disk if not set)
---@field appId? string  Desktop app ID allowed to send commands to this game. Required unless __DANGEROUS_INSECURE_CONNECTION__ = true.
---@field __DANGEROUS_INSECURE_CONNECTION__? boolean  Explicit opt-in to accept commands from any desktop (no appId check). Must be set to acknowledge the security risk.
---@field apiKey? string
---@field defaultObservers? boolean
---@field captureScreenshot? boolean
---@field errorWait? number
---@field autoRegisterErrorHandler? boolean
---@field errorHandler? function
---@field continueOnGameError? boolean  If true, original love.* callback errors are logged and swallowed so the game loop can continue (default false).
---@field gameErrorToast? boolean  Show an in-game toast when continueOnGameError catches a game callback error (default true).
---@field plugins? table
---@field capabilities? string[]|string  Allowed plugin capabilities — array of tokens or "all" (default: "all")
---@field mode? string
---@field writeToDisk? boolean  Whether to write logs to .featherlog files (default true)
---@field retryInterval? number
---@field connectTimeout? number
---@field debugger? boolean|table  Enable the step debugger (default false), or debugger options.
---@field assetPreview? boolean  Enable core asset tracking and previews (default true)
---@field binaryTextThreshold? number  Observer/time-travel strings longer than this are sent as binary text (default 4096)
---@field hotReload? table  Top-level hot reload options. Prefer debugger.hotReload for new configs.
---@field debugOverlay? table|boolean  Small in-game debugger status badge (default enabled in debug builds)
---@field profilerPushInterval? number  Core profiler live push cadence while recording (default 0.25s)
--- Feather constructor
---@param config FeatherConfig
function Feather:init(config)
  local conf = config or {}
  self.debug = conf.debug or false
  -- host is now the DESKTOP address the game connects to
  self.host = conf.host or "127.0.0.1"
  self.baseDir = conf.baseDir or ""
  self.outfile = conf.outfile or "feather"
  self.port = conf.port or 4004
  self.wrapPrint = conf.wrapPrint or false
  self.maxTempLogs = conf.maxTempLogs or 200
  self.updateInterval = conf.updateInterval or 0.1
  self.sampleRate = conf.sampleRate or 1
  self.profilerPushInterval = conf.profilerPushInterval or 0.25
  self.pluginPushBatchSize = conf.pluginPushBatchSize or 2
  self.gcStepAmount = conf.gcStepAmount or 40
  self.callbackHookInterval = conf.callbackHookInterval or 0.25
  self._callbackHookElapsed = 0
  self.defaultObservers = conf.defaultObservers or false
  self.captureScreenshot = conf.captureScreenshot or false
  self.apiKey = conf.apiKey or ""
  self.errorWait = conf.errorWait or 3
  self.autoRegisterErrorHandler = conf.autoRegisterErrorHandler or false
  self.continueOnGameError = conf.continueOnGameError == true
  self.gameErrorToast = conf.gameErrorToast ~= false
  self.plugins = conf.plugins or {}
  self.capabilities = conf.capabilities or "all"
  self.mode = conf.mode or "socket"
  local debuggerConfig = type(conf.debugger) == "table" and conf.debugger or {}
  self.debuggerEnabled = conf.debugger == true or debuggerConfig.enabled == true
  self.debuggerPauseOnError = debuggerConfig.pauseOnError == true
  self.hotReloadConfig = debuggerConfig.hotReload or conf.hotReload or {}
  self.writeToDisk = conf.writeToDisk ~= false
  self.retryInterval = conf.retryInterval or 2
  self.connectTimeout = conf.connectTimeout or 2
  self.sessionName = conf.sessionName or ""
  self.appId = conf.appId or ""
  self.__DANGEROUS_INSECURE_CONNECTION__ = conf.__DANGEROUS_INSECURE_CONNECTION__ == true

  -- Enforce that developers consciously opt out of appId binding.
  -- If neither appId nor __DANGEROUS_INSECURE_CONNECTION__ is set, refuse to open a socket
  -- connection so the developer cannot accidentally ship without one or the other.
  if self.mode == "socket" and self.debug then
    if type(self.appId) ~= "string" or self.appId == "" then
      if not self.__DANGEROUS_INSECURE_CONNECTION__ then
        error(
          "[Feather] Security: appId is not set and __DANGEROUS_INSECURE_CONNECTION__ is not true.\n"
            .. "  Set appId in feather.config.lua (copy from Feather → Settings → Security → Desktop App ID)\n"
            .. "  OR set __DANGEROUS_INSECURE_CONNECTION__ = true to acknowledge that any Feather desktop can send commands to this game.",
          2
        )
      end
    end
  end

  self.assetPreviewEnabled = conf.assetPreview ~= false
  self.binaryTextThreshold = conf.binaryTextThreshold or 4096
  self._nextBinaryId = 1
  self._pendingBinaries = {}
  self._binaryDrainQueue = {}
  self._scheduledSampleTasks = {}
  self._pluginPushIndex = nil
  self._lastSampleDt = 0
  self.lastError = 0
  self.wsConnected = false
  self.runtimeSuspended = false
  self.__connState = "idle"
  self.version = FEATHER_VERSION.api
  self.versionName = FEATHER_VERSION.name
  self.ui = FeatherUI

  -- Persistent device ID: saved to disk so the same device keeps its identity across launches.
  -- Can be overridden via config for custom identification.
  if conf.deviceId then
    self.deviceId = conf.deviceId
  else
    local DEVICE_ID_FILE = ".feather_device_id"
    local contents = love.filesystem.read(DEVICE_ID_FILE)
    if contents and #contents > 0 then
      self.deviceId = contents:match("^%s*(.-)%s*$") -- trim
    else
      self.deviceId = string.format(
        "%08x%08x%08x%08x",
        love.math.random(0, 0x7FFFFFFF),
        love.math.random(0, 0x7FFFFFFF),
        love.math.random(0, 0x7FFFFFFF),
        love.math.random(0, 0x7FFFFFFF)
      )
      love.filesystem.write(DEVICE_ID_FILE, self.deviceId)
    end
  end
  self.sessionId = self.deviceId

  if not self.debug then
    return
  end

  customErrorHandler = conf.errorHandler or errorhandler

  ---@type FeatherLogger
  self.featherLogger = FeatherLogger(self)
  if conf._legacyProfilerPluginRequested then
    self.featherLogger:log({
      type = "warn",
      str = "[Profiler] The profiler plugin was removed. Use DEBUGGER.profiler and Performance > Profiler instead.",
    })
  end

  ---@type FeatherObserver
  self.featherObserver = FeatherObserver(self)

  self.performance = FeatherPerformance()
  self.profiler = FeatherProfiler({ pushInterval = self.profilerPushInterval, feather = self })
  self.hotReloader = nil

  if self.autoRegisterErrorHandler then
    local selfRef = self

    function love.errorhandler(msg)
      if not msg then
        msg = "Unknown error"
      end
      selfRef:__onerror(msg, true)
      return customErrorHandler(msg)
    end
  end

  if self.assetPreviewEnabled then
    self.assets = FeatherAssets(self.featherLogger)
  end

  self.callbackBus = FeatherCallbackBus(CALLBACK_NAMES)
  self.pluginManager = FeatherPluginManager(self, self.featherLogger, self.featherObserver)
  self.pluginManager:hookLoveCallbacks()
  local debugOverlayConfig = conf.debugOverlay
  if debugOverlayConfig == false and self.continueOnGameError and self.gameErrorToast then
    debugOverlayConfig = { enabled = true, visible = false }
  end
  self.debugOverlay = FeatherDebugOverlay(self, debugOverlayConfig)

  ---@type FeatherDebugger
  self.featherDebugger = FeatherDebugger(self)
  self.featherDebugger:setOptions({ pauseOnError = self.debuggerPauseOnError })
  if self.debuggerEnabled then
    self.featherDebugger:enable()
  end

  if self.mode == "disk" then
    self.featherLogger:log({ type = "feather:start" })
    return
  end

  self:__createWsClient()
  self._wsLastAttempt = -self.retryInterval
  print("[Feather] WS client created — connecting to " .. self.host .. ":" .. self.port)

  self.featherLogger:log({ type = "feather:start" })
end

--- Create (or recreate) the WS client with event handlers.
function Feather:__createWsClient()
  local websocket = require(PATH .. ".lib.ws")
  local selfRef = self
  self.wsClient = websocket.new(self.host, self.port, "/")

  function self.wsClient:onopen()
    selfRef.wsConnected = true
    selfRef.__connState = "authenticating"
    -- Wait for auth:challenge from desktop before sending feather:hello
    print("[Feather] Connected to " .. selfRef.host .. ":" .. selfRef.port .. " — waiting for handshake")
  end

  function self.wsClient:onmessage(raw)
    local ok, msg = pcall(json.decode, raw)
    if ok and msg then
      selfRef:__handleCommand(msg)
    end
  end

  function self.wsClient:onclose(_code, _reason)
    if selfRef.wsConnected then
      selfRef.wsConnected = false
      print("[Feather] Disconnected")
    end
    selfRef._binaryDrainQueue = {}
    if selfRef.__connState ~= "failed" then
      selfRef.__connState = "idle"
    end
  end

  function self.wsClient:onerror(_err) end
end

--- Send a JSON string directly over the WS client.
function Feather:__sendWs(payload)
  if self.wsConnected and self.wsClient then
    pcall(function()
      self.wsClient:send(payload)
    end)
  end
end

--- Queue bytes to be sent after the current JSON message and return a JSON-safe reference.
--- Plugins can put the returned table's src/binary fields into normal content payloads.
---@param mime string
---@param bytes string
---@return table
function Feather:attachBinary(mime, bytes)
  local binaryId = "binary-" .. tostring(self._nextBinaryId or 1)
  self._nextBinaryId = (self._nextBinaryId or 1) + 1
  self._pendingBinaries = self._pendingBinaries or {}
  table.insert(self._pendingBinaries, {
    id = binaryId,
    mime = mime or "application/octet-stream",
    bytes = bytes,
  })
  return {
    src = "feather-binary:" .. binaryId,
    binary = {
      id = binaryId,
      mime = mime or "application/octet-stream",
    },
  }
end

function Feather:__sendPendingBinaries()
  local pending = self._pendingBinaries or {}
  self._pendingBinaries = {}
  if not self.wsConnected or not self.wsClient or not self.wsClient.sendBinary then
    return
  end
  self._binaryDrainQueue = self._binaryDrainQueue or {}
  for _, binary in ipairs(pending) do
    table.insert(self._binaryDrainQueue, binary)
  end
end

---@param value string
---@return string, table|nil
function Feather:__maybeAttachText(value)
  if type(value) ~= "string" or #value <= self.binaryTextThreshold then
    return value, nil
  end

  local ref = self:attachBinary("text/plain;charset=utf-8", value)
  return ref.src, ref.binary
end

--- Send feather:hello with full config — equivalent to old GET /config response.
function Feather:__sendHello()
  self:__sendWs(json.encode({
    type = "feather:hello",
    session = self.sessionId,
    data = self:__getConfig(),
  }))

  self.featherLogger:log({ type = "feather:start" })
end

function Feather:__getConfig()
  local cliGamePath = os.getenv("FEATHER_GAME_PATH")
  local hasCliGamePath = type(cliGamePath) == "string" and #cliGamePath > 0
  local root_path = hasCliGamePath and cliGamePath or get_current_dir()
  if #self.baseDir > 0 then
    root_path = join_path(root_path, self.baseDir)
  end
  local sourceDir = root_path
  ---@diagnostic disable-next-line: undefined-field
  if not hasCliGamePath and love.filesystem.getSourceDirectory then
    ---@diagnostic disable-next-line: undefined-field
    sourceDir = love.filesystem.getSourceDirectory()
  end
  return {
    plugins = self.pluginManager:getConfig(),
    root_path = root_path,
    version = FEATHER_VERSION.name,
    API = FEATHER_VERSION.api,
    sampleRate = self.sampleRate,
    continueOnGameError = self.continueOnGameError,
    gameErrorToast = self.gameErrorToast,
    language = "lua",
    outfile = self.featherLogger.outfile,
    captureScreenshot = self.featherLogger.captureScreenshot,
    location = love.filesystem.getSaveDirectory(),
    sourceDir = sourceDir,
    protocols = { "json", "binary" },
    sysInfo = self.performance.sysInfo,
    deviceId = self.deviceId,
    sessionName = self.sessionName,
    capabilities = self.capabilities,
    security = {
      appIdRequired = type(self.appId) == "string" and self.appId ~= "",
      __DANGEROUS_INSECURE_CONNECTION__ = self.__DANGEROUS_INSECURE_CONNECTION__ == true,
    },
    assets = { enabled = self.assetPreviewEnabled },
    debugger = {
      enabled = self.debuggerEnabled,
      pauseOnError = self.debuggerPauseOnError,
      hotReload = self.hotReloader and self.hotReloader:getState() or nil,
    },
  }
end

function Feather:__setConfig(params)
  self.sampleRate = params.sampleRate or self.sampleRate
  self.updateInterval = params.updateInterval or self.updateInterval
  self.maxTempLogs = params.maxTempLogs or self.maxTempLogs
  if params.continueOnGameError ~= nil then
    self.continueOnGameError = params.continueOnGameError == true
  end
  if params.gameErrorToast ~= nil then
    self.gameErrorToast = params.gameErrorToast ~= false
  end
  if self.continueOnGameError and self.gameErrorToast and self.debugOverlay and not self.debugOverlay.enabled then
    self.debugOverlay.enabled = true
    self.debugOverlay.visible = false
  end
  if params.diskUsage ~= nil then
    self.performance._diskUsageEnabled = params.diskUsage
  end
end

function Feather:__setAssetPreviewEnabled(enabled)
  enabled = enabled ~= false
  if self.assetPreviewEnabled == enabled then
    return
  end

  self.pluginManager:unhookLoveCallbacks()
  if self.assets then
    self.assets:finish()
    self.assets = nil
  end

  self.assetPreviewEnabled = enabled
  if enabled then
    self.assets = FeatherAssets(self.featherLogger)
  end

  self.pluginManager:hookLoveCallbacks()
end

function Feather:__isAppAuthorized(msg)
  if self.__DANGEROUS_INSECURE_CONNECTION__ then
    return true
  end
  if type(self.appId) ~= "string" or self.appId == "" then
    return true  -- should not reach here; init() enforces appId or __DANGEROUS_INSECURE_CONNECTION__
  end
  return msg and msg.appId == self.appId
end

function Feather:__isSuspendedCommandAllowed(msg)
  if not msg or not msg.type then
    return false
  end
  if msg.type == "cmd:runtime" then
    return true
  end
  if msg.type == "cmd:profiler" then
    local action = tostring(msg.action or "")
    return action == "stop" or action == "reset" or action == "refresh"
  end
  if msg.type ~= "cmd:plugin:action" then
    return false
  end

  local plugin = tostring(msg.plugin or "")
  local action = tostring(msg.action or "")
  local params = msg.params or {}

  if plugin == "shader-graph" and action == "clear-preview" then
    return true
  end
  if plugin == "particle-system-playground" and action == "runtime-preview" then
    local active = params.active
    return active == false or active == "false" or active == 0 or active == "0"
  end
  return false
end

function Feather:__sendSuspendedCommandRejected(msg)
  if msg and msg.type == "cmd:profiler" then
    self:__sendWs(json.encode({
      type = "profiler:error",
      session = self.sessionId,
      action = msg.action,
      data = { message = "Feather runtime is suspended. Resume Feather to start profiling." },
    }))
    return
  end
  if msg and msg.type == "cmd:plugin:action" then
    self:__sendWs(json.encode({
      type = "plugin:action:response",
      session = self.sessionId,
      plugin = msg.plugin,
      action = msg.action,
      status = "error",
      message = "Feather runtime is suspended. Resume Feather to sync edits.",
    }))
  end
end

--- Dispatch an incoming desktop → game command message.
---@param msg table Decoded JSON command
function Feather:__handleCommand(msg)
  if not msg or not msg.type then
    return
  end

  -- Handshake state machine: authenticate before processing any game commands.
  if self.__connState == "authenticating" then
    if msg.type == "auth:challenge" then
      self.__authNonce = msg.nonce or ""
      self:__sendWs(json.encode({
        type = "auth:response",
        appId = self.appId or "",
        nonce = self.__authNonce,
        insecure = self.__DANGEROUS_INSECURE_CONNECTION__ or nil,
      }))
    elseif msg.type == "auth:ok" then
      self.__authNonce = nil
      self.__connState = "connected"
      self:__sendHello()
      print("[Feather] Handshake complete")
    elseif msg.type == "auth:fail" then
      self.__connState = "failed"
      print("[Feather] Connection rejected by desktop: App ID mismatch.")
      print("[Feather] Check that appId in feather.config.lua matches your Feather desktop App ID.")
      self.wsClient:close()
    end
    return
  end

  if self.__connState ~= "connected" then
    return
  end

  if msg.type == "cmd:runtime" then
    local suspended = msg.action == "suspend"
    if msg.action == "resume" then
      suspended = false
    end
    self.runtimeSuspended = suspended
    if suspended and self.profiler then
      self.profiler:stop()
      self:__pushProfiler(true)
    end
    if not suspended then
      self:__sendHello()
    end
    self:__sendWs(json.encode({
      type = "runtime:suspended",
      session = self.sessionId,
      data = { suspended = self.runtimeSuspended },
    }))
    return
  end

  if self.runtimeSuspended and not self:__isSuspendedCommandAllowed(msg) then
    self:__sendSuspendedCommandRejected(msg)
    return
  end

  if msg.type == "cmd:config" and msg.data then
    self:__setConfig(msg.data)
  elseif msg.type == "cmd:log" and msg.action == "clear" then
    self.featherLogger:clear()
  elseif msg.type == "cmd:log" and msg.action == "toggle-screenshots" then
    self:toggleScreenshots(not self.featherLogger.captureScreenshot)
  elseif msg.type == "cmd:profiler" then
    local state, err = self.profiler:handleCommand(msg.action, msg.params or {})
    if state then
      self:__pushProfiler(true)
    else
      self:__sendWs(json.encode({
        type = "profiler:error",
        session = self.sessionId,
        action = msg.action,
        data = { message = tostring(err or "Profiler command failed") },
      }))
    end
  elseif msg.type == "cmd:plugin:action" and msg.plugin then
    local params = msg.params or {}
    params.action = msg.action
    local path = msg.plugin:find("^/plugins/") and msg.plugin or ("/plugins/" .. msg.plugin)
    local request = { method = "POST", path = path, params = params, headers = {} }
    local result, err = self.pluginManager:handleActionRequest(request, self)
    -- Send action response back to desktop
    if err then
      self:__sendWs(json.encode({
        type = "plugin:action:response",
        session = self.sessionId,
        plugin = msg.plugin,
        action = msg.action,
        status = "error",
        message = tostring(err),
      }))
    else
      local response = {
        type = "plugin:action:response",
        session = self.sessionId,
        plugin = msg.plugin,
        action = msg.action,
        status = "success",
      }
      -- Pass through download directive if the plugin returned one
      if type(result) == "table" and result.download then
        response.download = result.download
      end
      -- Pass through clipboard directive if the plugin returned one
      if type(result) == "table" and result.clipboard then
        response.clipboard = result.clipboard
      end
      if type(result) == "table" and result.zipAssets then
        response.zipAssets = result.zipAssets
      end
      if type(result) == "table" then
        response.data = result
      end
      self:__sendWs(json.encode(response))
    end
    -- Re-send config so desktop picks up dynamic label changes
    if not self.runtimeSuspended then
      self:__sendHello()
    end
  elseif msg.type == "cmd:plugin:action:cancel" and msg.plugin then
    local path = msg.plugin:find("^/plugins/") and msg.plugin or ("/plugins/" .. msg.plugin)
    local request = { method = "DELETE", path = path, params = msg.params or {}, headers = {} }
    self.pluginManager:handleActionCancel(request, self)
  elseif msg.type == "cmd:plugin:params" and msg.plugin then
    local path = msg.plugin:find("^/plugins/") and msg.plugin or ("/plugins/" .. msg.plugin)
    local request = { method = "PUT", path = path, params = msg.params or {}, headers = {} }
    self.pluginManager:handleParamsUpdate(request, self)
    self:__sendHello()
  elseif msg.type == "cmd:plugin:set_enabled" and msg.plugin then
    local enabled = msg.enabled == true
    local ok = false
    local errorMessage = nil

    if msg.plugin == "console" and enabled then
      if type(self.apiKey) ~= "string" or self.apiKey == "" or msg.apiKey ~= self.apiKey then
        errorMessage = "Console API key is missing or invalid."
      else
        ok = self.pluginManager:enablePlugin(msg.plugin)
      end
    elseif enabled then
      ok = self.pluginManager:enablePlugin(msg.plugin)
    else
      ok = self.pluginManager:disablePlugin(msg.plugin)
    end

    if msg.plugin == "console" then
      self:__sendWs(json.encode({
        type = "console:enabled",
        session = self.sessionId,
        data = {
          ok = ok == true,
          enabled = ok == true and enabled or false,
          error = errorMessage,
        },
      }))
    end

    self:__sendHello()
  elseif msg.type == "cmd:plugin:toggle" and msg.plugin then
    self.pluginManager:togglePlugin(msg.plugin)
    self:__sendHello()
  elseif msg.type == "cmd:plugins:disable_all" then
    self.pluginManager:disableAllPlugins()
    self:__sendHello()
  elseif msg.type == "cmd:assets:toggle" then
    local enabled = not self.assetPreviewEnabled
    if msg.data and msg.data.enabled ~= nil then
      enabled = msg.data.enabled
    end
    self:__setAssetPreviewEnabled(enabled)
    self:__sendHello()
    self:__pushAssets()
  elseif msg.type == "cmd:assets:preview" and msg.data then
    if not self.assets then
      self:__sendWs(json.encode({
        type = "assets:error",
        session = self.sessionId,
        data = { message = "Asset preview is disabled for this session" },
      }))
      return
    end
    local ok, err = self.assets:preview(msg.data.kind, msg.data.id)
    if ok then
      self:__pushAssets()
    else
      self:__sendWs(json.encode({
        type = "assets:error",
        session = self.sessionId,
        data = { message = tostring(err) },
      }))
    end
  elseif msg.type == "cmd:hot_reload:module"
    or msg.type == "cmd:hot_reload:restore"
    or msg.type == "req:hot_reload:state"
    or msg.type == "req:hot_reload:validate"
  then
    local hotReloadPlugin = self.pluginManager:getPlugin("hot-reload")
    if hotReloadPlugin and hotReloadPlugin.instance and not hotReloadPlugin.disabled then
      hotReloadPlugin.instance:handleHotReloadCommand(msg, self)
    else
      local moduleName = type(msg.data) == "table" and msg.data.module or ""
      self:__sendWs(json.encode({
        type = "hot_reload:result",
        session = self.sessionId,
        data = {
          ok = false,
          module = moduleName,
          error = "Hot reload plugin not registered. Add the hot-reload plugin to your plugins list.",
        },
      }))
    end
  elseif msg.type == "cmd:debugger:enable" then
    self.debuggerEnabled = true
    self.featherDebugger:enable()
  elseif msg.type == "cmd:debugger:disable" then
    self.debuggerEnabled = false
    self.featherDebugger:disable()
  elseif msg.type == "cmd:debugger:set_options" and msg.data then
    if msg.data.pauseOnError ~= nil then
      self.debuggerPauseOnError = msg.data.pauseOnError == true
    end
    self.featherDebugger:setOptions(msg.data)
  elseif msg.type == "cmd:debugger:set_breakpoints" and msg.data then
    self.featherDebugger:setBreakpoints(msg.data.breakpoints or {})
  elseif msg.type == "cmd:debugger:set_profiler_probes" and msg.data then
    self.featherDebugger:setProfilerProbes(msg.data.probes or {})
  elseif msg.type == "cmd:debugger:inspect_frame" and msg.data then
    self.featherDebugger:inspectFrame(msg.data.index or 0)
  elseif msg.type == "cmd:debugger:continue" then
    self.featherDebugger:resume(nil)
  elseif msg.type == "cmd:debugger:step_over" then
    self.featherDebugger:resume("over")
  elseif msg.type == "cmd:debugger:step_into" then
    self.featherDebugger:resume("into")
  elseif msg.type == "cmd:debugger:step_out" then
    self.featherDebugger:resume("out")
  -- Server-driven data requests: Feather desktop asks, Lua responds
  elseif msg.type == "req:config" then
    self:__sendHello()
  elseif msg.type == "req:performance" then
    self:__pushPerformance(love.timer.getDelta())
  elseif msg.type == "req:observers" then
    self:__pushObservers()
  elseif msg.type == "req:plugins" then
    self.pluginManager:pushAll(self)
  elseif msg.type == "cmd:time_travel:start" then
    local plugin = self.pluginManager:getPlugin("time-travel")
    if plugin then
      plugin.disabled = false -- enable update() so frames are recorded each tick
      plugin.instance:startRecording()
      self:__sendHello()
    end
  elseif msg.type == "cmd:time_travel:stop" then
    local plugin = self.pluginManager:getPlugin("time-travel")
    if plugin then
      plugin.instance:stopRecording()
      self:__sendHello()
    end
  elseif msg.type == "cmd:time_travel:request_frames" and msg.data then
    local plugin = self.pluginManager:getPlugin("time-travel")
    if plugin then
      plugin.instance:sendFrames(msg.data, self)
    end
  elseif msg.type and msg.type:match("^cmd:session_replay:") then
    local plugin = self.pluginManager:getPlugin("session-replay")
    if plugin and plugin.instance and not plugin.disabled then
      local ok, err = plugin.instance:handleSessionReplayCommand(msg, self)
      if not ok and err then
        self:__sendWs(json.encode({
          type = "session_replay:error",
          session = self.sessionId,
          data = { message = tostring(err) },
        }))
      end
    else
      self:__sendWs(json.encode({
        type = "session_replay:error",
        session = self.sessionId,
        data = { message = "Session Replay plugin is not enabled. Include session-replay in feather.config.lua." },
      }))
    end
  elseif msg.type == "req:console:globals" then
    local consolePlugin = self.pluginManager:getPlugin("console")
    if consolePlugin and consolePlugin.instance and not consolePlugin.disabled then
      consolePlugin.instance:sendGlobals(self)
    else
      self:__sendWs(json.encode({
        type = "console:globals",
        session = self.sessionId,
        data = {
          ok = false,
          error = consolePlugin and "Console plugin is disabled. Enable it to refresh globals."
            or "Console plugin not registered. Add it to your plugins list.",
        },
      }))
    end
  elseif msg.type == "req:console:pins"
    or msg.type == "cmd:console:pin"
    or msg.type == "cmd:console:unpin"
    or msg.type == "cmd:console:inspect_result"
  then
    local consolePlugin = self.pluginManager:getPlugin("console")
    if consolePlugin and consolePlugin.instance and not consolePlugin.disabled then
      if msg.type == "req:console:pins" then
        consolePlugin.instance:sendPins(self)
      elseif msg.type == "cmd:console:pin" then
        consolePlugin.instance:addPin(msg, self)
      elseif msg.type == "cmd:console:unpin" then
        consolePlugin.instance:removePin(msg, self)
      elseif msg.type == "cmd:console:inspect_result" then
        consolePlugin.instance:sendInspectResult(msg, self)
      end
    else
      local errorMessage = consolePlugin and "Console plugin is disabled. Enable it to manage pins."
        or "Console plugin not registered. Add it to your plugins list."
      if msg.type == "cmd:console:inspect_result" then
        self:__sendWs(json.encode({
          type = "console:inspect_result",
          session = self.sessionId,
          data = {
            ok = false,
            id = msg.data and msg.data.id or nil,
            handle = msg.data and msg.data.handle or nil,
            path = msg.data and msg.data.path or {},
            error = errorMessage,
          },
        }))
      else
        self:__sendWs(json.encode({
          type = "console:pins",
          session = self.sessionId,
          data = {
            ok = false,
            pins = {},
            error = errorMessage,
          },
        }))
      end
    end
  elseif msg.type == "cmd:eval" and msg.code then
    local consolePlugin = self.pluginManager:getPlugin("console")
    if consolePlugin and consolePlugin.instance and not consolePlugin.disabled then
      consolePlugin.instance:handleEval(msg, self)
    else
      self:__sendWs(json.encode({
        type = "eval:response",
        session = self.sessionId,
        id = msg.id,
        status = "error",
        result = consolePlugin and "Console plugin is disabled. Enable it to run eval commands."
          or "Console plugin not registered. Add it to your plugins list.",
        prints = {},
      }))
    end
  end
end

--- Push a performance snapshot to the desktop.
---@param dt number
function Feather:__pushPerformance(dt)
  self:__sendWs(json.encode({
    type = "performance",
    session = self.sessionId,
    data = self.performance:getResponseBody(dt),
  }))
end

--- Push profiler state when it is dirty or recording.
---@param force boolean|nil
function Feather:__pushProfiler(force)
  if not self.profiler then
    return
  end
  local now = love and love.timer and love.timer.getTime and love.timer.getTime() or os.clock()
  if not force and not self.profiler:shouldPush(now) then
    return
  end
  self:__sendWs(json.encode({
    type = "profiler",
    session = self.sessionId,
    data = self.profiler:getState(),
  }))
  self.profiler:markPushed(now)
end

--- Push current observer values to the desktop.
function Feather:__pushObservers()
  local values = self.featherObserver:getResponseBody(self)
  if values then
    self:__sendWs(json.encode({
      type = "observe",
      session = self.sessionId,
      data = values,
    }))
    self:__sendPendingBinaries()
  end
end

--- Push current asset catalog to the desktop.
function Feather:__pushAssets()
  if not self.assets then
    self:__sendWs(json.encode({
      type = "assets",
      session = self.sessionId,
      data = {
        enabled = false,
        textures = {},
        fonts = {},
        audio = {},
        preview = false,
      },
    }))
    return
  end
  local body = self.assets:getResponseBody()
  local binaryData = body.preview and body.preview._binaryData
  if body.preview then
    body.preview._binaryData = nil
  end
  self:__sendWs(json.encode({
    type = "assets",
    session = self.sessionId,
    data = body,
  }))
  if binaryData and self.wsClient and self.wsClient.sendBinary then
    self.wsClient:sendBinary(binaryData)
  end
end

function Feather:__queueSampleTasks(dt)
  self._lastSampleDt = dt or self._lastSampleDt or 0
  self._scheduledSampleTasks = self._scheduledSampleTasks or {}
  if #self._scheduledSampleTasks > 0 then
    return
  end

  self._scheduledSampleTasks = { "performance", "profiler", "observers", "assets", "plugins", "gc" }
  self._pluginPushIndex = 1
end

function Feather:__runNextSampleTask()
  local tasks = self._scheduledSampleTasks
  if not tasks or #tasks == 0 then
    return
  end

  local task = tasks[1]
  if task == "performance" then
    self:__pushPerformance(self._lastSampleDt or 0)
    table.remove(tasks, 1)
  elseif task == "profiler" then
    self:__pushProfiler(false)
    table.remove(tasks, 1)
  elseif task == "observers" then
    self:__pushObservers()
    table.remove(tasks, 1)
  elseif task == "assets" then
    self:__pushAssets()
    table.remove(tasks, 1)
  elseif task == "plugins" then
    local nextIndex, done = self.pluginManager:pushSome(
      self,
      self._pluginPushIndex or 1,
      self.pluginPushBatchSize or 2
    )
    self._pluginPushIndex = nextIndex
    if done then
      self._pluginPushIndex = nil
      table.remove(tasks, 1)
    end
  elseif task == "gc" then
    collectgarbage("step", self.gcStepAmount or 40)
    table.remove(tasks, 1)
  else
    table.remove(tasks, 1)
  end
end

function Feather:__errorTraceback(msg)
  local trace = debug.traceback()

  local sanitizedData = {}
  for char in msg:gmatch(utf8.charpattern) do
    table.insert(sanitizedData, char)
  end
  local sanitizedMsg = table.concat(sanitizedData)

  local err = {}
  table.insert(err, "Error\n")
  table.insert(err, sanitizedMsg)

  if #sanitizedMsg ~= #msg then
    table.insert(err, "Invalid UTF-8 string in error message.")
  end

  table.insert(err, "\n")

  for l in trace:gmatch("(.-)\n") do
    if not l:match("boot.lua") then
      l = l:gsub("stack traceback:", "Traceback\n")
      table.insert(err, l)
    end
  end

  local p = table.concat(err, "\n")
  p = p:gsub("\t", "")
  p = p:gsub('%[string "(.-)"%]', "%1")
  return p
end

function Feather:__onerror(msg, finish)
  if not self.debug then
    return
  end

  local errType = finish and "error" or "fatal"
  local err = self:__errorTraceback(msg)
  self.featherLogger:log({ type = errType, str = err }, true)

  if self.wrapPrint then
    self.featherLogger:logger("[Feather] ERROR: " .. err)
  end

  self.lastError = os.time()
  self.pluginManager:onerror(msg, self)

  if finish then
    self:finish()
  end
end

---@param key string
---@param value table | string | number | boolean
function Feather:observe(key, value)
  self.featherObserver:observe(key, value)
end

function Feather:clear()
  self.featherLogger:clear()
end

function Feather:finish()
  self.featherLogger:log({ type = "feather:finish" })
  if self.wsConnected then
    self:__sendWs(json.encode({ type = "feather:bye", session = self.sessionId }))
  end
  if self.wsClient then
    pcall(function()
      self.wsClient:close()
    end)
    self.wsClient = nil
  end
  self.wsConnected = false
  self.pluginManager:finish(self)
  if self.assets then
    self.assets:finish()
  end
end

function Feather:error(msg)
  self:__onerror(msg, false)
end
---@param dt number
function Feather:update(dt)
  if not self.debug then
    return
  end

  -- Keep suspended runtimes cheap while allowing explicitly enabled overlays to animate.
  if self.runtimeSuspended then
    self.pluginManager:updateSuspended(dt, self)
  else
    self._callbackHookElapsed = (self._callbackHookElapsed or 0) + (dt or 0)
    if self._callbackHookElapsed >= (self.callbackHookInterval or 0.25) then
      self._callbackHookElapsed = 0
      self.pluginManager:hookLoveCallbacks()
    end
    self.featherLogger:update()
    if self.assets then
      self.assets:update(dt)
    end
    self.pluginManager:update(dt, self)
  end

  if self.mode == "disk" then
    return
  end

  -- Drive WS client I/O
  if self.wsClient then
    local STATUS = require(PATH .. ".lib.ws").STATUS
    if self.wsClient.status == STATUS.CLOSED then
      if self.wsConnected then
        self.wsConnected = false
        print("[Feather] Disconnected")
      end
      if self.__connState ~= "failed" then
        local socket = require("socket")
        local now = socket.gettime()
        if now - self._wsLastAttempt >= self.retryInterval then
          self._wsLastAttempt = now
          self:__createWsClient()
        end
      end
    else
      self.wsClient:update()
      -- Drain queued binary frames: at most 2 per game frame to avoid flooding the socket
      if not self.runtimeSuspended and self.wsConnected and self._binaryDrainQueue and #self._binaryDrainQueue > 0 then
        for _ = 1, 2 do
          local binary = table.remove(self._binaryDrainQueue, 1)
          if not binary then break end
          if binary.bytes and self.wsClient.sendBinary then
            self.wsClient:sendBinary(binary.bytes)
          end
        end
      end
    end
  end

  -- Push-based data delivery: only after handshake is complete
  if self.runtimeSuspended then
    return
  end

  if self.wsConnected and self.__connState == "connected" then
    if self.assets and self.assets:hasPreview() then
      self:__pushAssets()
    end
    self._wsElapsed = (self._wsElapsed or 0) + dt
    if self._wsElapsed >= self.sampleRate then
      self._wsElapsed = 0
      self:__queueSampleTasks(dt)
    end
    self:__runNextSampleTask()
  end
end

function Feather:trace(...)
  if not self.debug then
    return
  end
  self.featherLogger:print("trace", "[Feather] " .. format(...))
end

---@param plugin string
---@param action string
---@param params table
function Feather:action(plugin, action, params)
  self.pluginManager:action(plugin, action, params, self)
end

function Feather:__sessionReplayPlugin()
  if not self.debug or not self.pluginManager then
    return nil
  end
  local plugin = self.pluginManager:getPlugin("session-replay")
  if not plugin or not plugin.instance or plugin.disabled then
    return nil
  end
  return plugin.instance
end

function Feather:startSessionReplay(opts)
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.startRecording then
    local id, err = plugin:startRecording(opts or {})
    if plugin.sendStatus then
      plugin:sendStatus(self)
    end
    if plugin.sendReplayList then
      plugin:sendReplayList(self)
    end
    return id, err
  end
  return nil
end

function Feather:stopSessionReplay()
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.stopRecording then
    local id = plugin:stopRecording(self)
    if plugin.sendStatus then
      plugin:sendStatus(self)
    end
    if plugin.sendReplayList then
      plugin:sendReplayList(self)
    end
    return id
  end
  return nil
end

function Feather:playSessionReplay(idOrPath, opts)
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.startReplay then
    local ok, err = plugin:startReplay(idOrPath, opts or {})
    if plugin.sendStatus then
      plugin:sendStatus(self)
    end
    return ok, err
  end
  return nil
end

function Feather:seekSessionReplay(timeOrCheckpointId)
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.seekReplay then
    local ok, err = plugin:seekReplay(timeOrCheckpointId)
    if plugin.sendStatus then
      plugin:sendStatus(self)
    end
    return ok, err
  end
  return nil
end

function Feather:replayInitialState(name, state, opts)
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.recordInitialState then
    return plugin:recordInitialState(name, state, opts or {})
  end
  return nil
end

function Feather:replayCheckpoint(nameOrOpts, stateOverrides)
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.recordCheckpoint then
    return plugin:recordCheckpoint(nameOrOpts, stateOverrides)
  end
  return nil
end

function Feather:stopSessionReplayPlayback()
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.stopReplay then
    plugin:stopReplay()
    if plugin.sendStatus then
      plugin:sendStatus(self)
    end
    return true
  end
  return nil
end

function Feather:replayState(name, state, opts)
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.recordState then
    return plugin:recordState(name, state, opts or {})
  end
  return nil
end

function Feather:replay(name, state, opts)
  return self:replayState(name, state, opts)
end

function Feather:replayRegister(name, captureFn, restoreFn, opts)
  local plugin = self:__sessionReplayPlugin()
  if plugin and plugin.registerState then
    return plugin:registerState(name, captureFn, restoreFn, opts or {})
  end
  return nil
end

---@param enabled boolean
function Feather:toggleScreenshots(enabled)
  self.captureScreenshot = enabled
  self.featherLogger.captureScreenshot = enabled
end

--- Push a WS message on behalf of a plugin (called by plugin_manager)
---@param pluginId string
---@param data table
function Feather:pushPlugin(pluginId, data)
  self:__sendWs(json.encode({
    type = "plugin",
    session = self.sessionId,
    plugin = pluginId,
    data = data,
  }))
  self:__sendPendingBinaries()
end

---@type fun(config: FeatherConfig): Feather
---@diagnostic disable-next-line: assign-type-mismatch
local casted = Feather
---@diagnostic disable-next-line: inject-field
casted.API = FEATHER_VERSION.api
---@diagnostic disable-next-line: inject-field
casted.VERSION = FEATHER_VERSION.name

return casted
