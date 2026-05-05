local PATH = string.sub(..., 1, string.len(...) - string.len("plugins.logger"))

local Class = require(PATH .. ".lib.class")
local Base = require(PATH .. ".plugins.base")
local format = require(PATH .. ".utils").format
local wrapWith = require(PATH .. ".utils").wrapWith
local json = require(PATH .. ".lib.json")
local log = require(PATH .. ".lib.log")
local base64encode = require(PATH .. ".lib.base64").encode

--- "output" | "trace" | "error" | "feather:finish" | "feather:start" | "output" | "error"
---
--- trace | debug | info | warn | error | fatal

local types = {
  output = "debug",
  trace = "trace",
  error = "error",
  warn = "warn",
  fatal = "fatal",
  ["feather:finish"] = "info",
  ["feather:start"] = "info",
}
local LOGS_DIR = "logs"
local SCREENSHOTS_DIR = LOGS_DIR .. "/" .. "screenshots"

---@class FeatherLogger: FeatherPlugin
---@field feather table
---@field debug boolean
---@field wrapPrint boolean
---@field captureScreenshot boolean
---@field lastScreenshot any
---@field outfile string
---@field outputFolder string
---@field last_screenshot_taken_at number
---@field screenshotIndex number
---@field screenshotRate number
---@field screenshotPoolSize number
---@field last_log FeatherLine
---@field maxTempLogs number
---@field log fun(self: FeatherLogger, line: FeatherLine, screenshot?: boolean) Logs a line
---@field logger fun(self: FeatherLogger, ...: any)
---@field print fun(self: FeatherLogger, ...: any)
---@field clear fun(self: FeatherLogger)
---@field protected __countOnRepeat fun(self: FeatherLogger, type: LogType, ...: any)
---@field protected __onerror fun(self: FeatherLogger, msg: string, finish: boolean)
local FeatherLogger = Class({
  __includes = Base,
  init = function(self, config)
    self.feather = config
    self.debug = config.debug
    self.wrapPrint = config.wrapPrint
    self.maxTempLogs = config.maxTempLogs
    self.captureScreenshot = config.captureScreenshot
    self.writeToDisk = config.writeToDisk ~= false
    self.lastScreenshot = nil
    self.last_log = nil
    self.last_screenshot_taken_at = nil
    self.screenshotIndex = 1
    self.screenshotRate = config.screenshotRate or 1
    self.screenshotPoolSize = config.screenshotPoolSize or 60
    self.lastId = 0

    if self.writeToDisk then
      local cwd = love.filesystem.getSaveDirectory()

      love.filesystem.createDirectory(LOGS_DIR)

      love.filesystem.createDirectory(SCREENSHOTS_DIR)

      local logdir = cwd .. "/" .. LOGS_DIR
      self.outputFolder = logdir

      local logfile = logdir .. "/" .. os.date("%Y-%m-%d_%H:%M:%S") .. "_" .. config.outfile .. ".featherlog"

      log.info("Saving logs to " .. logfile)

      log.outfile = logfile
      log.usecolor = false

      self.outfile = logfile
    else
      self.outputFolder = ""
      self.outfile = ""
      log.outfile = nil
    end

    -- Wrap print
    if self.wrapPrint then
      local selfRef = self -- capture `self` to avoid upvalue issues

      print = function(...)
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
    self.lastScreenshot = nil
    return
  end

  local now = love.timer.getTime()

  if self.last_screenshot_taken_at and now - self.last_screenshot_taken_at < self.screenshotRate then
    return
  end

  self.last_screenshot_taken_at = now

  local selfRef = self
  love.graphics.captureScreenshot(function(imageData)
    local fileData = imageData:encode("png")
    local pngBytes = fileData:getString()
    selfRef.lastScreenshot = "data:image/png;base64," .. base64encode(pngBytes)
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
  local last = self.last_log
  if last and str == last.str then
    -- Update last line if this line is a duplicate of it
    last.time = os.time()
    last.count = last.count + 1
  else
    self:log({ type = type, str = str })
  end
end

---@alias LogType "output" | "trace" | "error" | "feather:finish" | "feather:start" | "fatal"
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

  if self.last_log and self.last_log.str == line.str then
    return
  end

  if screenshot and self.captureScreenshot then
    if not self.lastScreenshot then
      return
    end

    line.screenshot = self.lastScreenshot
  end

  self.lastId = self.lastId + 1
  line.id = tostring(self.lastId)
  line.time = os.time()
  line.count = 1

  -- Only capture traceback for errors (expensive)
  if line.type == "error" or line.type == "fatal" then
    line.trace = debug.traceback()
  end

  self.last_log = line

  local logType = types[line.type] or "debug"
  log[logType](json.encode(line))

  -- Non-blocking channel push; __sendWs is a no-op when not connected
  if self.feather then
    self.feather:__sendWs(json.encode({
      type = "log",
      session = self.feather.sessionId,
      data = line,
    }))
  end
end

function FeatherLogger:clear()
  self.logs = {}
end

function FeatherLogger:logger(...)
  self:log({ type = "output", str = format(...) })
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
