local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")
local inspect = require(FEATHER_PATH .. ".lib.inspect")
local Base = require(FEATHER_PATH .. ".core.base")

local function currentTime()
  if love and love.timer and love.timer.getTime then
    return love.timer.getTime()
  end
  return os.clock()
end

---@class ConsolePlugin: FeatherPlugin
---@field maxCodeSize number
---@field instructionLimit number
---@field maxOutputSize number
---@field evalEnabled boolean
---@field sandbox boolean
---@field toastDuration number
---@field showOverlay boolean
local ConsolePlugin = Class({
  __includes = Base,
  init = function(self, config)
    Base.init(self, config)
    self.logger = config.logger
    self.observer = config.observer
    self.maxCodeSize = self.options.maxCodeSize or 20000
    self.instructionLimit = self.options.instructionLimit or 100000
    self.maxOutputSize = self.options.maxOutputSize or 100000
    self.evalEnabled = self.options.evalEnabled == true
    self.sandbox = self.options.sandbox ~= false -- default true
    self.toast = nil
    self.toastDuration = self.options.toastDuration or 2.5
    self.showOverlay = self.options.showOverlay ~= false
  end,
})

function ConsolePlugin:showToast(kind, message)
  if not self.showOverlay then
    return
  end
  self.toast = {
    kind = kind or "info",
    message = tostring(message or ""),
    expiresAt = currentTime() + self.toastDuration,
  }
end

--- Build a sandbox environment that inherits all globals but captures print() output.
---@param prints table Array to collect print output into
---@return table env
local function makeSandboxEnv(prints)
  return setmetatable({
    print = function(...)
      local args = {}
      for i = 1, select("#", ...) do
        args[i] = tostring(select(i, ...))
      end
      table.insert(prints, table.concat(args, "\t"))
    end,
  }, { __index = _G })
end

--- Safely inspect a value with truncation.
---@param value any
---@param maxSize number
---@return string
local function safeInspect(value, maxSize)
  local ok, result = pcall(inspect, value)
  local text
  if ok then
    text = tostring(result)
  else
    text = tostring(value)
  end
  if #text > maxSize then
    text = string.sub(text, 1, maxSize) .. "...<truncated>"
  end
  return text
end

--- Pack variadic results with count.
local function pack(...)
  return { n = select("#", ...), ... }
end

--- Handle a cmd:eval message from the desktop console.
--- Called by init.lua when the console plugin is registered.
---@param msg table { code: string, id: string, apiKey?: string }
---@param feather Feather
function ConsolePlugin:handleEval(msg, feather)
  local function sendResponse(status, result, prints)
    if status == "success" then
      self:showToast("success", "Console eval executed")
    else
      self:showToast("error", "Console eval rejected")
    end

    local binaries = {}
    if feather.__maybeAttachText then
      if result ~= nil then
        local binary
        result, binary = feather:__maybeAttachText(result)
        if binary then
          binaries[#binaries + 1] = binary
        end
      end

      for i, value in ipairs(prints or {}) do
        local binary
        prints[i], binary = feather:__maybeAttachText(value)
        if binary then
          binaries[#binaries + 1] = binary
        end
      end
    end

    feather:__sendWs(json.encode({
      type = "eval:response",
      session = feather.sessionId,
      id = msg and msg.id or nil,
      status = status,
      result = result,
      prints = prints or {},
      binary = #binaries > 0 and binaries or nil,
    }))
    feather:__sendPendingBinaries()
  end

  -- Eval must be explicitly enabled.
  if self.evalEnabled ~= true then
    sendResponse("error", "Eval disabled", {})
    return
  end

  -- Require configured, non-empty apiKey and exact match.
  if type(feather.apiKey) ~= "string" or feather.apiKey == "" or msg.apiKey ~= feather.apiKey then
    sendResponse("error", "Unauthorized: invalid apiKey", {})
    return
  end

  if type(msg.code) ~= "string" then
    sendResponse("error", "Invalid eval payload: code must be a string", {})
    return
  end

  if #msg.code > self.maxCodeSize then
    sendResponse("error", "Eval code too large (max " .. self.maxCodeSize .. " chars)", {})
    return
  end

  local prints = {}

  -- Compile
  local fn, compileErr = loadstring(msg.code)
  if not fn then
    sendResponse("error", tostring(compileErr), prints)
    return
  end

  -- Sandbox: inherit _G but capture print()
  local origPrint
  if self.sandbox then
    local sandboxEnv = makeSandboxEnv(prints)
    setfenv(fn, sandboxEnv)
  else
    -- No sandbox: run in the game's real _G
    -- Still capture print() by temporarily replacing it
    origPrint = _G.print
    _G.print = function(...)
      local args = {}
      for i = 1, select("#", ...) do
        args[i] = tostring(select(i, ...))
      end
      table.insert(prints, table.concat(args, "\t"))
      origPrint(...)
    end
    setfenv(fn, _G)
  end

  -- Instruction-count hook to prevent infinite loops
  local limit = self.instructionLimit
  local function hook()
    error("eval instruction limit exceeded (" .. limit .. " instructions)", 2)
  end

  local function traceback(err)
    return debug.traceback(tostring(err), 2)
  end

  debug.sethook(hook, "", limit)
  local packedResults = pack(xpcall(fn, traceback))
  debug.sethook()

  -- Restore original print if we replaced it
  if origPrint then
    _G.print = origPrint
  end

  local ok = packedResults[1]
  if not ok then
    sendResponse("error", tostring(packedResults[2]), prints)
    return
  end

  -- Serialize return values
  local returnCount = packedResults.n - 1
  local resultStr

  if returnCount == 0 then
    resultStr = nil
  elseif returnCount == 1 then
    resultStr = safeInspect(packedResults[2], self.maxOutputSize)
  else
    local parts = {}
    for i = 1, returnCount do
      parts[i] = safeInspect(packedResults[i + 1], self.maxOutputSize)
    end
    resultStr = table.concat(parts, ", ")
  end

  sendResponse("success", resultStr, prints)
end

function ConsolePlugin:onDraw()
  local toast = self.toast
  if not toast or currentTime() >= toast.expiresAt then
    self.toast = nil
    return
  end
  if not love or not love.graphics then
    return
  end

  local g = love.graphics
  local width = g.getWidth and g.getWidth() or 800
  local font = g.getFont and g.getFont() or nil
  local message = toast.message
  local textWidth = math.min(width - 48, 420)
  local wrapped = { message }
  if font and font.getWrap then
    local _, lines = font:getWrap(message, textWidth - 24)
    wrapped = lines or wrapped
  end
  local lineHeight = font and font:getHeight() or 14
  local boxHeight = math.max(44, (#wrapped * lineHeight) + 22)
  local boxWidth = textWidth
  local x = math.max(12, width - boxWidth - 18)
  local y = 18

  local r, gc, b, a = g.getColor()
  local bg = toast.kind == "error" and { 0.35, 0.07, 0.08 }
    or toast.kind == "success" and { 0.25, 0.12, 0.5 }
    or { 0.12, 0.13, 0.18 }
  g.setColor(0, 0, 0, 0.35)
  g.rectangle("fill", x + 3, y + 4, boxWidth, boxHeight, 6, 6)
  g.setColor(bg[1], bg[2], bg[3], 0.92)
  g.rectangle("fill", x, y, boxWidth, boxHeight, 6, 6)
  g.setColor(1, 1, 1, 0.95)
  g.printf(message, x + 12, y + 11, boxWidth - 24, "left")
  g.setColor(r, gc, b, a)
end

function ConsolePlugin:getConfig()
  return {
    type = "console",
    icon = "terminal",
  }
end

return ConsolePlugin
