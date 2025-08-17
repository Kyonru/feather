---@diagnostic disable: invisible
local socket = require("socket")
local utf8 = require("utf8")

-- lib Path
local PATH = (...):gsub("%.init$", "")

local inspect = require(PATH .. ".lib.inspect")
local json = require(PATH .. ".lib.json")
local Class = require(PATH .. ".lib.class")
local errorhandler = require(PATH .. ".error_handler")
local get_current_dir = require(PATH .. ".utils").get_current_dir
local Performance = require(PATH .. ".plugins.performance")

local performance = Performance()

local logs = {}
local FEATHER_VERSION = "0.2.0"

---@class Feather: FeatherConfig
---@field lastDelivery number
---@field lastError number
---@field debug boolean
---@field protected server any
---@field observe fun(self: Feather, key: string, value: table | string | number | boolean) Updates value in the observers tab
---@field log fun(self: Feather, line: FeatherLine) Logs a line
---@field finish fun(self: Feather) Logs a finish line
---@field print fun(self: Feather, ...) Prints a log
---@field trace fun(self: Feather, ...) Prints a trace
---@field error fun(self: Feather, msg: string) Prints an error
---@field update fun(self: Feather, dt: number) Updates the Feather instance
---@field protected __print fun(self: Feather, type: string, str: string)
---@field protected __countOnRepeat fun(self: Feather, type: LogType, ...: unknown)
---@field protected __onerror fun(self: Feather, msg: string, finish: boolean)
---@field protected __getConfig fun(self: Feather): FeatherConfig
---@field protected __buildResponse fun(self: Feather, body: table | string | number): string
---@field protected __buildRequest fun(self: Feather, request: table): table
---@field protected __format fun(self: Feather, ...: any): string
---@field protected __isInWhitelist fun(self: Feather, addr: string): boolean
---@field protected __defaultObservers fun(self: Feather)
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
---@field defaultObservers? boolean
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
  self.defaultObservers = conf.defaultObservers or false
  ---TODO: find a better way to ensure that the error handler is called, maybe a thread?
  self.errorWait = conf.errorWait or 3
  self.autoRegisterErrorHandler = conf.autoRegisterErrorHandler or false
  self.plugins = conf.plugins or {}
  self.lastDelivery = 0
  self.observers = {}

  if not self.debug then
    return
  end

  customErrorHandler = conf.errorHandler or errorhandler

  local server = assert(socket.bind(self.host, self.port))
  self.server = server

  self.addr, self.port = self.server:getsockname()
  print("Listening on " .. self.addr .. ":" .. self.port)
  self.server:settimeout(0)

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

  -- Wrap print
  self.logger = print
  if self.wrapPrint then
    local logger = print

    local selfRef = self -- capture `self` to avoid upvalue issues

    --
    print = function(...)
      logger(...)
      selfRef.print(self, ...)
    end
  end
end

function Feather:__buildResponse(body)
  local response = table.concat({
    "HTTP/1.1 200 OK",
    "Content-Type: application/json",
    "Access-Control-Allow-Origin: *",
    "Content-Length: " .. #body,
    "",
    body,
  }, "\r\n")

  return response
end

function Feather:__getConfig()
  local root_path = get_current_dir()

  if #self.baseDir > 0 then
    root_path = root_path .. "/" .. self.baseDir
  end

  local config = {
    plugins = self.plugins,
    root_path = root_path,
    version = FEATHER_VERSION,
  }

  return config
end

function Feather:__buildRequest(request)
  local method, pathWithQuery = request:match("^(%u+)%s+([^%s]+)")
  local path, queryString = pathWithQuery:match("^([^?]+)%??(.*)$")
  local function parseQuery(qs)
    local params = {}
    for key, val in qs:gmatch("([^&=?]+)=([^&=?]+)") do
      params[key] = val
    end
    return params
  end

  local params = parseQuery(queryString)

  return {
    method = method,
    path = path,
    params = params,
  }
end

function Feather:__format(...)
  return inspect(..., { newline = "\n", indent = "\t" })
end

function Feather:__isInWhitelist(addr)
  for _, a in pairs(self.whitelist) do
    local ptn = "^" .. a:gsub("%.", "%%."):gsub("%*", "%%d*") .. "$"
    if addr:match(ptn) then
      return true
    end
  end
  return false
end

function Feather:__defaultObservers()
  self:observe("Global", _G)
  self:observe("Lua Version", _VERSION)
end

--- Tracks the value of a key in the observers table
---@alias FeatherObserve fun(self: Feather, key: string, value: table | string | number | boolean)
---@type FeatherObserve
function Feather:observe(key, value)
  if not self.debug then
    return
  end

  self.observers = self.observers or {}

  local curr = self:__format(value)

  for _, observer in ipairs(self.observers) do
    if observer.key == key then
      observer.value = curr
      return
    end
  end

  table.insert(self.observers, { key = key, value = curr })
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

---@alias FeatherClear fun(self: Feather)
---@type FeatherClear
function Feather:clear()
  logs = {}
end

---@alias FeatherFinish fun(self: Feather)
---@type FeatherFinish
function Feather:finish()
  self:log({ type = "feather:finish" })
end

function Feather:__onerror(msg, finish)
  if not self.debug then
    return
  end

  local err = self:__errorTraceback(msg)
  self:log({ type = "error", str = self:__errorTraceback(msg) })
  if self.wrapPrint then
    self.logger("[Feather] ERROR: " .. err)
  end
  self.lastError = os.time()

  if finish then
    self:finish()
  end
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
  if client then
    if #logs == 0 then
      self:log({ type = "feather:start" })
    end

    client:settimeout(1)

    local rawRequest = client:receive()
    local request = self:__buildRequest(rawRequest)

    local addr = client:getsockname()

    self.logger(request)
    if not self:__isInWhitelist(addr) then
      self:trace("non-whitelisted connection attempt: ", addr)
      client:close()
    end

    self.logger(request.method)
    if request and request.method == "GET" then
      local response = ""

      self.logger(request.path)
      if request.path == "/config" then
        local body = json.encode(self:__getConfig())
        response = self:__buildResponse(body)
      end

      if request.path == "/logs" then
        local body = json.encode(logs)
        response = self:__buildResponse(body)
        self.lastDelivery = os.time()
      end

      if request.path == "/performance" then
        local body = json.encode(performance:getResponseBody(dt))
        response = self:__buildResponse(body)
      end

      if request.path == "/observers" then
        if self.defaultObservers then
          self:__defaultObservers()
        end
        local body = json.encode(self.observers)
        response = self:__buildResponse(body)
      end

      client:send(response)
    end

    client:close()
  end
end

---@alias FeatherTrace fun(self: Feather, ...)
---@type FeatherTrace
function Feather:trace(...)
  if not self.debug then
    return
  end

  local str = "[Feather] " .. self:__format(...)

  self.logger(str)
  self:__print("trace", str)
end

---@alias LogType "output" | "trace" | "error" | "feather:finish" | "feather:start" | "output" | "error"
---@class FeatherLine
---@field type LogType
---@field str? string
---@field id? string
---@field time? number
---@field count? number
---@field trace? string
---@alias FeatherLog fun(self: Feather, line: FeatherLine)
---@type FeatherLog
function Feather:log(line)
  if not self.debug then
    return
  end

  line.id = tostring(os.time()) .. "-" .. tostring(#logs + 1)
  line.time = os.time()
  line.count = 1
  line.trace = debug.traceback()

  table.insert(logs, line)

  --- Find a way to avoid deleting incoming logs
  if #logs > self.maxTempLogs then
    table.remove(logs, 1)
  end
end

---@alias FeatherPrint fun(self: Feather, ...)
---@type FeatherPrint
function Feather:print(...)
  self:__countOnRepeat("output", ...)
end

--- Manages the print function internally
--- @param self Feather
--- @param type LogType
--- @param ... unknown
function Feather:__countOnRepeat(type, ...)
  if not self.debug then
    return
  end

  local str = self:__format(...)
  local last = logs[#logs]
  if last and str == last.str then
    -- Update last line if this line is a duplicate of it
    last.time = os.time()
    last.count = last.count + 1
  else
    self:log({ type = type, str = str })
  end
end

---@type fun(config: FeatherConfig): Feather
---@diagnostic disable-next-line: assign-type-mismatch
local casted = Feather

return casted
