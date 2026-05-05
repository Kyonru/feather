local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")
local inspect = require(FEATHER_PATH .. ".lib.inspect")
local Base = require(FEATHER_PATH .. ".plugins.base")

---@class ConsolePlugin: FeatherPlugin
---@field maxCodeSize number
---@field instructionLimit number
---@field maxOutputSize number
---@field evalEnabled boolean
---@field sandbox boolean
local ConsolePlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.maxCodeSize = self.options.maxCodeSize or 20000
    self.instructionLimit = self.options.instructionLimit or 100000
    self.maxOutputSize = self.options.maxOutputSize or 100000
    self.evalEnabled = self.options.evalEnabled == true
    self.sandbox = self.options.sandbox ~= false -- default true
  end,
})

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
    feather:__sendWs(json.encode({
      type = "eval:response",
      session = feather.sessionId,
      id = msg and msg.id or nil,
      status = status,
      result = result,
      prints = prints or {},
    }))
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

function ConsolePlugin:getConfig()
  return {
    type = "console",
    icon = "terminal",
  }
end

return ConsolePlugin
