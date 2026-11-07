local Class = require(FEATHER_PATH .. ".lib.class")

local DEFAULT_BUDGET = {
  maxFrameMs = 0.5,
  maxMessagesPerFrame = 20,
  maxSerializedBytesPerFrame = 32 * 1024,
}

local function now()
  if love and love.timer and love.timer.getTime then
    return love.timer.getTime()
  end
  return os.clock()
end

local function copyBudget(input)
  input = type(input) == "table" and input or {}
  return {
    maxFrameMs = tonumber(input.maxFrameMs) or DEFAULT_BUDGET.maxFrameMs,
    maxMessagesPerFrame = tonumber(input.maxMessagesPerFrame) or DEFAULT_BUDGET.maxMessagesPerFrame,
    maxSerializedBytesPerFrame = tonumber(input.maxSerializedBytesPerFrame)
      or DEFAULT_BUDGET.maxSerializedBytesPerFrame,
  }
end

local function addTiming(bucket, durationMs)
  bucket.totalMs = (bucket.totalMs or 0) + durationMs
  bucket.count = (bucket.count or 0) + 1
  if durationMs > (bucket.maxMs or 0) then
    bucket.maxMs = durationMs
  end
end

local function serializeTiming(bucket)
  local count = bucket.count or 0
  local total = bucket.totalMs or 0
  return {
    totalMs = total,
    avgMs = count > 0 and total / count or 0,
    maxMs = bucket.maxMs or 0,
    count = count,
  }
end

local FeatherOverhead = Class({
  init = function(self, config)
    self.budget = copyBudget(config and config.runtimeBudget)
    self._frameMessages = 0
    self._frameSerializedBytes = 0
    self:resetWindow()
  end,
})

function FeatherOverhead:resetWindow()
  self.windowStart = now()
  self.frameCount = 0
  self.suspendedFrameCount = 0
  self.timings = {}
  self.pluginTimings = {}
  self.messages = 0
  self.serializedBytes = 0
  self.binaryBytes = 0
  self.deferredTasks = 0
  self.budgetMisses = {}
end

function FeatherOverhead:setBudget(budget)
  self.budget = copyBudget(budget)
end

function FeatherOverhead:frameStart()
  self._frameStart = now()
  self._frameMessages = 0
  self._frameSerializedBytes = 0
end

function FeatherOverhead:frameEnd(runtimeSuspended)
  if runtimeSuspended then
    self.suspendedFrameCount = self.suspendedFrameCount + 1
  end
  self.frameCount = self.frameCount + 1
  if self._frameStart then
    self:recordElapsed("update", self._frameStart)
  end
  self._frameStart = nil
end

function FeatherOverhead:begin()
  return now()
end

function FeatherOverhead:recordElapsed(name, startedAt)
  if type(startedAt) ~= "number" then
    return
  end
  local durationMs = math.max(0, (now() - startedAt) * 1000)
  local bucket = self.timings[name] or {}
  addTiming(bucket, durationMs)
  self.timings[name] = bucket
end

function FeatherOverhead:recordPlugin(kind, pluginId, startedAt)
  if type(startedAt) ~= "number" or not pluginId then
    return
  end
  local durationMs = math.max(0, (now() - startedAt) * 1000)
  local id = tostring(pluginId)
  local plugin = self.pluginTimings[id] or { id = id, update = {}, payload = {} }
  addTiming(plugin[kind] or plugin.update, durationMs)
  self.pluginTimings[id] = plugin
end

function FeatherOverhead:recordMessage(bytes)
  local size = tonumber(bytes) or 0
  self.messages = self.messages + 1
  self.serializedBytes = self.serializedBytes + size
  self._frameMessages = (self._frameMessages or 0) + 1
  self._frameSerializedBytes = (self._frameSerializedBytes or 0) + size
end

function FeatherOverhead:recordBinary(bytes)
  self.binaryBytes = self.binaryBytes + (tonumber(bytes) or 0)
end

function FeatherOverhead:recordDeferred(task, reason)
  self.deferredTasks = self.deferredTasks + 1
  local key = tostring(reason or "budget")
  self.budgetMisses[key] = (self.budgetMisses[key] or 0) + 1
  if task then
    local taskKey = "task:" .. tostring(task)
    self.budgetMisses[taskKey] = (self.budgetMisses[taskKey] or 0) + 1
  end
end

function FeatherOverhead:hasBudget(extraBytes)
  local budget = self.budget or DEFAULT_BUDGET
  if self._frameStart then
    local elapsedMs = (now() - self._frameStart) * 1000
    if elapsedMs >= budget.maxFrameMs then
      return false, "time"
    end
  end
  if (self._frameMessages or 0) >= budget.maxMessagesPerFrame then
    return false, "messages"
  end
  local bytes = (self._frameSerializedBytes or 0) + (tonumber(extraBytes) or 0)
  if bytes >= budget.maxSerializedBytesPerFrame then
    return false, "bytes"
  end
  return true, nil
end

function FeatherOverhead:getResponseBody()
  local elapsed = math.max(0.001, now() - (self.windowStart or now()))
  local timings = {}
  for name, bucket in pairs(self.timings or {}) do
    timings[name] = serializeTiming(bucket)
  end

  local plugins = {}
  for _, plugin in pairs(self.pluginTimings or {}) do
    plugins[#plugins + 1] = {
      id = plugin.id,
      update = serializeTiming(plugin.update or {}),
      payload = serializeTiming(plugin.payload or {}),
    }
  end
  table.sort(plugins, function(a, b)
    local aCost = (a.update.totalMs or 0) + (a.payload.totalMs or 0)
    local bCost = (b.update.totalMs or 0) + (b.payload.totalMs or 0)
    return aCost > bCost
  end)
  while #plugins > 8 do
    table.remove(plugins)
  end

  local payload = {
    windowSeconds = elapsed,
    frameCount = self.frameCount,
    suspendedFrameCount = self.suspendedFrameCount,
    avgMsPerFrame = self.frameCount > 0 and ((timings.update and timings.update.totalMs or 0) / self.frameCount) or 0,
    timings = timings,
    messages = self.messages,
    serializedBytes = self.serializedBytes,
    binaryBytes = self.binaryBytes,
    deferredTasks = self.deferredTasks,
    budgetMisses = self.budgetMisses,
    budget = self.budget,
    plugins = plugins,
  }
  self:resetWindow()
  return payload
end

return FeatherOverhead
