---@diagnostic disable: invisible
local utf8 = require("utf8")

-- lib Path
local PATH = (...):gsub("%.init$", "")

local Class = require(PATH .. ".lib.class")
local json = require(PATH .. ".lib.json")
local errorhandler = require(PATH .. ".error_handler")
local FeatherPluginManager = require(PATH .. ".plugin_manager")
local FeatherLogger = require(PATH .. ".plugins.logger")
local FeatherObserver = require(PATH .. ".plugins.observer")
local FeatherPerformance = require(PATH .. ".plugins.performance")
local get_current_dir = require(PATH .. ".utils").get_current_dir
local format = require(PATH .. ".utils").format

local FEATHER_VERSION_NAME = "0.6.0"
local FEATHER_API = 5

local FEATHER_VERSION = {
  name = FEATHER_VERSION_NAME,
  api = FEATHER_API,
}

---@class Feather: FeatherConfig
---@field lastError number
---@field debug boolean
---@field featherLogger FeatherLogger
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
---@field protected __pushObservers fun(self: Feather)
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
---@field sessionName? string  Custom display name shown in desktop session tabs (e.g. "My RPG")
---@field deviceId? string  Override persistent device ID (auto-generated and saved to disk if not set)
---@field apiKey? string
---@field defaultObservers? boolean
---@field captureScreenshot? boolean
---@field errorWait? number
---@field autoRegisterErrorHandler? boolean
---@field errorHandler? function
---@field plugins? table
---@field mode? string
---@field writeToDisk? boolean  Whether to write logs to .featherlog files (default true)
---@field retryInterval? number
---@field connectTimeout? number
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
  self.defaultObservers = conf.defaultObservers or false
  self.captureScreenshot = conf.captureScreenshot or false
  self.apiKey = conf.apiKey or ""
  self.errorWait = conf.errorWait or 3
  self.autoRegisterErrorHandler = conf.autoRegisterErrorHandler or false
  self.plugins = conf.plugins or {}
  self.mode = conf.mode or "socket"
  self.writeToDisk = conf.writeToDisk ~= false
  self.retryInterval = conf.retryInterval or 5
  self.connectTimeout = conf.connectTimeout or 2
  self.sessionName = conf.sessionName or ""
  self.lastError = 0
  self.wsConnected = false
  self.version = FEATHER_VERSION.api
  self.versionName = FEATHER_VERSION.name

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
        math.random(0, 0x7FFFFFFF),
        math.random(0, 0x7FFFFFFF),
        math.random(0, 0x7FFFFFFF),
        math.random(0, 0x7FFFFFFF)
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

  ---@type FeatherObserver
  self.featherObserver = FeatherObserver(self)

  self.performance = FeatherPerformance()

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

  self.pluginManager = FeatherPluginManager(self, self.featherLogger, self.featherObserver)

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
    selfRef:__sendHello()
    print("[Feather] Connected to " .. selfRef.host .. ":" .. selfRef.port)
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
  local root_path = get_current_dir()
  if #self.baseDir > 0 then
    root_path = root_path .. "/" .. self.baseDir
  end
  return {
    plugins = self.pluginManager:getConfig(),
    root_path = root_path,
    version = FEATHER_VERSION.name,
    API = FEATHER_VERSION.api,
    sampleRate = self.sampleRate,
    language = "lua",
    outfile = self.featherLogger.outfile,
    captureScreenshot = self.featherLogger.captureScreenshot,
    location = love.filesystem.getSaveDirectory(),
    sysInfo = self.performance.sysInfo,
    deviceId = self.deviceId,
    sessionName = self.sessionName,
  }
end

---@return nil
function Feather:__setConfig(params)
  self.sampleRate = params.sampleRate or self.sampleRate
  self.updateInterval = params.updateInterval or self.updateInterval
  self.maxTempLogs = params.maxTempLogs or self.maxTempLogs
end

--- Dispatch an incoming desktop → game command message.
---@param msg table Decoded JSON command
function Feather:__handleCommand(msg)
  if not msg or not msg.type then
    return
  end

  if msg.type == "cmd:config" and msg.data then
    self:__setConfig(msg.data)
  elseif msg.type == "cmd:log" and msg.action == "toggle-screenshots" then
    self:toggleScreenshots(not self.featherLogger.captureScreenshot)
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
      self:__sendWs(json.encode(response))
    end
    -- Re-send config so desktop picks up dynamic label changes
    self:__sendHello()
  elseif msg.type == "cmd:plugin:action:cancel" and msg.plugin then
    local path = msg.plugin:find("^/plugins/") and msg.plugin or ("/plugins/" .. msg.plugin)
    local request = { method = "DELETE", path = path, params = msg.params or {}, headers = {} }
    self.pluginManager:handleActionCancel(request, self)
  elseif msg.type == "cmd:plugin:params" and msg.plugin then
    local path = msg.plugin:find("^/plugins/") and msg.plugin or ("/plugins/" .. msg.plugin)
    local request = { method = "PUT", path = path, params = msg.params or {}, headers = {} }
    self.pluginManager:handleParamsUpdate(request, self)
  -- Server-driven data requests: Feather desktop asks, Lua responds
  elseif msg.type == "req:config" then
    self:__sendHello()
  elseif msg.type == "req:performance" then
    self:__pushPerformance(love.timer.getDelta())
  elseif msg.type == "req:observers" then
    self:__pushObservers()
  elseif msg.type == "req:plugins" then
    self.pluginManager:pushAll(self)
  elseif msg.type == "cmd:eval" and msg.code then
    local consolePlugin = self.pluginManager:getPlugin("console")
    if consolePlugin then
      consolePlugin.instance:handleEval(msg, self)
    else
      self:__sendWs(json.encode({
        type = "eval:response",
        session = self.sessionId,
        id = msg.id,
        status = "error",
        result = "Console plugin not registered. Add it to your plugins list.",
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

--- Push current observer values to the desktop.
function Feather:__pushObservers()
  local values = self.featherObserver:getResponseBody()
  if values then
    self:__sendWs(json.encode({
      type = "observe",
      session = self.sessionId,
      data = values,
    }))
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
end

function Feather:error(msg)
  self:__onerror(msg, false)
end
---@param dt number
function Feather:update(dt)
  if not self.debug then
    return
  end

  -- Always update local systems
  self.featherLogger:update()
  self.pluginManager:update(dt, self)

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
      local socket = require("socket")
      local now = socket.gettime()
      if now - self._wsLastAttempt >= self.retryInterval then
        self._wsLastAttempt = now
        self:__createWsClient()
      end
    else
      self.wsClient:update()
    end
  end

  -- Push-based data delivery: Lua sends performance/observers/plugins on its own schedule
  if self.wsConnected then
    self._wsElapsed = (self._wsElapsed or 0) + dt
    if self._wsElapsed >= self.sampleRate then
      self._wsElapsed = 0
      self:__pushPerformance(dt)
      self:__pushObservers()
      self.pluginManager:pushAll(self)
      collectgarbage("step", 200)
    end
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
end

---@type fun(config: FeatherConfig): Feather
---@diagnostic disable-next-line: assign-type-mismatch
local casted = Feather

return casted
