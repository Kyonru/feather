--- Plugin update/push scheduling and the versioned plugin payload envelope.
---
--- Normal pushes are spread across frames by the runtime's sample task loop
--- (`Feather:__runNextSampleTask`), a few plugins per frame and only while
--- the frame budget allows. A forced refresh (`req:plugins`) used to bypass
--- all of it and build every plugin's payload synchronously, the moment a
--- route opened. It now enters the same loop at raised priority: queued
--- refreshes are served first, under the same per-frame batch and budget.
local json = require(FEATHER_PATH .. ".lib.json")
local contract = require(FEATHER_PATH .. ".plugin_contract")
local Health = require(FEATHER_PATH .. ".plugin_health")

local Scheduler = {}

local socketModule
local function wallClockMs()
  if socketModule == nil then
    local ok, socket = pcall(require, "socket")
    socketModule = ok and type(socket) == "table" and socket or false
  end
  if socketModule and socketModule.gettime then
    return math.floor(socketModule.gettime() * 1000)
  end
  return os.time() * 1000
end

Scheduler.wallClockMs = wallClockMs

local function instanceOf(record)
  return rawget(record, "instance")
end

local function isRunnable(record)
  return instanceOf(record) ~= nil and not record.disabled and not record.blocked
end

local function runtimeActive(record, feather)
  local instance = instanceOf(record)
  if instance and type(instance.isRuntimeActive) == "function" then
    local ok, active = pcall(instance.isRuntimeActive, instance, feather)
    return ok and active == true
  end
  return false
end

local function interested(record, feather)
  return feather and feather.__isPluginInterested and feather:__isPluginInterested(record.identifier) or false
end

function Scheduler.isUpdateActive(record, feather)
  local mode = record.runtime.update
  if mode == "always" then
    return true
  end
  if runtimeActive(record, feather) then
    return true
  end
  if mode == "active" then
    return interested(record, feather)
  end
  return false
end

function Scheduler.isPushActive(record, feather, force)
  if force then
    return true
  end
  local mode = record.runtime.push
  if mode == "sampled" then
    return true
  end
  if runtimeActive(record, feather) then
    return true
  end
  if mode == "active" then
    return interested(record, feather)
  end
  return false
end

local function getPushInterval(record)
  local instance = instanceOf(record)
  if not instance or type(instance.getPushInterval) ~= "function" then
    return 0
  end
  local ok, interval = pcall(instance.getPushInterval, instance)
  if not ok or type(interval) ~= "number" or interval <= 0 then
    return 0
  end
  return interval
end

local function hasBudget(feather)
  if feather and feather.__hasRuntimeBudget then
    return feather:__hasRuntimeBudget("plugins")
  end
  return true
end

--- Build one plugin's payload and send it in the versioned envelope.
---@return boolean pushed  true when a payload build ran (whether or not it produced data)
function Scheduler.pushRecord(manager, feather, record, requestId)
  local instance = instanceOf(record)
  if not instance or type(instance.handleRequest) ~= "function" then
    return false
  end

  local request = { method = "GET", params = {}, headers = {}, path = "/plugins/" .. record.identifier }
  local startedAt = Health.clock()
  local overheadStartedAt = feather and feather.overhead and feather.overhead:begin()
  local ok, data = pcall(instance.handleRequest, instance, request, feather)
  if feather and feather.overhead then
    feather.overhead:recordPlugin("payload", record.identifier, overheadStartedAt)
  end
  if not ok then
    manager:_recordFailure(record, "payload", data, feather)
    return true
  end
  Health.recordSuccess(record.health, "payload")
  if data == nil then
    record.health.lastPushMs = (Health.clock() - startedAt) * 1000
    return true
  end

  local envelope = {
    type = "plugin",
    session = feather.sessionId,
    plugin = record.identifier,
    data = data,
    schemaVersion = contract.uiSchemaVersion,
    pluginVersion = record.version,
    generatedAt = wallClockMs(),
    requestId = requestId,
  }
  local encodedOk, encoded = pcall(json.encode, envelope)
  if not encodedOk then
    manager:_recordFailure(record, "payload", "payload is not serializable: " .. tostring(encoded), feather)
    return true
  end

  if feather.__sendWs then
    feather:__sendWs(encoded)
  end
  if feather.__sendPendingBinaries then
    feather:__sendPendingBinaries()
  end

  local health = record.health
  health.lastPushMs = (Health.clock() - startedAt) * 1000
  health.lastPayloadBytes = #encoded
  health.lastPushAt = envelope.generatedAt
  health.pushCount = health.pushCount + 1
  return true
end

--- Queue a forced refresh of every running plugin. Nothing is built here;
--- the sample loop serves the queue first, within the frame budget.
---@return number queued
function Scheduler.requestRefresh(manager, feather)
  local requestId = feather and feather.__activeRequestId or nil
  local queue = manager._refreshQueue
  local queued = 0
  for _, record in ipairs(manager.plugins) do
    if isRunnable(record) then
      if record._refreshPending then
        for _, item in ipairs(queue) do
          if item.record == record and item.requestId == nil then
            item.requestId = requestId
          end
        end
      else
        record._refreshPending = true
        queue[#queue + 1] = { record = record, requestId = requestId }
        queued = queued + 1
      end
    end
  end

  -- Make sure the sample loop has a plugins task to serve the queue with.
  -- When the current cadence already finished its plugin sweep, start the
  -- index past the end so only the queued refreshes run.
  local tasks = feather and feather._scheduledSampleTasks
  if #queue > 0 and type(tasks) == "table" then
    local present = false
    for _, task in ipairs(tasks) do
      if task == "plugins" then
        present = true
        break
      end
    end
    if not present then
      tasks[#tasks + 1] = "plugins"
      if feather._pluginPushIndex == nil then
        feather._pluginPushIndex = #manager.plugins + 1
      end
    end
  end
  return queued
end

function Scheduler.hasPendingRefresh(manager)
  return #manager._refreshQueue > 0
end

--- Push a bounded number of plugin payloads.
---@return number nextIndex
---@return boolean done
function Scheduler.pushSome(manager, feather, startIndex, maxPlugins, opts)
  local limit = math.max(1, maxPlugins or 1)
  local force = opts and opts.force == true
  local pushed = 0
  local queue = manager._refreshQueue
  local plugins = manager.plugins
  local index = math.max(1, startIndex or 1)

  -- 1. Forced refreshes: raised priority, same batch limit and budget.
  while pushed < limit and #queue > 0 do
    if pushed > 0 and not hasBudget(feather) then
      return index, false
    end
    local item = table.remove(queue, 1)
    item.record._refreshPending = false
    if isRunnable(item.record) and Scheduler.pushRecord(manager, feather, item.record, item.requestId) then
      pushed = pushed + 1
    end
  end

  -- 2. The regular round-robin sweep.
  local currentTime = Health.clock()
  while index <= #plugins and pushed < limit do
    local record = plugins[index]
    if isRunnable(record) and Scheduler.isPushActive(record, feather, force) then
      local interval = force and 0 or getPushInterval(record)
      if force or interval <= 0 or not record._nextPushAt or currentTime >= record._nextPushAt then
        if pushed > 0 and not hasBudget(feather) then
          return index, false
        end
        Scheduler.pushRecord(manager, feather, record, nil)
        if interval > 0 then
          record._nextPushAt = currentTime + interval
        end
        pushed = pushed + 1
      end
    end
    index = index + 1
  end

  return index, index > #plugins and #queue == 0
end

return Scheduler
