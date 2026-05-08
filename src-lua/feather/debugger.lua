local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")

---@class FeatherDebugger
---@field enabled boolean
---@field paused boolean
---@field breakpoints table  { [normalizedFile] = { [line] = { condition? } } }
---@field _stepMode string|nil  "over" | "into" | "out" | nil
---@field _stepDepth number
---@field _pauseDepth number
local FeatherDebugger = Class({})

function FeatherDebugger:init(feather)
  self.feather = feather
  self.enabled = false
  self.paused = false
  self.breakpoints = {}
  self._stepMode = nil
  self._stepDepth = 0
  self._pauseDepth = 0
end

function FeatherDebugger:enable()
  self.enabled = true
  self:_installHook()
end

function FeatherDebugger:disable()
  self.enabled = false
  self.paused = false
  debug.sethook()
end

--- Replace all breakpoints from a list sent by the desktop.
---@param bps table  array of { file, line, condition? }
function FeatherDebugger:setBreakpoints(bps)
  self.breakpoints = {}
  print("[Feather:debugger] setBreakpoints: " .. #bps .. " breakpoint(s)")
  for _, bp in ipairs(bps) do
    local file = self:_normalizeFile(bp.file)
    -- JSON numbers arrive as floats in Lua 5.4; coerce to integer so table
    -- key matches the integer line number returned by debug.getinfo.
    local line = math.floor(bp.line)
    if not self.breakpoints[file] then
      self.breakpoints[file] = {}
    end
    self.breakpoints[file][line] = { condition = bp.condition }
    print("[Feather:debugger]   " .. file .. ":" .. line)
  end
end

--- Resume execution after a pause.
---@param mode string|nil  nil = continue, "over" | "into" | "out" = step
function FeatherDebugger:resume(mode)
  self._stepMode = mode
  if mode == "over" then
    self._stepDepth = self._pauseDepth
  elseif mode == "out" then
    self._stepDepth = self._pauseDepth
  else
    self._stepDepth = 0
  end

  -- Ensure hook is active for step modes (continue keeps it for future breakpoints)
  if not self.enabled then
    self:_installHook()
  end

  self.feather:__sendWs(json.encode({
    type = "debugger:resumed",
    session = self.feather.sessionId,
    data = { reason = mode and "step" or "continue" },
  }))

  self.paused = false
end

function FeatherDebugger:_normalizeFile(path)
  if not path then return "" end
  -- debug.getinfo returns "@filename" for real files; strip the leading "@"
  if path:sub(1, 1) == "@" then
    path = path:sub(2)
  end
  -- LÖVE often prepends "./" to source paths; strip it for consistent matching
  if path:sub(1, 2) == "./" then
    path = path:sub(3)
  end
  return path
end

function FeatherDebugger:_countDepth()
  local depth = 0
  local l = 3 -- skip getinfo + this function
  while debug.getinfo(l, "S") do
    depth = depth + 1
    l = l + 1
    if l > 40 then break end
  end
  return depth
end

function FeatherDebugger:_getLocals(hookLevel)
  local locals = {}
  local i = 1
  while true do
    local name, value = debug.getlocal(hookLevel, i)
    if not name then break end
    if name:sub(1, 1) ~= "(" then
      locals[name] = self:_serializeValue(value, 0)
    end
    i = i + 1
  end
  return locals
end

function FeatherDebugger:_getUpvalues(fn)
  local upvalues = {}
  if not fn then return upvalues end
  local i = 1
  while true do
    local name, value = debug.getupvalue(fn, i)
    if not name then break end
    upvalues[name] = self:_serializeValue(value, 0)
    i = i + 1
  end
  return upvalues
end

function FeatherDebugger:_serializeValue(v, depth)
  local t = type(v)
  if t == "nil" then
    return "nil"
  elseif t == "boolean" then
    return tostring(v)
  elseif t == "number" then
    return tostring(v)
  elseif t == "string" then
    if #v > 80 then
      return string.format("%q", v:sub(1, 80)) .. "…"
    end
    return string.format("%q", v)
  elseif t == "table" then
    if depth >= 1 then
      local count = 0
      for _ in pairs(v) do count = count + 1 end
      return string.format("table {%d}", count)
    end
    -- Shallow expand one level
    local parts = {}
    local count = 0
    for k, val in pairs(v) do
      count = count + 1
      if count > 16 then
        table.insert(parts, "…")
        break
      end
      local ks = type(k) == "string" and k or ("[" .. tostring(k) .. "]")
      table.insert(parts, ks .. " = " .. self:_serializeValue(val, depth + 1))
    end
    return "{" .. table.concat(parts, ", ") .. "}"
  elseif t == "function" then
    local info = debug.getinfo(v, "S")
    if info then
      return string.format("fn @ %s:%d", info.short_src or "?", info.linedefined or 0)
    end
    return "function"
  elseif t == "userdata" or t == "thread" then
    return t .. ": " .. tostring(v)
  else
    return tostring(v)
  end
end

function FeatherDebugger:_getStack()
  local stack = {}
  -- Level 2 inside the hook is the interrupted function; walk up from there
  -- We build the stack from the hook perspective (+2 for hook internals)
  local base = 2
  for i = base, base + 24 do
    local info = debug.getinfo(i, "Sln")
    if not info then break end
    if info.what ~= "C" then
      table.insert(stack, {
        file = self:_normalizeFile(info.short_src or "?"),
        line = info.currentline or 0,
        name = info.name or info.what or "?",
        what = info.what,
      })
    end
  end
  return stack
end

function FeatherDebugger:_installHook()
  local selfRef = self
  local _seenFiles = {}  -- print each unique file once so the console isn't flooded
  debug.sethook(function(event, line)
    if not selfRef.enabled then return end
    if event ~= "line" then return end

    local info = debug.getinfo(2, "Sl")
    if not info then return end

    local src = selfRef:_normalizeFile(info.short_src or "")

    if not _seenFiles[src] then
      _seenFiles[src] = true
      print("[Feather:debugger] hook sees file: " .. src)
    end
    local shouldPause = false
    local reason = "breakpoint"

    -- Check static breakpoints
    local fileBps = selfRef.breakpoints[src]
    if fileBps and fileBps[line] then
      local bp = fileBps[line]
      if bp.condition and #bp.condition > 0 then
        local fn = load("return " .. bp.condition)
        if fn then
          local ok, result = pcall(fn)
          shouldPause = ok and result
        end
      else
        shouldPause = true
      end
    end

    -- Check step mode (only compute depth when needed)
    if not shouldPause and selfRef._stepMode then
      local depth = selfRef:_countDepth()
      reason = "step"
      if selfRef._stepMode == "into" then
        shouldPause = true
      elseif selfRef._stepMode == "over" then
        shouldPause = depth <= selfRef._stepDepth
      elseif selfRef._stepMode == "out" then
        shouldPause = depth < selfRef._stepDepth
      end
    end

    if shouldPause then
      selfRef._stepMode = nil
      selfRef._stepDepth = 0
      selfRef:_doPause(info, line, reason)
    end
  end, "l")
end

function FeatherDebugger:_doPause(info, line, reason)
  -- Push time-travel frames to the desktop so the user can scrub the history
  -- leading up to this breakpoint without having to manually request them.
  local ttPlugin = self.feather.pluginManager:getPlugin("time-travel")
  if ttPlugin and ttPlugin.instance._bufCount > 0 then
    ttPlugin.instance:sendFrames({}, self.feather)
  end

  -- Snapshot call depth for step-over / step-out calculations on resume
  self._pauseDepth = self:_countDepth()

  -- Locals: level 2 is the interrupted function from inside the hook
  local locals = self:_getLocals(2)
  local upvalues = {}
  local funcInfo = debug.getinfo(2, "f")
  if funcInfo and funcInfo.func then
    upvalues = self:_getUpvalues(funcInfo.func)
  end

  local stack = self:_getStack()

  self.paused = true
  self.feather:__sendWs(json.encode({
    type = "debugger:paused",
    session = self.feather.sessionId,
    data = {
      file = self:_normalizeFile(info.short_src or ""),
      line = line,
      reason = reason,
      stack = stack,
      locals = locals,
      upvalues = upvalues,
    },
  }))

  -- Block the game loop — keep pumping WS so commands can arrive
  local socket = require("socket")
  while self.paused do
    if self.feather.wsClient then
      pcall(function() self.feather.wsClient:update() end)
    end
    socket.sleep(0.005)
  end
end

return FeatherDebugger
