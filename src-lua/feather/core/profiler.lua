local Class = require(FEATHER_PATH .. ".lib.class")

local gettime
do
  local ok, socket = pcall(require, "socket")
  if ok and socket and socket.gettime then
    gettime = socket.gettime
  elseif love and love.timer then
    gettime = love.timer.getTime
  else
    gettime = os.clock
  end
end

local DEFAULT_PUSH_INTERVAL = 0.25

---@class FeatherProfilerEntry
---@field name string
---@field group string
---@field calls number
---@field totalTime number
---@field minTime number
---@field maxTime number
---@field depth number
---@field activeStart number|nil

---@class FeatherProfiler
---@field entries table<string, FeatherProfilerEntry>
---@field order string[]
---@field wrappers table<string, function>
---@field targetWrappers table<string, table>
---@field snapshots table[]
---@field recording boolean
---@field captureStartedAt number
---@field captureElapsed number
---@field pushInterval number
local FeatherProfiler = Class({
  init = function(self, config)
    config = config or {}
    self.entries = {}
    self.order = {}
    self.wrappers = {}
    self.targetWrappers = {}
    self.feather = config.feather
    self.snapshots = {}
    self.recording = false
    self.captureStartedAt = gettime()
    self.captureElapsed = 0
    self.pushInterval = config.pushInterval or DEFAULT_PUSH_INTERVAL
    self._dirty = true
    self._lastPushAt = 0
  end,
})

local function packResults(...)
  return { n = select("#", ...), ... }
end

local function unpackResults(results)
  return unpack(results, 1, results.n)
end

local function groupForName(name)
  local group = tostring(name):match("^([^%.:%s]+)[%.:]")
  return group or "ungrouped"
end

local function formatTime(seconds)
  if seconds == math.huge or seconds ~= seconds then
    return "-"
  end
  if seconds >= 1 then
    return string.format("%.3f s", seconds)
  elseif seconds >= 0.001 then
    return string.format("%.3f ms", seconds * 1000)
  end
  return string.format("%.1f us", seconds * 1000000)
end

function FeatherProfiler:_markDirty()
  self._dirty = true
end

function FeatherProfiler:_ensureEntry(name)
  name = tostring(name or "unnamed")
  if not self.entries[name] then
    self.entries[name] = {
      name = name,
      group = groupForName(name),
      calls = 0,
      totalTime = 0,
      minTime = math.huge,
      maxTime = 0,
      depth = 0,
      activeStart = nil,
    }
    self.order[#self.order + 1] = name
  end
  return self.entries[name]
end

function FeatherProfiler:_recordEntry(entry, elapsed)
  if not self.recording then
    return
  end

  entry.calls = entry.calls + 1
  entry.totalTime = entry.totalTime + elapsed
  if elapsed < entry.minTime then
    entry.minTime = elapsed
  end
  if elapsed > entry.maxTime then
    entry.maxTime = elapsed
  end
  self:_markDirty()
end

function FeatherProfiler:_makeWrapper(name, fn)
  local entry = self:_ensureEntry(name)

  return function(...)
    if not self.recording then
      return fn(...)
    end

    entry.depth = entry.depth + 1
    if entry.depth == 1 then
      entry.activeStart = gettime()
    end

    local args = packResults(...)
    local ok, results = xpcall(function()
      return packResults(fn(unpackResults(args)))
    end, debug.traceback)

    entry.depth = entry.depth - 1
    if entry.depth == 0 and entry.activeStart then
      local elapsed = gettime() - entry.activeStart
      entry.activeStart = nil
      self:_recordEntry(entry, elapsed)
    end

    if not ok then
      error(results, 0)
    end
    return unpackResults(results)
  end
end

--- Wrap a function for explicit profiling.
---@param name string
---@param fn function
---@return function
function FeatherProfiler:wrap(name, fn)
  if type(fn) ~= "function" then
    error("DEBUGGER.profiler:wrap(name, fn) expected fn to be a function", 2)
  end
  if self.wrappers[name] then
    return self.wrappers[name]
  end

  local wrapped = self:_makeWrapper(name, fn)
  self.wrappers[name] = wrapped
  return wrapped
end

local function parseTarget(target)
  if type(target) ~= "string" then
    return nil, "invalid target"
  end
  target = target:gsub(":", "."):gsub("^%s+", ""):gsub("%s+$", "")
  if target == "" or target:find("[^%w_%.]") then
    return nil, "invalid target"
  end

  local parts = {}
  for part in target:gmatch("[^%.]+") do
    if not part:match("^[A-Za-z_][A-Za-z0-9_]*$") then
      return nil, "invalid target"
    end
    parts[#parts + 1] = part
  end
  if #parts < 2 then
    return nil, "invalid target"
  end
  return target, parts
end

function FeatherProfiler:_resolveTarget(target)
  local normalized, partsOrReason = parseTarget(target)
  if not normalized then
    return nil, nil, nil, partsOrReason
  end

  local parts = partsOrReason
  local current
  local startIndex
  if parts[1] == "_G" then
    current = _G
    startIndex = 2
  else
    current = _G[parts[1]]
    startIndex = 2
  end

  for index = startIndex, #parts - 1 do
    if type(current) ~= "table" then
      return nil, nil, normalized, "target parent not table"
    end
    current = current[parts[index]]
  end

  if type(current) ~= "table" then
    return nil, nil, normalized, "target parent not table"
  end
  return current, parts[#parts], normalized
end

local function loveCallbackNameFromTarget(target)
  if type(target) ~= "string" then
    return nil
  end
  return target:match("^love%.([A-Za-z_][A-Za-z0-9_]*)$")
end

function FeatherProfiler:_managedLoveCallback(name)
  local feather = self.feather
  local pluginManager = feather and feather.pluginManager
  if not pluginManager or not pluginManager._loveCallbackWrappers then
    return nil
  end

  local callbackWrapper = pluginManager._loveCallbackWrappers[name]
  if not callbackWrapper or not love then
    return nil
  end

  return pluginManager, callbackWrapper
end

function FeatherProfiler:_wrapManagedLoveCallback(target, callbackName, label)
  local pluginManager, callbackWrapper = self:_managedLoveCallback(callbackName)
  if not pluginManager then
    return false, "target missing", target
  end

  pluginManager._loveCallbackOriginals = pluginManager._loveCallbackOriginals or {}

  local currentLoveCallback = love[callbackName]
  if currentLoveCallback ~= callbackWrapper then
    if type(currentLoveCallback) ~= "function" then
      return false, currentLoveCallback == nil and "target missing" or "target not function", target
    end
    pluginManager._loveCallbackOriginals[callbackName] = currentLoveCallback
    love[callbackName] = callbackWrapper
  end

  local current = pluginManager._loveCallbackOriginals[callbackName]
  local existing = self.targetWrappers[target]
  if existing and existing.mode == "love-callback" and current == existing.wrapper then
    return true, nil, target
  end
  if type(current) ~= "function" then
    return false, current == nil and "target missing" or "target not function", target
  end

  local name = tostring(label or target)
  local wrapper = self:_makeWrapper(name, current)
  pluginManager._loveCallbackOriginals[callbackName] = wrapper
  love[callbackName] = callbackWrapper
  self.targetWrappers[target] = {
    target = target,
    label = name,
    original = current,
    wrapper = wrapper,
    mode = "love-callback",
    callbackName = callbackName,
    callbackWrapper = callbackWrapper,
  }
  self:_markDirty()
  return true, nil, target
end

function FeatherProfiler:wrapTarget(target, label)
  local normalizedTarget, parseResult = parseTarget(target)
  if not normalizedTarget then
    return false, parseResult or "invalid target", target
  end

  local callbackName = loveCallbackNameFromTarget(normalizedTarget)
  if callbackName and self:_managedLoveCallback(callbackName) then
    return self:_wrapManagedLoveCallback(normalizedTarget, callbackName, label)
  end

  local parent, key, normalized, err = self:_resolveTarget(normalizedTarget)
  if not parent then
    return false, err or "invalid target", target
  end

  local current = parent[key]
  local existing = self.targetWrappers[normalized]
  if existing and current == existing.wrapper then
    return true, nil, normalized
  end
  if type(current) ~= "function" then
    return false, current == nil and "target missing" or "target not function", normalized
  end

  local name = tostring(label or normalized)
  local wrapper = self:_makeWrapper(name, current)
  parent[key] = wrapper
  self.targetWrappers[normalized] = {
    target = normalized,
    label = name,
    original = current,
    wrapper = wrapper,
  }
  self:_markDirty()
  return true, nil, normalized
end

function FeatherProfiler:unwrapTarget(target)
  local normalized = parseTarget(target)
  if not normalized then
    return false
  end

  local existing = self.targetWrappers[normalized]
  if not existing then
    return false
  end

  if existing.mode == "love-callback" then
    local pluginManager = self.feather and self.feather.pluginManager
    if
      pluginManager
      and pluginManager._loveCallbackOriginals
      and pluginManager._loveCallbackOriginals[existing.callbackName] == existing.wrapper
    then
      pluginManager._loveCallbackOriginals[existing.callbackName] = existing.original
    end
    if love and love[existing.callbackName] == existing.wrapper then
      love[existing.callbackName] = existing.original
    end
    self.targetWrappers[normalized] = nil
    self:_markDirty()
    return true
  end

  local parent, key = self:_resolveTarget(normalized)
  if parent and parent[key] == existing.wrapper then
    parent[key] = existing.original
  end
  self.targetWrappers[normalized] = nil
  self:_markDirty()
  return true
end

function FeatherProfiler:reconcileWrappedTargets(targets)
  targets = targets or {}
  local desired = {}
  local ordered = {}
  local errors = {}
  for _, targetInfo in ipairs(targets) do
    local target = targetInfo and targetInfo.target
    local normalized, reason = parseTarget(target)
    if normalized and not desired[normalized] then
      ordered[#ordered + 1] = normalized
    end
    if normalized then
      desired[normalized] = {
        target = normalized,
        label = targetInfo.label,
        file = targetInfo.file,
        line = targetInfo.line,
        kind = targetInfo.kind,
      }
    else
      errors[#errors + 1] = {
        target = tostring(target or ""),
        file = targetInfo and targetInfo.file,
        line = targetInfo and targetInfo.line,
        kind = "wrap",
        label = targetInfo and targetInfo.label,
        reason = reason or "invalid target",
      }
    end
  end

  for target in pairs(self.targetWrappers) do
    if not desired[target] then
      self:unwrapTarget(target)
    end
  end

  for _, target in ipairs(ordered) do
    local targetInfo = desired[target]
    local ok, err, normalized = self:wrapTarget(target, targetInfo.label)
    if not ok then
      errors[#errors + 1] = {
        target = normalized or target,
        file = targetInfo.file,
        line = targetInfo.line,
        kind = "wrap",
        label = targetInfo.label,
        reason = err or "target could not be wrapped",
      }
    end
  end
  return errors
end

---@param name string
---@return boolean
function FeatherProfiler:begin(name)
  if not self.recording then
    return false
  end
  local entry = self:_ensureEntry(name)
  entry.depth = entry.depth + 1
  if entry.depth == 1 then
    entry.activeStart = gettime()
  end
  return true
end

---@param name string
---@return boolean
function FeatherProfiler:finish(name)
  if not self.recording then
    return false
  end
  local entry = self.entries[name]
  if not entry or entry.depth <= 0 then
    return false
  end

  entry.depth = entry.depth - 1
  if entry.depth == 0 and entry.activeStart then
    local elapsed = gettime() - entry.activeStart
    entry.activeStart = nil
    self:_recordEntry(entry, elapsed)
  end
  return true
end

function FeatherProfiler:start()
  if not self.recording then
    self.recording = true
    self.captureStartedAt = gettime()
    self:_markDirty()
  end
end

function FeatherProfiler:stop()
  if not self.recording then
    return
  end

  local now = gettime()
  for _, entry in pairs(self.entries) do
    if entry.depth > 0 and entry.activeStart then
      self:_recordEntry(entry, math.max(0, now - entry.activeStart))
      entry.activeStart = nil
    end
    entry.depth = 0
  end
  self.captureElapsed = self.captureElapsed + math.max(0, now - (self.captureStartedAt or now))
  self.recording = false
  self:_markDirty()
end

function FeatherProfiler:reset()
  for _, entry in pairs(self.entries) do
    entry.calls = 0
    entry.totalTime = 0
    entry.minTime = math.huge
    entry.maxTime = 0
    entry.depth = 0
    entry.activeStart = nil
  end
  self.snapshots = {}
  self.captureElapsed = 0
  self.captureStartedAt = gettime()
  self:_markDirty()
end

function FeatherProfiler:captureDuration()
  local elapsed = self.captureElapsed or 0
  if self.recording then
    elapsed = elapsed + math.max(0, gettime() - (self.captureStartedAt or gettime()))
  end
  return elapsed
end

function FeatherProfiler:_buildRows()
  local rows = {}
  local totalCapturedTime = 0
  local captureDuration = self:captureDuration()

  for _, name in ipairs(self.order) do
    local entry = self.entries[name]
    if entry and entry.calls > 0 then
      totalCapturedTime = totalCapturedTime + entry.totalTime
    end
  end

  for _, name in ipairs(self.order) do
    local entry = self.entries[name]
    if entry and entry.calls > 0 then
      local avgTime = entry.totalTime / entry.calls
      rows[#rows + 1] = {
        name = entry.name,
        group = entry.group or groupForName(entry.name),
        calls = entry.calls,
        totalTimeRaw = entry.totalTime,
        avgTimeRaw = avgTime,
        minTimeRaw = entry.minTime,
        maxTimeRaw = entry.maxTime,
        totalTime = formatTime(entry.totalTime),
        avgTime = formatTime(avgTime),
        minTime = formatTime(entry.minTime),
        maxTime = formatTime(entry.maxTime),
        percent = totalCapturedTime > 0 and (entry.totalTime / totalCapturedTime) * 100 or 0,
        callsPerSecond = captureDuration > 0 and entry.calls / captureDuration or 0,
      }
    end
  end

  return rows, totalCapturedTime
end

function FeatherProfiler:snapshot(label)
  local rows, totalCapturedTime = self:_buildRows()
  local rowsByName = {}

  for _, row in ipairs(rows) do
    rowsByName[row.name] = {
      name = row.name,
      group = row.group,
      calls = row.calls,
      totalTimeRaw = row.totalTimeRaw,
      avgTimeRaw = row.avgTimeRaw,
      minTimeRaw = row.minTimeRaw,
      maxTimeRaw = row.maxTimeRaw,
      percent = row.percent,
      callsPerSecond = row.callsPerSecond,
    }
  end

  local snapshot = {
    label = label or "Last capture",
    capturedAt = gettime(),
    captureElapsed = self:captureDuration(),
    totalCapturedTime = totalCapturedTime,
    rows = rowsByName,
  }

  for index, existing in ipairs(self.snapshots) do
    if existing.label == snapshot.label then
      self.snapshots[index] = snapshot
      self:_markDirty()
      return snapshot
    end
  end

  self.snapshots[#self.snapshots + 1] = snapshot
  while #self.snapshots > 8 do
    table.remove(self.snapshots, 1)
  end
  self:_markDirty()
  return snapshot
end

function FeatherProfiler:getState()
  local rows, totalCapturedTime = self:_buildRows()
  return {
    type = "profiler",
    loading = false,
    recording = self.recording,
    captureStartedAt = self.captureStartedAt,
    captureElapsed = self:captureDuration(),
    totalCapturedTime = totalCapturedTime,
    snapshots = self.snapshots,
    data = rows,
  }
end

function FeatherProfiler:handleCommand(action, params)
  params = params or {}
  if action == "start" then
    self:start()
  elseif action == "stop" then
    self:stop()
  elseif action == "reset" then
    self:reset()
  elseif action == "snapshot" then
    self:snapshot(params.label)
  elseif action ~= "refresh" then
    return nil, "Unknown profiler action: " .. tostring(action)
  end
  return self:getState()
end

function FeatherProfiler:shouldPush(now)
  now = now or gettime()
  if self._dirty then
    return true
  end
  if self.recording and now - (self._lastPushAt or 0) >= self.pushInterval then
    return true
  end
  return false
end

function FeatherProfiler:markPushed(now)
  self._dirty = false
  self._lastPushAt = now or gettime()
end

return FeatherProfiler
