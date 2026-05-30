local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")

-- Capture this file's source path at load time so we can strip Feather-internal
-- frames from stack walks regardless of level arithmetic.
local _SELF_SRC = debug.getinfo(1, "S").source

---@class FeatherDebugger
---@field enabled boolean
---@field paused boolean
---@field breakpoints table  { [normalizedFile] = { [line] = { condition? } } }
---@field profilerProbes table  { [normalizedFile] = { [line] = { kind, label? } } }
---@field pauseOnError boolean
---@field _stepMode string|nil  "over" | "into" | "out" | nil
---@field _stepDepth number
---@field _pauseDepth number
local FeatherDebugger = Class({})

function FeatherDebugger:init(feather)
  self.feather = feather
  self.enabled = false
  self.paused = false
  self.breakpoints = {}
  self.profilerProbes = {}
  self.normalizedBreakpoints = {}
  self.normalizedProfilerProbes = {}
  self.rejectedBreakpoints = {}
  self.rejectedProfilerProbes = {}
  self.breakpointErrors = {}
  self.pauseOnError = false
  self.pauseId = 0
  self._pausedFrames = {}
  self.sourceRoot = os.getenv("FEATHER_GAME_PATH")
  self.shimRoot = os.getenv("FEATHER_SHIM_PATH")
  self._stepMode = nil
  self._stepDepth = 0
  self._pauseDepth = 0
end

function FeatherDebugger:enable()
  self.enabled = true
  self:_installHook()
  self:sendStatus()
end

function FeatherDebugger:disable()
  self.enabled = false
  self.paused = false
  debug.sethook()
  self:sendStatus()
end

local function isProfilerProbeKind(kind)
  return kind == "start" or kind == "stop" or kind == "snapshot" or kind == "wrap"
end

--- Replace all breakpoints from a list sent by the desktop.
---@param bps table  array of { file, line, condition? }
function FeatherDebugger:setBreakpoints(bps)
  self.breakpoints = {}
  self.normalizedBreakpoints = {}
  self.rejectedBreakpoints = {}
  print("[Feather:debugger] setBreakpoints: " .. #bps .. " breakpoint(s)")
  for _, bp in ipairs(bps) do
    local file = self:_normalizeFile(bp.file)
    -- JSON numbers arrive as floats in Lua 5.4; coerce to integer so table
    -- key matches the integer line number returned by debug.getinfo.
    local line = tonumber(bp.line) and math.floor(bp.line) or nil
    if not file or file == "" or not line or line < 1 then
      self.rejectedBreakpoints[#self.rejectedBreakpoints + 1] = {
        file = bp.file,
        line = bp.line,
        reason = "invalid breakpoint",
      }
    else
      if not self.breakpoints[file] then
        self.breakpoints[file] = {}
      end
      self.breakpoints[file][line] = { condition = bp.condition }
      self.normalizedBreakpoints[#self.normalizedBreakpoints + 1] = {
        file = file,
        line = line,
        condition = bp.condition,
      }
      print("[Feather:debugger]   " .. file .. ":" .. line)
    end
  end
  self:sendStatus()
end

--- Replace all profiler probes from a list sent by the desktop.
---@param probes table  array of { file, line, kind, label?, target? }
function FeatherDebugger:setProfilerProbes(probes)
  self.profilerProbes = {}
  self.normalizedProfilerProbes = {}
  self.rejectedProfilerProbes = {}
  local wrapCandidates = {}
  print("[Feather:debugger] setProfilerProbes: " .. #probes .. " probe(s)")
  for _, probe in ipairs(probes) do
    local file = self:_normalizeFile(probe.file)
    local line = tonumber(probe.line) and math.floor(probe.line) or nil
    local kind = tostring(probe.kind or "")
    local target = type(probe.target) == "string" and probe.target:gsub(":", "."):gsub("^%s+", ""):gsub("%s+$", "") or nil
    if not file or file == "" or not line or line < 1 or not isProfilerProbeKind(kind) then
      self.rejectedProfilerProbes[#self.rejectedProfilerProbes + 1] = {
        file = probe.file,
        line = probe.line,
        kind = probe.kind,
        label = probe.label,
        target = probe.target,
        reason = "invalid profiler probe",
      }
    elseif kind == "wrap" and (not target or target == "") then
      self.rejectedProfilerProbes[#self.rejectedProfilerProbes + 1] = {
        file = probe.file,
        line = probe.line,
        kind = probe.kind,
        label = probe.label,
        target = probe.target,
        reason = "invalid target",
      }
    else
      local normalized = {
        file = file,
        line = line,
        kind = kind,
        label = probe.label,
        target = target,
      }
      if kind == "wrap" then
        wrapCandidates[#wrapCandidates + 1] = normalized
      else
        if not self.profilerProbes[file] then
          self.profilerProbes[file] = {}
        end
        self.profilerProbes[file][line] = {
          kind = kind,
          label = probe.label,
        }
        self.normalizedProfilerProbes[#self.normalizedProfilerProbes + 1] = normalized
        print("[Feather:debugger]   profiler " .. kind .. " " .. file .. ":" .. line)
      end
    end
  end

  local wrapErrorsByTarget = {}
  if self.feather and self.feather.profiler then
    for _, errorInfo in ipairs(self.feather.profiler:reconcileWrappedTargets(wrapCandidates)) do
      wrapErrorsByTarget[errorInfo.target] = errorInfo
      self.rejectedProfilerProbes[#self.rejectedProfilerProbes + 1] = errorInfo
    end
  elseif #wrapCandidates > 0 then
    for _, candidate in ipairs(wrapCandidates) do
      wrapErrorsByTarget[candidate.target] = {
        file = candidate.file,
        line = candidate.line,
        kind = candidate.kind,
        label = candidate.label,
        target = candidate.target,
        reason = "profiler unavailable",
      }
      self.rejectedProfilerProbes[#self.rejectedProfilerProbes + 1] = wrapErrorsByTarget[candidate.target]
    end
  end

  for _, candidate in ipairs(wrapCandidates) do
    if not wrapErrorsByTarget[candidate.target] then
      self.normalizedProfilerProbes[#self.normalizedProfilerProbes + 1] = candidate
      print("[Feather:debugger]   profiler wrap " .. candidate.target .. " from " .. candidate.file .. ":" .. candidate.line)
    end
  end
  self:sendStatus()
end

function FeatherDebugger:setOptions(options)
  options = options or {}
  if options.pauseOnError ~= nil then
    self.pauseOnError = options.pauseOnError == true
  end
  self:sendStatus()
end

function FeatherDebugger:statusBody()
  return {
    enabled = self.enabled,
    paused = self.paused,
    pauseOnError = self.pauseOnError,
    sourceRoot = self.sourceRoot,
    breakpointCount = #self.normalizedBreakpoints,
    breakpoints = self.normalizedBreakpoints,
    rejectedBreakpoints = self.rejectedBreakpoints,
    breakpointErrors = self.breakpointErrors,
    profilerProbeCount = #self.normalizedProfilerProbes,
    profilerProbes = self.normalizedProfilerProbes,
    rejectedProfilerProbes = self.rejectedProfilerProbes,
  }
end

function FeatherDebugger:sendStatus()
  if not self.feather or not self.feather.__sendWs then
    return
  end
  self.feather:__sendWs(json.encode({
    type = "debugger:status",
    session = self.feather.sessionId,
    data = self:statusBody(),
  }))
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
  self._pausedFrames = {}
  self:sendStatus()
end

function FeatherDebugger:_normalizeFile(path)
  if not path then
    return ""
  end
  -- debug.getinfo returns "@filename" for real files; strip the leading "@"
  if path:sub(1, 1) == "@" then
    path = path:sub(2)
  end
  path = path:gsub("\\", "/")
  -- LÖVE often prepends "./" to source paths; strip it for consistent matching
  if path:sub(1, 2) == "./" then
    path = path:sub(3)
  end
  local shimRoot = self.shimRoot
  if type(shimRoot) == "string" and shimRoot ~= "" then
    shimRoot = shimRoot:gsub("\\", "/"):gsub("/+$", "")
    local prefix = shimRoot .. "/"
    if path:sub(1, #prefix) == prefix then
      path = path:sub(#prefix + 1)
    end
  end
  local sourceRoot = self.sourceRoot
  if type(sourceRoot) == "string" and sourceRoot ~= "" then
    sourceRoot = sourceRoot:gsub("\\", "/"):gsub("/+$", "")
    if path == sourceRoot then
      return "."
    end
    local prefix = sourceRoot .. "/"
    if path:sub(1, #prefix) == prefix then
      path = path:sub(#prefix + 1)
    end
  end
  -- Feather renames main.lua to .feather-main.lua during injection; remap so
  -- breakpoints set on main.lua match the executing file.
  if path == ".feather-main.lua" then
    return "main.lua"
  end
  return path
end

function FeatherDebugger:_countDepth(startAt)
  local depth = 0
  local l = startAt or 3 -- default: called directly from hook (skip _countDepth + hook)
  while debug.getinfo(l, "S") do
    depth = depth + 1
    l = l + 1
    if l > 40 then
      break
    end
  end
  return depth
end

function FeatherDebugger:_getLocals(hookLevel)
  local locals = {}
  local i = 1
  while true do
    local name, value = debug.getlocal(hookLevel, i)
    if not name then
      break
    end
    if name:sub(1, 1) ~= "(" then
      locals[name] = self:_serializeValue(value, 0, {})
    end
    i = i + 1
  end
  return locals
end

function FeatherDebugger:_getUpvalues(fn)
  local upvalues = {}
  if not fn then
    return upvalues
  end
  local i = 1
  while true do
    local name, value = debug.getupvalue(fn, i)
    if not name then
      break
    end
    upvalues[name] = self:_serializeValue(value, 0, {})
    i = i + 1
  end
  return upvalues
end

function FeatherDebugger:_serializeValue(v, depth, seen)
  local t = type(v)
  if t == "nil" then
    return "nil"
  elseif t == "boolean" then
    return tostring(v)
  elseif t == "number" then
    return tostring(v)
  elseif t == "string" then
    return string.format("%q", v)
  elseif t == "table" then
    seen = seen or {}
    if seen[v] then
      return "<cycle>"
    end
    if depth >= 3 then
      local count = 0
      for _ in pairs(v) do
        count = count + 1
      end
      return string.format("table {%d}", count)
    end

    seen[v] = true
    local parts = {}
    local count = 0
    for k, val in pairs(v) do
      count = count + 1
      if count > 32 then
        table.insert(parts, "…")
        break
      end
      local ks = type(k) == "string" and k or ("[" .. tostring(k) .. "]")
      table.insert(parts, ks .. " = " .. self:_serializeValue(val, depth + 1, seen))
    end
    seen[v] = nil
    return "{" .. table.concat(parts, ", ") .. "}"
  elseif t == "function" then
    local info = debug.getinfo(v, "S")
    if info then
      return string.format("fn @ %s:%d", info.source or info.short_src or "?", info.linedefined or 0)
    end
    return "function"
  elseif t == "userdata" or t == "thread" then
    return t .. ": " .. tostring(v)
  else
    return tostring(v)
  end
end

function FeatherDebugger:_attachTextValues(values)
  local attached = {}
  local binaries = {}

  for key, value in pairs(values or {}) do
    local nextValue = value
    local binary
    if self.feather.__maybeAttachText then
      nextValue, binary = self.feather:__maybeAttachText(value)
    end
    attached[key] = nextValue
    if binary then
      binaries[#binaries + 1] = binary
    end
  end

  return attached, binaries
end

function FeatherDebugger:_sendBreakpointError(file, line, condition, err)
  local payload = {
    file = file,
    line = line,
    condition = condition,
    error = tostring(err),
  }
  self.breakpointErrors[#self.breakpointErrors + 1] = payload
  while #self.breakpointErrors > 20 do
    table.remove(self.breakpointErrors, 1)
  end
  self.feather:__sendWs(json.encode({
    type = "debugger:breakpoint_error",
    session = self.feather.sessionId,
    data = payload,
  }))
  self:sendStatus()
end

function FeatherDebugger:_captureFrames(startLevel)
  local frames = {}
  for i = startLevel, startLevel + 24 do
    local info = debug.getinfo(i, "Slnf")
    if not info then
      break
    end
    if info.what ~= "C" and info.source ~= _SELF_SRC then
      local locals = self:_getLocals(i)
      local upvalues = {}
      if info.func then
        upvalues = self:_getUpvalues(info.func)
      end
      local localBinaries
      local upvalueBinaries
      locals, localBinaries = self:_attachTextValues(locals)
      upvalues, upvalueBinaries = self:_attachTextValues(upvalues)
      frames[#frames + 1] = {
        index = #frames,
        file = self:_normalizeFile(info.source or info.short_src or "?"),
        line = info.currentline or 0,
        name = info.name or info.what or "?",
        what = info.what,
        locals = locals,
        upvalues = upvalues,
        binary = { localBinaries = localBinaries, upvalueBinaries = upvalueBinaries },
      }
    end
  end
  return frames
end

function FeatherDebugger:inspectFrame(index)
  index = tonumber(index) or 0
  local frame = self._pausedFrames[index + 1]
  if not frame then
    return
  end
  local binaries = {}
  if frame.binary then
    for _, binary in ipairs(frame.binary.localBinaries or {}) do
      binaries[#binaries + 1] = binary
    end
    for _, binary in ipairs(frame.binary.upvalueBinaries or {}) do
      binaries[#binaries + 1] = binary
    end
  end
  self.feather:__sendWs(json.encode({
    type = "debugger:frame",
    session = self.feather.sessionId,
    data = {
      pauseId = self.pauseId,
      index = frame.index,
      file = frame.file,
      line = frame.line,
      locals = frame.locals,
      upvalues = frame.upvalues,
      binary = #binaries > 0 and binaries or nil,
    },
  }))
  self.feather:__sendPendingBinaries()
end

function FeatherDebugger:_getStack()
  local stack = {}
  -- Call chain: _getStack(1) → _doPause(2) → hook closure(3) → game code(4)
  -- Start at 4 to skip all Feather-internal frames; also filter by source as a
  -- safety net in case the chain depth shifts (e.g. pcall wrapping).
  for i = 4, 28 do
    local info = debug.getinfo(i, "Sln")
    if not info then
      break
    end
    if info.what ~= "C" and info.source ~= _SELF_SRC then
      table.insert(stack, {
        index = #stack,
        file = self:_normalizeFile(info.source or info.short_src or "?"),
        line = info.currentline or 0,
        name = info.name or info.what or "?",
        what = info.what,
      })
    end
  end
  return stack
end

function FeatherDebugger:_runProfilerProbe(src, line)
  local fileProbes = self.profilerProbes[src]
  local probe = fileProbes and fileProbes[line]
  if not probe then
    return
  end

  local profiler = self.feather and self.feather.profiler
  if not profiler then
    return
  end

  if probe.kind == "start" then
    profiler:start()
  elseif probe.kind == "stop" then
    profiler:stop()
  elseif probe.kind == "snapshot" then
    profiler:snapshot(probe.label or "Debugger probe")
  else
    return
  end

  if self.feather.__pushProfiler then
    self.feather:__pushProfiler(true)
  end
end

function FeatherDebugger:_installHook()
  local selfRef = self
  local _seenFiles = {} -- print each unique file once so the console isn't flooded
  debug.sethook(function(event, line)
    if not selfRef.enabled then
      return
    end
    if event ~= "line" then
      return
    end

    local info = debug.getinfo(2, "Sl")
    if not info then
      return
    end

    local src = selfRef:_normalizeFile(info.source or info.short_src or "")

    if not _seenFiles[src] then
      _seenFiles[src] = true
    end
    local shouldPause = false
    local reason = "breakpoint"

    selfRef:_runProfilerProbe(src, line)

    -- Check static breakpoints
    local fileBps = selfRef.breakpoints[src]
    if fileBps and fileBps[line] then
      local bp = fileBps[line]
      if bp.condition and #bp.condition > 0 then
        -- Build an environment from locals + upvalues of the interrupted frame,
        -- falling back to _G so globals like math/love are still accessible.
        local env = setmetatable({}, { __index = _G })
        local li = 1
        while true do
          local name, value = debug.getlocal(2, li)
          if not name then
            break
          end
          if name:sub(1, 1) ~= "(" then
            env[name] = value
          end
          li = li + 1
        end
        local funcInfo = debug.getinfo(2, "f")
        if funcInfo and funcInfo.func then
          local ui = 1
          while true do
            local uname, uvalue = debug.getupvalue(funcInfo.func, ui)
            if not uname then
              break
            end
            env[uname] = uvalue
            ui = ui + 1
          end
        end
        local fn, loadErr = load("return " .. bp.condition, "=[condition]", "t", env)
        if fn then
          local ok, result = pcall(fn)
          if ok then
            shouldPause = result
          else
            selfRef:_sendBreakpointError(src, line, bp.condition, result)
          end
        else
          selfRef:_sendBreakpointError(src, line, bp.condition, loadErr)
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

function FeatherDebugger:_doPause(info, line, reason, errorInfo)
  -- Push time-travel frames to the desktop so the user can scrub the history
  -- leading up to this breakpoint without having to manually request them.
  local ttPlugin = self.feather.pluginManager:getPlugin("time-travel")
  if ttPlugin and ttPlugin.instance._bufCount > 0 then
    ttPlugin.instance:sendFrames({}, self.feather)
  end

  -- Snapshot call depth for step-over / step-out calculations on resume.
  -- Call chain here: _countDepth(1) → _doPause(2) → hook(3) → game code(4)
  self._pauseDepth = self:_countDepth(4)

  self.pauseId = self.pauseId + 1
  self._pausedFrames = self:_captureFrames(3)
  local firstFrame = self._pausedFrames[1] or { locals = {}, upvalues = {}, binary = {} }
  local locals = firstFrame.locals or {}
  local upvalues = firstFrame.upvalues or {}
  local stack = {}
  local binaries = {}
  for _, frame in ipairs(self._pausedFrames) do
    stack[#stack + 1] = {
      index = frame.index,
      file = frame.file,
      line = frame.line,
      name = frame.name,
      what = frame.what,
    }
  end
  if firstFrame.binary then
    for _, binary in ipairs(firstFrame.binary.localBinaries or {}) do
      binaries[#binaries + 1] = binary
    end
    for _, binary in ipairs(firstFrame.binary.upvalueBinaries or {}) do
      binaries[#binaries + 1] = binary
    end
  end

  self.paused = true
  self.feather:__sendWs(json.encode({
    type = "debugger:paused",
    session = self.feather.sessionId,
    data = {
      file = self:_normalizeFile(info.source or info.short_src or ""),
      line = line,
      reason = reason,
      pauseId = self.pauseId,
      error = errorInfo,
      stack = stack,
      locals = locals,
      upvalues = upvalues,
      binary = #binaries > 0 and binaries or nil,
    },
  }))
  self:sendStatus()
  self.feather:__sendPendingBinaries()

  -- Block the game loop — keep pumping WS so commands can arrive
  local socket = require("socket")
  while self.paused do
    if self.feather.wsClient then
      pcall(function()
        self.feather.wsClient:update()
      end)
    end
    socket.sleep(0.005)
  end
end

function FeatherDebugger:pauseOnCallbackError(callbackName, err)
  if not self.enabled or not self.pauseOnError then
    return
  end
  if not self.feather.wsClient then
    return
  end
  local info = debug.getinfo(3, "Sl") or { source = "?", short_src = "?", currentline = 0 }
  self:_doPause(info, info.currentline or 0, "exception", {
    callback = callbackName,
    message = tostring(err),
  })
end

return FeatherDebugger
