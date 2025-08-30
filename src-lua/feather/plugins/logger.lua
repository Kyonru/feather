local PATH = string.sub(..., 1, string.len(...) - string.len("plugins.logger"))

local Class = require(PATH .. ".lib.class")
local Base = require(PATH .. ".plugins.base")
local format = require(PATH .. ".utils").format
local wrapWith = require(PATH .. ".utils").wrapWith

---@class FeatherLogger: FeatherPlugin
---@field logs FeatherLine[]
---@field debug boolean
---@field wrapPrint boolean
---@field captureScreenshot boolean
---@field lastScreenshot any
---@field maxTempLogs number
---@field log fun(self: FeatherLogger, line: FeatherLine, screenshot?: boolean) Logs a line
---@field logger fun(...: any)
---@field print fun(self: FeatherLogger, ...: any)
---@field clear fun(self: FeatherLogger)
---@field protected __countOnRepeat fun(self: FeatherLogger, type: LogType, ...: any)
---@field protected __onerror fun(self: FeatherLogger, msg: string, finish: boolean)
local FeatherLogger = Class({
  __includes = Base,
  init = function(self, config)
    self.logs = {}
    self.debug = config.debug
    self.wrapPrint = config.wrapPrint
    self.maxTempLogs = config.maxTempLogs
    self.captureScreenshot = config.captureScreenshot
    self.lastScreenshot = nil

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
  end,
})

function FeatherLogger:print(...)
  self:__countOnRepeat("output", ...)
end

function FeatherLogger:update()
  if not self.captureScreenshot then
    return
  end

  self.lastScreenshot = nil

  love.graphics.captureScreenshot(function(img)
    self.lastScreenshot = img
  end)
end

--- Manages the print function internally
--- @param self FeatherLogger
--- @param type LogType
--- @param ... unknown
function FeatherLogger:__countOnRepeat(type, ...)
  if not self.debug then
    return
  end

  local str = format(...)
  local last = self.logs[#self.logs]
  if last and str == last.str then
    -- Update last line if this line is a duplicate of it
    last.time = os.time()
    last.count = last.count + 1
  else
    self:log({ type = type, str = str })
  end
end

---@alias LogType "output" | "trace" | "error" | "feather:finish" | "feather:start" | "output" | "error"
---@class FeatherLine
---@field type LogType
---@field str? string
---@field id? string
---@field time? number
---@field count? number
---@field trace? string
---@field screenshot? string|love.ByteData
---@alias FeatherLog fun(self: FeatherLogger, line: FeatherLine, screenshot?: boolean)
---@type FeatherLog
function FeatherLogger:log(line, screenshot)
  if not self.debug then
    return
  end

  if screenshot then
    local fileData = self.lastScreenshot:encode("png")
    local pngBytes = fileData:getString()

    local b64 = love.data.encode("string", "base64", pngBytes)

    line.screenshot = b64
  end

  line.id = tostring(os.time()) .. "-" .. tostring(#self.logs + 1)
  line.time = os.time()
  line.count = 1
  line.trace = debug.traceback()

  table.insert(self.logs, line)

  --- Find a way to avoid deleting incoming logs
  if #self.logs > self.maxTempLogs then
    table.remove(self.logs, 1)
  end
end

function FeatherLogger:clear()
  self.logs = {}
end

-- helper to wrap methods with logging
---@param tbl table
---@param methodName string
---@param type string
function FeatherLogger:wrapWithLog(tbl, methodName, type)
  wrapWith(tbl, methodName, function(method, ...)
    self:log({ type = type .. ":" .. method, str = format(...) })
  end)
end

return FeatherLogger
