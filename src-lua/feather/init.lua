---@diagnostic disable: invisible
local socket = require("socket")
local utf8 = require("utf8")

-- lib Path
local PATH = (...):gsub("%.init$", "")

local Class = require(PATH .. ".lib.class")
local errorhandler = require(PATH .. ".error_handler")
local FeatherPluginManager = require(PATH .. ".plugin_manager")
local FeatherLogger = require(PATH .. ".plugins.logger")
local FeatherObserver = require(PATH .. ".plugins.observer")
local get_current_dir = require(PATH .. ".utils").get_current_dir
local format = require(PATH .. ".utils").format
local serverUtils = require(PATH .. ".server_utils")

local FEATHER_VERSION_NAME = "0.5.0"
local FEATHER_API = 2

local FEATHER_VERSION = {
  name = FEATHER_VERSION_NAME,
  api = FEATHER_API,
}

---@class Feather: FeatherConfig
---@field lastDelivery number
---@field lastError number
---@field debug boolean
---@field featherLogger FeatherLogger
---@field protected server any
---@field observe fun(self: Feather, key: string, value: table | string | number | boolean) Updates value in the observers tab
---@field finish fun(self: Feather) Logs a finish line
---@field trace fun(self: Feather, ...) Prints a trace
---@field error fun(self: Feather, msg: string) Prints an error
---@field update fun(self: Feather, dt: number) Updates the Feather instance
---@field protected __onerror fun(self: Feather, msg: string, finish: boolean)
---@field protected __getConfig fun(self: Feather): FeatherConfig
---@field protected __setConfig fun(self: Feather, params: table): FeatherConfig
---@field protected __errorTraceback fun(self: Feather, msg: string): string
local Feather = Class({})

local customErrorHandler = errorhandler

---@class FeatherConfig
---@field debug boolean
---@field host? string
---@field port? number
---@field baseDir? string
---@field wrapPrint? boolean
---@field whitelist? table
---@field maxTempLogs? number
---@field updateInterval? number
---@field sampleRate? number
---@field version? number
---@field versionName? string
---@field apiKey? string
---@field defaultObservers? boolean
---@field captureScreenshot? boolean
---@field errorWait? number
---@field autoRegisterErrorHandler? boolean
---@field errorHandler? function
---@field plugins? table
--- Feather constructor
---@param config FeatherConfig
function Feather:init(config)
  local conf = config or {}
  self.debug = conf.debug or false
  self.host = conf.host or "*"
  self.baseDir = conf.baseDir or ""
  self.port = conf.port or 4004
  self.wrapPrint = conf.wrapPrint or false
  self.whitelist = conf.whitelist or { "127.0.0.1" }
  self.maxTempLogs = conf.maxTempLogs or 200
  self.updateInterval = conf.updateInterval or 0.1
  self.sampleRate = conf.sampleRate or 1
  self.defaultObservers = conf.defaultObservers or false
  self.captureScreenshot = conf.captureScreenshot or false
  self.apiKey = conf.apiKey or ""
  ---TODO: find a better way to ensure that the error handler is called, maybe a thread?
  self.errorWait = conf.errorWait or 3
  self.autoRegisterErrorHandler = conf.autoRegisterErrorHandler or false
  self.plugins = conf.plugins or {}
  self.lastDelivery = 0
  self.lastError = 0
  self.version = FEATHER_VERSION.api
  self.versionName = FEATHER_VERSION.name

  if not self.debug then
    return
  end

  customErrorHandler = conf.errorHandler or errorhandler

  local server = assert(socket.bind(self.host, self.port))
  self.server = server

  self.addr, self.port = self.server:getsockname()
  print("Listening on " .. self.addr .. ":" .. self.port)
  self.server:settimeout(0)

  ---@type FeatherLogger
  self.featherLogger = FeatherLogger(self)
  self.featherLogger:log({ type = "feather:start" })

  ---@type FeatherObserver
  self.featherObserver = FeatherObserver(self)

  if self.autoRegisterErrorHandler then
    local selfRef = self -- capture `self` to avoid upvalue issues

    function love.errorhandler(msg)
      selfRef:__onerror(msg, true) -- Log the error first

      local function isDelivered()
        return selfRef.lastDelivery > selfRef.lastError
      end

      local delivered = isDelivered()

      local start = love.timer.getTime()
      while not delivered and (love.timer.getTime() - start) < selfRef.errorWait do
        selfRef:update(0)
        delivered = isDelivered()
        love.timer.sleep(self.updateInterval)
      end

      return customErrorHandler(msg)
    end
  end

  self.pluginManager = FeatherPluginManager(self, self.featherLogger, self.featherObserver)
end

function Feather:__getConfig()
  local root_path = get_current_dir()

  if #self.baseDir > 0 then
    root_path = root_path .. "/" .. self.baseDir
  end

  local config = {
    plugins = self.pluginManager:getConfig(),
    root_path = root_path,
    version = FEATHER_VERSION.name,
    API = FEATHER_VERSION.api,
    sampleRate = self.sampleRate,
    language = "lua",
  }

  return config
end

function Feather:__setConfig(params)
  self.sampleRate = params.sampleRate or 1
  self.updateInterval = params.updateInterval or 0.1
  self.maxTempLogs = params.maxTempLogs or 200

  return self:__getConfig()
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

  local err = self:__errorTraceback(msg)
  self.featherLogger:log({ type = "error", str = self:__errorTraceback(msg) }, true)
  if self.wrapPrint then
    self.featherLogger.logger("[Feather] ERROR: " .. err)
  end
  self.lastError = os.time()
  self.pluginManager:onerror(msg, self)

  if finish then
    self:finish()
  end
end

--- Tracks the value of a key in the observers table
---@param key string
---@param value table | string | number | boolean
function Feather:observe(key, value)
  self.featherObserver:observe(key, value)
end

---@alias FeatherClear fun(self: Feather)
---@type FeatherClear
function Feather:clear()
  self.featherLogger:clear()
end

---@alias FeatherFinish fun(self: Feather)
---@type FeatherFinish
function Feather:finish()
  self.featherLogger:log({ type = "feather:finish" })

  self.pluginManager:finish(self)
end

---@alias FeatherError fun(self: Feather, msg: string)
---@type FeatherError
function Feather:error(msg)
  self:__onerror(msg, false)
end

---@param dt number
function Feather:update(dt)
  if not self.debug then
    return
  end

  local client = self.server:accept()

  serverUtils.handleRequest(client, self, dt)

  self.featherLogger:update()
  self.pluginManager:update(dt, self)
end

---@alias FeatherTrace fun(self: Feather, ...)
---@type FeatherTrace
function Feather:trace(...)
  if not self.debug then
    return
  end

  local str = "[Feather] " .. format(...)

  self.featherLogger.logger(str)
  self.featherLogger:print("trace", str)
end

--- Execute an action from a plugin
---@param plugin string
---@param action string
---@param params table
function Feather:action(plugin, action, params)
  self.pluginManager:action(plugin, action, params, self)
end

--- ToggleScreenshots
--- @param enabled boolean
function Feather:toggleScreenshots(enabled)
  self.captureScreenshot = enabled
  self.featherLogger.captureScreenshot = self.captureScreenshot
end

---@type fun(config: FeatherConfig): Feather
---@diagnostic disable-next-line: assign-type-mismatch
local casted = Feather

return casted
