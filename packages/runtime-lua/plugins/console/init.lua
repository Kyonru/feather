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
---@field resultCache table
---@field pins table
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
    self.resultCache = {}
    self.resultOrder = {}
    self.nextResultId = 0
    self.resultTtl = self.options.resultTtl or 120
    self.maxResultHandles = self.options.maxResultHandles or 40
    self.inspectFieldLimit = self.options.inspectFieldLimit or 40
    self.pins = {}
    self.nextPinId = 0
    self.pinInterval = self.options.pinInterval or 0.25
    self.pinElapsed = 0
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

local function valueTypeName(value)
  local kind = type(value)
  if kind == "userdata" or kind == "table" then
    local ok, result = pcall(function()
      if value and value.getType then
        return value:getType()
      end
      return nil
    end)
    if ok and result then
      return tostring(result)
    end
  end
  return kind
end

local function tableCount(value, limit)
  local count = 0
  for _, _ in pairs(value) do
    count = count + 1
    if count > limit then
      return count, true
    end
  end
  return count, false
end

function ConsolePlugin:_trimResultCache()
  local now = currentTime()
  local nextOrder = {}
  for _, id in ipairs(self.resultOrder) do
    local entry = self.resultCache[id]
    if entry and entry.expiresAt > now then
      nextOrder[#nextOrder + 1] = id
    else
      self.resultCache[id] = nil
    end
  end
  self.resultOrder = nextOrder
  while #self.resultOrder > self.maxResultHandles do
    local id = table.remove(self.resultOrder, 1)
    self.resultCache[id] = nil
  end
end

function ConsolePlugin:_storeResult(value)
  self:_trimResultCache()
  self.nextResultId = self.nextResultId + 1
  local id = "r" .. tostring(self.nextResultId)
  self.resultCache[id] = {
    value = value,
    expiresAt = currentTime() + self.resultTtl,
  }
  self.resultOrder[#self.resultOrder + 1] = id
  self:_trimResultCache()
  return id
end

function ConsolePlugin:_inspectValue(value, maxSize, path)
  local kind = type(value)
  local preview = safeInspect(value, math.min(maxSize or self.maxOutputSize, 1200))
  local result = {
    type = kind,
    typeName = valueTypeName(value),
    summary = kind == "table" and "table" or tostring(value),
    preview = preview,
    expandable = kind == "table",
    path = path or {},
  }

  if kind == "table" then
    local count, truncated = tableCount(value, self.inspectFieldLimit)
    result.summary = "table (" .. tostring(count) .. (truncated and "+" or "") .. " fields)"
    result.handle = self:_storeResult(value)
    result.fields = {}
    local seen = 0
    for key, fieldValue in pairs(value) do
      seen = seen + 1
      if seen > self.inspectFieldLimit then
        result.truncated = true
        break
      end
      local keyText = tostring(key)
      local fieldKind = type(fieldValue)
      local fieldPath = {}
      for i, segment in ipairs(path or {}) do
        fieldPath[i] = segment
      end
      fieldPath[#fieldPath + 1] = keyText
      result.fields[#result.fields + 1] = {
        key = keyText,
        keyType = type(key),
        type = fieldKind,
        typeName = valueTypeName(fieldValue),
        summary = fieldKind == "table" and "table" or tostring(fieldValue),
        preview = safeInspect(fieldValue, 300),
        expandable = fieldKind == "table",
        path = fieldPath,
      }
    end
    table.sort(result.fields, function(a, b)
      return tostring(a.key) < tostring(b.key)
    end)
  elseif kind == "userdata" then
    result.expandable = false
    result.summary = valueTypeName(value)
  end

  return result
end

function ConsolePlugin:_inspectPath(handle, path)
  self:_trimResultCache()
  local entry = self.resultCache[handle]
  if not entry then
    return nil, "Result handle expired or unavailable"
  end
  local value = entry.value
  for _, segment in ipairs(path or {}) do
    if type(value) ~= "table" then
      return nil, "Cannot inspect inside " .. type(value)
    end
    local found = false
    for key, fieldValue in pairs(value) do
      if tostring(key) == tostring(segment) then
        value = fieldValue
        found = true
        break
      end
    end
    if not found then
      return nil, "Path not found: " .. tostring(segment)
    end
  end
  return self:_inspectValue(value, self.maxOutputSize, path or {}), nil
end

local function hasReadOnlyMutation(code)
  local stripped = tostring(code or "")
  stripped = stripped:gsub("%-%-%[%[.-%]%]", " ")
  stripped = stripped:gsub("%-%-[^\n]*", " ")
  stripped = stripped:gsub("%[%[.-%]%]", "\"\"")
  stripped = stripped:gsub('"(.-)"', "\"\"")
  stripped = stripped:gsub("'(.-)'", "''")

  local blockedCalls = {
    "rawset",
    "setmetatable",
    "table.insert",
    "table.remove",
    "table.sort",
    "love.filesystem.write",
    "love.filesystem.remove",
    "love.filesystem.createDirectory",
  }
  for _, name in ipairs(blockedCalls) do
    local escaped = name:gsub("%.", "%%.")
    if stripped:match("%f[%w_]" .. escaped .. "%s*%(") then
      return true, "Read-only guardrails blocked mutation call: " .. name
    end
  end

  if stripped:match("[^=<>~]=[^=]") then
    return true, "Read-only guardrails block assignment statements"
  end

  return false, nil
end

--- Pack variadic results with count.
local function pack(...)
  return { n = select("#", ...), ... }
end

local function sortedGlobalKeys(limit)
  limit = limit or 500
  local names = {}
  for key, _ in pairs(_G) do
    if type(key) == "string" then
      names[#names + 1] = key
    end
  end
  table.sort(names)

  local globals = {}
  for i = 1, math.min(#names, limit) do
    local name = names[i]
    globals[#globals + 1] = {
      name = name,
      type = type(_G[name]),
    }
  end

  return globals
end

function ConsolePlugin:sendGlobals(feather)
  feather:__sendWs(json.encode({
    type = "console:globals",
    session = feather.sessionId,
    data = {
      ok = true,
      globals = sortedGlobalKeys(self.options.globalLimit or 500),
    },
  }))
end

function ConsolePlugin:sendPins(feather)
  local pins = {}
  for _, pin in ipairs(self.pins) do
    pins[#pins + 1] = {
      id = pin.id,
      name = pin.name,
      expression = pin.expression,
      enabled = pin.enabled ~= false,
      status = pin.status,
      error = pin.error,
      value = pin.value,
      updatedAt = pin.updatedAt,
    }
  end
  feather:__sendWs(json.encode({
    type = "console:pins",
    session = feather.sessionId,
    data = { ok = true, pins = pins },
  }))
end

function ConsolePlugin:sendPinsError(feather, errorMessage)
  feather:__sendWs(json.encode({
    type = "console:pins",
    session = feather.sessionId,
    data = {
      ok = false,
      pins = {},
      error = errorMessage,
    },
  }))
end

function ConsolePlugin:sendInspectResult(msg, feather)
  local data = msg.data or {}
  local value, err = self:_inspectPath(data.handle, data.path or {})
  feather:__sendWs(json.encode({
    type = "console:inspect_result",
    session = feather.sessionId,
    data = {
      ok = value ~= nil,
      id = data.id,
      handle = data.handle,
      path = data.path or {},
      value = value,
      error = err,
    },
  }))
end

function ConsolePlugin:addPin(msg, feather)
  local data = msg.data or {}
  if self.evalEnabled ~= true then
    self:sendPinsError(feather, "Eval disabled")
    return
  end
  if type(feather.apiKey) ~= "string" or feather.apiKey == "" or msg.apiKey ~= feather.apiKey then
    self:sendPinsError(feather, "Unauthorized: invalid apiKey")
    return
  end
  if type(data.expression) ~= "string" or data.expression == "" then
    self:sendPins(feather)
    return
  end
  self.nextPinId = self.nextPinId + 1
  local pin = {
    id = data.id or ("pin-" .. tostring(self.nextPinId)),
    name = data.name or ("pin-" .. tostring(self.nextPinId)),
    expression = data.expression,
    enabled = data.enabled ~= false,
  }
  self.pins[#self.pins + 1] = pin
  self:_refreshPin(pin)
  self:sendPins(feather)
end

function ConsolePlugin:removePin(msg, feather)
  local data = msg.data or {}
  local nextPins = {}
  for _, pin in ipairs(self.pins) do
    if pin.id ~= data.id then
      nextPins[#nextPins + 1] = pin
    end
  end
  self.pins = nextPins
  self:sendPins(feather)
end

function ConsolePlugin:_evaluateExpression(expression)
  local prints = {}
  local fn, compileErr = loadstring("return " .. tostring(expression or ""))
  if not fn then
    return false, tostring(compileErr)
  end
  setfenv(fn, makeSandboxEnv(prints))
  local ok, result = pcall(fn)
  if not ok then
    return false, tostring(result)
  end
  return true, result
end

function ConsolePlugin:_refreshPin(pin)
  if not pin or pin.enabled == false then
    return
  end
  local ok, value = self:_evaluateExpression(pin.expression)
  pin.updatedAt = currentTime()
  if ok then
    pin.status = "ok"
    pin.error = nil
    pin.value = safeInspect(value, self.maxOutputSize)
    if self.observer and self.observer.observe then
      self.observer:observe("console." .. tostring(pin.name), value)
    end
  else
    pin.status = "error"
    pin.error = tostring(value)
    pin.value = nil
    if self.observer and self.observer.observe then
      self.observer:observe("console." .. tostring(pin.name), "ERROR: " .. tostring(value))
    end
  end
end

--- Handle a cmd:eval message from the desktop console.
--- Called by init.lua when the console plugin is registered.
---@param msg table { code: string, id: string, apiKey?: string }
---@param feather Feather
function ConsolePlugin:handleEval(msg, feather)
  local function sendResponse(status, result, prints, values)
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
      values = values,
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

  if msg.readOnly == true then
    local blocked, reason = hasReadOnlyMutation(msg.code)
    if blocked then
      sendResponse("error", reason .. ". This is a best-effort guardrail, not a true dry run.", prints)
      return
    end
  end

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
  local values = {}

  if returnCount == 0 then
    resultStr = nil
  elseif returnCount == 1 then
    resultStr = safeInspect(packedResults[2], self.maxOutputSize)
    values[1] = self:_inspectValue(packedResults[2], self.maxOutputSize, {})
  else
    local parts = {}
    for i = 1, returnCount do
      parts[i] = safeInspect(packedResults[i + 1], self.maxOutputSize)
      values[i] = self:_inspectValue(packedResults[i + 1], self.maxOutputSize, {})
    end
    resultStr = table.concat(parts, ", ")
  end

  sendResponse("success", resultStr, prints, values)
end

function ConsolePlugin:update(dt)
  self.pinElapsed = (self.pinElapsed or 0) + (dt or 0)
  if self.pinElapsed < self.pinInterval then
    return
  end
  self.pinElapsed = 0
  for _, pin in ipairs(self.pins) do
    self:_refreshPin(pin)
  end
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
