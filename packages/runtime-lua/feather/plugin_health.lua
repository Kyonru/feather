--- One structured health record per plugin.
---
--- Failures used to exist only as log lines, and only update() failures were
--- counted. Every phase that runs plugin code (init, update, callbacks, payload
--- builds, actions, params, config) now records here, and the record travels
--- to the desktop in the plugin list so Inspector and MCP read the same state.
local Health = {}

--- Consecutive failures in one phase before the plugin is switched off.
Health.FAILURE_THRESHOLD = 10

local MAX_ERROR_LENGTH = 500

local function clock()
  if love and love.timer and love.timer.getTime then
    return love.timer.getTime()
  end
  return os.clock()
end

Health.clock = clock

function Health.new()
  return {
    consecutiveFailures = 0,
    totalFailures = 0,
    failures = {},
    lastError = nil,
    disabledReason = nil,
    lastUpdateMs = nil,
    lastPushMs = nil,
    lastPayloadBytes = nil,
    lastBinaryBytes = nil,
    lastRejectedPayloadBytes = nil,
    lastPushAt = nil,
    pushCount = 0,
  }
end

local function trim(message)
  local text = tostring(message)
  if #text > MAX_ERROR_LENGTH then
    -- Cut on a character boundary so the message stays valid UTF-8 on the wire.
    text = text:sub(1, MAX_ERROR_LENGTH):gsub("[\192-\255][\128-\191]*$", "") .. "..."
  end
  return text
end

local function refreshConsecutive(health)
  local worst = 0
  for _, count in pairs(health.failures) do
    if count > worst then
      worst = count
    end
  end
  health.consecutiveFailures = worst
end

--- Record a failure. Returns the consecutive count for that phase.
function Health.recordFailure(health, phase, err)
  health.failures[phase] = (health.failures[phase] or 0) + 1
  health.totalFailures = health.totalFailures + 1
  health.lastError = { phase = phase, message = trim(err), at = clock() }
  refreshConsecutive(health)
  return health.failures[phase]
end

function Health.recordSuccess(health, phase)
  if health.failures[phase] then
    health.failures[phase] = nil
    refreshConsecutive(health)
  end
end

function Health.reset(health)
  health.failures = {}
  health.consecutiveFailures = 0
  health.disabledReason = nil
end

local function round(value)
  if type(value) ~= "number" then
    return nil
  end
  return math.floor(value * 1000 + 0.5) / 1000
end

--- Wire form of a plugin's health. `status` summarizes the record:
--- "active", "failing" (active with recent consecutive failures), "inactive"
--- (disabled or blocked) or "disabled-by-errors".
function Health.snapshot(record)
  local health = record.health
  local status
  if record.inactiveReason and record.inactiveReason.code == "disabled-by-errors" then
    status = "disabled-by-errors"
  elseif record.disabled or record.blocked then
    status = "inactive"
  elseif health.consecutiveFailures > 0 then
    status = "failing"
  else
    status = "active"
  end
  return {
    status = status,
    consecutiveFailures = health.consecutiveFailures,
    totalFailures = health.totalFailures,
    lastError = health.lastError,
    disabledReason = health.disabledReason,
    lastUpdateMs = round(health.lastUpdateMs),
    lastPushMs = round(health.lastPushMs),
    lastPayloadBytes = health.lastPayloadBytes,
    lastBinaryBytes = health.lastBinaryBytes,
    lastRejectedPayloadBytes = health.lastRejectedPayloadBytes,
    lastPushAt = health.lastPushAt,
    pushCount = health.pushCount,
    refreshPending = record._refreshPending == true,
  }
end

return Health
