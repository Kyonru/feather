--- Plugin action routing with request correlation.
---
--- Contract (shared with the protocol and MCP work): a `cmd:plugin:action`
--- may carry a string `requestId`. Every `plugin:action:response` produced
--- because of it carries the same `requestId` at top level:
---
---   * the synchronous reply ("success" / "error") - echoed by Feather:__sendWs
---     while the command is being handled;
---   * for a deferred action, every later message, sent from here with the id
---     set explicitly: "progress" (final = false), then exactly one of
---     "success" / "error" / "cancelled" (final = true).
---
--- `cmd:plugin:action:cancel` names the request it cancels by its top-level
--- `requestId` (or `params.requestId`). Only that request is cancelled; a
--- cancel for a request that is not in flight is answered with an error and
--- never reaches the plugin, so a stale cancel cannot stop newer work.
---
--- Plugins opt into deferral by calling `request.defer()` inside
--- handleActionRequest and keeping the returned job:
---
---   local job = request.defer()
---   job:progress({ fraction = 0.5 })   -- any serializable table
---   job:complete(result)               -- or job:fail("message")
---   job:isCancelled()
local json = require(FEATHER_PATH .. ".lib.json")
local contract = require(FEATHER_PATH .. ".plugin_contract")

local Actions = {}

Actions.MAX_IN_FLIGHT = 64

local function validRequestId(feather, value)
  if feather and feather.__validRequestId then
    return feather:__validRequestId(value)
  end
  if type(value) == "string" and #value > 0 and #value <= 128 and value:match("^[%w%-_.:]+$") then
    return value
  end
  return nil
end

local function send(feather, message)
  if not feather or not feather.__sendWs then
    return
  end
  local ok, encoded = pcall(json.encode, message)
  if ok then
    feather:__sendWs(encoded)
  end
end

local function response(feather, job, status, fields)
  local message = {
    type = "plugin:action:response",
    session = feather and feather.sessionId,
    plugin = job.plugin,
    action = job.action,
    requestId = job.external and job.requestId or nil,
    status = status,
    schemaVersion = contract.actionSchemaVersion,
  }
  for key, value in pairs(fields or {}) do
    message[key] = value
  end
  return message
end

-- The same directives the synchronous reply passes through (Feather:__handleCommand).
local function applyResult(message, result)
  if type(result) ~= "table" then
    return
  end
  if result.download then
    message.download = result.download
  end
  if result.clipboard then
    message.clipboard = result.clipboard
  end
  if result.zipAssets then
    message.zipAssets = result.zipAssets
  end
  message.data = result
end

local function inFlightCount(manager)
  local count = 0
  for _ in pairs(manager._inflight) do
    count = count + 1
  end
  return count
end

local function newJob(manager, record, action, requestId, feather)
  local job = {
    plugin = record.identifier,
    action = action,
    external = requestId ~= nil,
    state = "pending",
  }
  if requestId then
    job.requestId = requestId
  else
    manager._localRequestSeq = (manager._localRequestSeq or 0) + 1
    job.requestId = "local-" .. tostring(manager._localRequestSeq)
  end

  local function finish(state)
    if job.state ~= "pending" then
      return false
    end
    job.state = state
    manager._inflight[job.requestId] = nil
    return true
  end

  function job.progress(_, data)
    if job.state ~= "pending" then
      return false
    end
    send(feather, response(feather, job, "progress", { progress = data, final = false }))
    return true
  end

  function job.complete(_, result)
    if not finish("done") then
      return false
    end
    local message = response(feather, job, "success", { final = true })
    applyResult(message, result)
    send(feather, message)
    return true
  end

  function job.fail(_, err)
    if not finish("failed") then
      return false
    end
    send(feather, response(feather, job, "error", { message = tostring(err), final = true }))
    return true
  end

  function job.isCancelled()
    return job.state == "cancelled"
  end

  manager._inflight[job.requestId] = job
  return job
end

--- Route one action to its plugin.
---@return any data, string|nil err
function Actions.dispatch(manager, record, request, feather)
  local params = request.params or {}
  local action = params.action
  local id = record.identifier

  if record.actions and (type(action) ~= "string" or not record.actions[action]) then
    return nil, "Plugin " .. id .. " does not declare the action '" .. tostring(action) .. "'."
  end

  local requestId = validRequestId(feather, request.requestId)
    or validRequestId(feather, feather and feather.__activeRequestId)
  if requestId and manager._inflight[requestId] then
    return nil, "Request " .. requestId .. " is already in flight."
  end

  local job
  request.requestId = requestId
  request.defer = function()
    if not job then
      if inFlightCount(manager) >= Actions.MAX_IN_FLIGHT then
        return nil
      end
      job = newJob(manager, record, action, requestId, feather)
    end
    return job
  end

  local instance = rawget(record, "instance")
  local ok, data, err = pcall(instance.handleActionRequest, instance, request, feather)
  if not ok then
    if job then
      job.state = "failed"
      manager._inflight[job.requestId] = nil
    end
    manager:_recordFailure(record, "action", data, feather)
    return nil, data
  end
  manager:_recordSuccess(record, "action")

  if job and job.state == "pending" then
    -- Acknowledge now; the terminal response follows with the same requestId.
    -- (No id goes into `data`: the runtime echoes requestId only into replies
    -- that do not already mention one.)
    if type(data) == "table" then
      data.pending = true
    elseif data == nil then
      data = { pending = true }
    end
  end
  return data, err
end

--- Cancel one in-flight request, or (legacy, no requestId) whatever the
--- plugin considers in flight.
function Actions.cancel(manager, record, request, feather)
  local params = request.params or {}
  local id = record.identifier
  local instance = rawget(record, "instance")
  local target = validRequestId(feather, feather and feather.__activeRequestId)
    or validRequestId(feather, params.requestId)
    or validRequestId(feather, request.requestId)

  local function callPlugin()
    if type(instance.handleActionCancel) ~= "function" then
      return nil
    end
    local ok, result = pcall(instance.handleActionCancel, instance, request, feather)
    if not ok then
      manager:_recordFailure(record, "cancel", result, feather)
      return nil, result
    end
    return result
  end

  if not target then
    -- Legacy desktop: no id to scope the cancel. Cancel only jobs that were
    -- started without an id too; correlated requests are never touched.
    for requestId, job in pairs(manager._inflight) do
      if job.plugin == id and not job.external then
        job.state = "cancelled"
        manager._inflight[requestId] = nil
      end
    end
    return callPlugin()
  end

  local job = manager._inflight[target]
  if not job or job.plugin ~= id then
    send(feather, {
      type = "plugin:action:response",
      session = feather and feather.sessionId,
      plugin = id,
      action = params.action,
      requestId = target,
      status = "error",
      message = "No in-flight request " .. target .. " for plugin " .. id .. ".",
      final = true,
    })
    return nil, "not in flight"
  end

  local declared = record.actions and record.actions[job.action]
  if declared and not declared.cancellable then
    send(feather, response(feather, job, "error", {
      message = "Action " .. tostring(job.action) .. " of plugin " .. id .. " cannot be cancelled.",
      final = false,
    }))
    return nil, "not cancellable"
  end

  job.state = "cancelled"
  manager._inflight[target] = nil
  request.requestId = target
  request.cancelledAction = job.action
  local result, err = callPlugin()
  send(feather, response(feather, job, "cancelled", { final = true }))
  return result, err
end

--- Fail every in-flight job of a plugin (it was disabled or finished).
function Actions.abandon(manager, record, feather, reason)
  for requestId, job in pairs(manager._inflight) do
    if job.plugin == record.identifier then
      job.state = "failed"
      manager._inflight[requestId] = nil
      send(feather, response(feather, job, "error", { message = reason, final = true }))
    end
  end
end

return Actions
