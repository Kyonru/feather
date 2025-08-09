-- Very minimal HTTP server inside Love2D
local socket = require("socket")
local inspect = require("lib.inspect")
local json = require("lib.json")
local Class = require("lib.class")
local utf8 = require("utf8")
local errorhandler = require("error_handler")
local get_current_dir = require("utils").get_current_dir

local logs = {}

local Feather = Class({})

local customErrorHandler = errorhandler

function Feather:init(config)
  local conf = config or {}
  self.pages = {}
  self.host = conf.host or "*"
  self.baseDir = conf.baseDir or ""
  self.port = conf.port or 4004
  self.wrapPrint = conf.wrapPrint or true
  self.timestamp = conf.timestamp or true
  self.whitelist = conf.whitelist or { "127.0.0.1" }
  self.maxTempLogs = conf.maxTempLogs or 200
  self.updateInterval = conf.updateInterval or 0.1
  ---TODO: find a better way to ensure that the error handler is called, maybe a thread?
  self.errorWait = conf.errorWait or 10
  self.autoRegisterErrorHandler = conf.autoRegisterErrorHandler and true or false
  self.plugins = conf.plugins or {}
  self.lastDelivery = 0
  customErrorHandler = conf.errorHandler or errorhandler

  local server = assert(socket.bind(self.host, self.port))
  self.server = server

  self.addr, self.port = self.server:getsockname()
  print("Listening on " .. self.addr .. ":" .. self.port)
  self.server:settimeout(0)

  if self.autoRegisterErrorHandler then
    local selfRef = self -- capture `self` to avoid upvalue issues

    function love.errorhandler(msg)
      selfRef:onerror(msg, true) -- Log the error first

      local function isDelivered()
        return selfRef.lastDelivery > selfRef.lastError
      end

      local delivered = isDelivered()

      local start = love.timer.getTime()
      while not delivered and (love.timer.getTime() - start) < selfRef.errorWait do
        selfRef:update()
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

    print = function(...)
      logger(...)
      selfRef.print(self, ...)
    end
  end
end

---@param body table | string | number
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
  local config = {
    plugins = self.plugins,
    root_path = get_current_dir() .. "/" .. self.baseDir,
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

function Feather:clear()
  logs = {}
end

function Feather:finish()
  self:log({ type = "feather:finish" })
end

function Feather:onerror(msg, finish)
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

function Feather:update()
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

      client:send(response)
    end

    client:close()
  end
end

function Feather:trace(...)
  local str = "[Feather] " .. self:__format(...)
  self.logger(str)
  if not self.wrapPrint then
    self:print(str)
  end
end

function Feather:log(line)
  line.id = tostring(os.time()) .. "-" .. tostring(#logs + 1)
  line.time = os.time()
  line.count = 1
  line.trace = debug.traceback()

  table.insert(logs, line)

  --- Find a way to avoid deleting incoming logs
  -- if #logs > self.maxTempLogs then
  --   table.remove(logs, 1)
  -- end
end

function Feather:print(...)
  local str = self:__format(...)
  local last = logs[#logs]
  if last and str == last.str then
    -- Update last line if this line is a duplicate of it
    last.time = os.time()
    last.count = last.count + 1
  else
    self:log({ type = "output", str = str })
  end
end

return Feather
