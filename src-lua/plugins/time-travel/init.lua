local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")
local Base = require(FEATHER_PATH .. ".plugins.base")

---@class TimeTravelPlugin: FeatherPlugin
---@field bufferSize number
---@field recording boolean
---@field frameId number
---@field _buf table
---@field _bufHead number
---@field _bufCount number
---@field _statusTimer number
local TimeTravelPlugin = Class({ __includes = Base })

function TimeTravelPlugin:init(config)
  Base.init(self, config)
  self.bufferSize = (self.options and self.options.bufferSize) or 1000
  self.recording = false
  self.frameId = 0
  self._buf = {}
  self._bufHead = 1
  self._bufCount = 0
  self._statusTimer = 0
end

--- Begin recording. Clears any previously recorded frames.
function TimeTravelPlugin:startRecording()
  self.recording = true
  self.frameId = 0
  self._buf = {}
  self._bufHead = 1
  self._bufCount = 0
  self._statusTimer = 0
end

--- Stop recording. Recorded frames remain in the buffer for scrubbing.
function TimeTravelPlugin:stopRecording()
  self.recording = false
end

function TimeTravelPlugin:_pushFrame(frame)
  self._buf[self._bufHead] = frame
  self._bufHead = (self._bufHead % self.bufferSize) + 1
  if self._bufCount < self.bufferSize then
    self._bufCount = self._bufCount + 1
  end
end

--- Iterate all frames in chronological order (oldest → newest).
---@param callback fun(frame: table)
function TimeTravelPlugin:_iterFrames(callback)
  if self._bufCount == 0 then
    return
  end
  local start, count
  if self._bufCount < self.bufferSize then
    -- Buffer not yet full: data sits at positions 1..bufCount
    start = 1
    count = self._bufCount
  else
    -- Buffer is full: _bufHead points at the oldest slot (next to be overwritten)
    start = self._bufHead
    count = self.bufferSize
  end
  for i = 0, count - 1 do
    local idx = ((start - 1 + i) % self.bufferSize) + 1
    local frame = self._buf[idx]
    if frame then
      callback(frame)
    end
  end
end

--- Return frames within an optional [fromId, toId] range (inclusive).
---@param fromId number|nil
---@param toId number|nil
---@return table[]
function TimeTravelPlugin:getFrames(fromId, toId)
  local result = {}
  self:_iterFrames(function(frame)
    if (not fromId or frame.id >= fromId) and (not toId or frame.id <= toId) then
      result[#result + 1] = frame
    end
  end)
  return result
end

function TimeTravelPlugin:update(dt, feather)
  if not self.recording then
    return
  end

  self.frameId = self.frameId + 1

  -- Snapshot current observer values (already formatted strings — no deep clone needed)
  local obs = {}
  if feather.featherObserver then
    for _, entry in ipairs(feather.featherObserver.observers) do
      obs[entry.key] = entry.value
    end
  end

  self:_pushFrame({
    id = self.frameId,
    time = love.timer.getTime(),
    dt = dt,
    observers = obs,
  })

  -- Push a compact status message once per second so the desktop knows we're alive
  if feather.wsConnected then
    self._statusTimer = self._statusTimer + dt
    if self._statusTimer >= 1.0 then
      self._statusTimer = 0
      local firstId = self._bufCount > 0 and math.max(1, self.frameId - self._bufCount + 1) or 0
      feather:__sendWs(json.encode({
        type = "time_travel:status",
        session = feather.sessionId,
        data = {
          recording = true,
          frame_count = self._bufCount,
          buffer_size = self.bufferSize,
          first_frame_id = firstId,
          last_frame_id = self.frameId,
        },
      }))
    end
  end
end

--- Called by Feather.__handleCommand when desktop sends cmd:time_travel:request_frames.
---@param params table { from_frame?: number, to_frame?: number }
---@param feather Feather
function TimeTravelPlugin:sendFrames(params, feather)
  local frames = self:getFrames(params.from_frame, params.to_frame)
  feather:__sendWs(json.encode({
    type = "time_travel:frames",
    session = feather.sessionId,
    data = { frames = frames },
  }))
end

function TimeTravelPlugin:getConfig()
  return {
    id = "time-travel",
    tabName = "Time Travel",
    icon = "clock",
    recording = self.recording,
    bufferSize = self.bufferSize,
    frameCount = self._bufCount,
    actions = {
      {
        label = self.recording and "Stop Recording" or "Start Recording",
        key = self.recording and "stop" or "start",
        icon = self.recording and "square" or "circle",
        type = "button",
      },
      {
        label = "Buffer Size",
        key = "bufferSize",
        icon = "database",
        type = "input",
        value = self.bufferSize,
        props = { type = "number", min = 100, max = 10000 },
      },
    },
  }
end

return TimeTravelPlugin
