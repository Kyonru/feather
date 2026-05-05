local Class = require("feather.lib.class")
local Base = require("feather.plugins.base")
local json = require("feather.lib.json")

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

---@class InputEvent
---@field time number   Seconds since recording started
---@field type string   "keypressed"|"keyreleased"|"mousepressed"|"mousereleased"|"mousemoved"
---@field args table    Arguments passed to the original callback

---@class InputReplayPlugin: FeatherPlugin
---@field events InputEvent[]
---@field recording boolean
---@field replaying boolean
---@field recordStart number
---@field replayStart number
---@field replayIndex number
---@field maxEvents number
---@field captureKeys boolean
---@field captureMouse boolean
---@field captureMouseMove boolean
---@field _originals table  Original love callbacks saved for restoration
---@field _hooked boolean
local InputReplayPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.events = {}
    self.recording = false
    self.replaying = false
    self.recordStart = 0
    self.replayStart = 0
    self.replayIndex = 1
    self.maxEvents = self.options.maxEvents or 10000
    self.captureKeys = self.options.captureKeys ~= false
    self.captureMouse = self.options.captureMouse ~= false
    self.captureMouseMove = self.options.captureMouseMove == true -- off by default (noisy)
    self._originals = {}
    self._hooked = false
  end,
})

--- Install hooks on love callbacks to intercept input events.
--- Safe to call multiple times — only hooks once.
function InputReplayPlugin:_installHooks()
  if self._hooked then
    return
  end
  self._hooked = true

  local selfRef = self

  -- Helper: wrap a love callback, recording events when active
  local function hookCallback(name)
    local original = love[name]
    selfRef._originals[name] = original

    love[name] = function(...)
      -- Record if active
      if selfRef.recording then
        local elapsed = gettime() - selfRef.recordStart
        if #selfRef.events < selfRef.maxEvents then
          selfRef.events[#selfRef.events + 1] = {
            time = elapsed,
            type = name,
            args = { ... },
          }
        end
      end
      -- Always call the original
      if original then
        return original(...)
      end
    end
  end

  if self.captureKeys then
    hookCallback("keypressed")
    hookCallback("keyreleased")
  end

  if self.captureMouse then
    hookCallback("mousepressed")
    hookCallback("mousereleased")
  end

  if self.captureMouseMove then
    hookCallback("mousemoved")
  end
end

--- Remove hooks and restore original callbacks.
function InputReplayPlugin:_removeHooks()
  if not self._hooked then
    return
  end
  for name, original in pairs(self._originals) do
    love[name] = original
  end
  self._originals = {}
  self._hooked = false
end

--- Start recording input events.
function InputReplayPlugin:startRecording()
  if self.replaying then
    self:stopReplay()
  end
  self:_installHooks()
  self.events = {}
  self.recording = true
  self.recordStart = gettime()
  if self.logger and self.logger.log then
    self.logger:log({ type = "trace", str = "[InputReplay] Recording started" })
  end
end

--- Stop recording.
function InputReplayPlugin:stopRecording()
  self.recording = false
  if self.logger and self.logger.log then
    self.logger:log({ type = "trace", str = "[InputReplay] Recording stopped — " .. #self.events .. " events" })
  end
end

--- Start replaying recorded events. Calls the original love callbacks at the recorded timestamps.
function InputReplayPlugin:startReplay()
  if self.recording then
    self:stopRecording()
  end
  if #self.events == 0 then
    return
  end
  self:_installHooks()
  self.replaying = true
  self.replayStart = gettime()
  self.replayIndex = 1
  if self.logger and self.logger.log then
    self.logger:log({ type = "trace", str = "[InputReplay] Replay started — " .. #self.events .. " events" })
  end
end

--- Stop replay.
function InputReplayPlugin:stopReplay()
  self.replaying = false
  if self.logger and self.logger.log then
    self.logger:log({ type = "trace", str = "[InputReplay] Replay stopped" })
  end
end

--- Called every frame by the plugin manager.
function InputReplayPlugin:update()
  if not self.replaying then
    return
  end

  local elapsed = gettime() - self.replayStart

  -- Fire all events whose timestamp has been reached
  while self.replayIndex <= #self.events do
    local event = self.events[self.replayIndex]
    if event.time > elapsed then
      break -- not yet
    end

    -- Fire the original callback (not our hook, to avoid re-recording)
    local original = self._originals[event.type]
    if original then
      pcall(original, unpack(event.args))
    end

    self.replayIndex = self.replayIndex + 1
  end

  -- Replay finished
  if self.replayIndex > #self.events then
    self:stopReplay()
  end
end

--- Format a timestamp for display.
---@param seconds number
---@return string
local function formatTime(seconds)
  if seconds < 60 then
    return string.format("%.3fs", seconds)
  end
  local m = math.floor(seconds / 60)
  local s = seconds - m * 60
  return string.format("%dm%.1fs", m, s)
end

--- Format event details for the table view.
---@param event InputEvent
---@return string
local function formatDetails(event)
  local args = event.args
  if event.type == "keypressed" or event.type == "keyreleased" then
    -- args: key, scancode, isrepeat
    local key = args[1] or "?"
    local isrepeat = args[3] and " (repeat)" or ""
    return key .. isrepeat
  elseif event.type == "mousepressed" or event.type == "mousereleased" then
    -- args: x, y, button, istouch, presses
    local x = args[1] or 0
    local y = args[2] or 0
    local button = args[3] or 1
    return string.format("btn%d @ %d,%d", button, x, y)
  elseif event.type == "mousemoved" then
    -- args: x, y, dx, dy, istouch
    local x = args[1] or 0
    local y = args[2] or 0
    return string.format("%d,%d", x, y)
  end
  return ""
end

--- Short label for event type.
local TYPE_LABELS = {
  keypressed = "Key ↓",
  keyreleased = "Key ↑",
  mousepressed = "Mouse ↓",
  mousereleased = "Mouse ↑",
  mousemoved = "Mouse →",
}

--- Return data for the desktop plugin table.
function InputReplayPlugin:handleRequest(_request, _feather)
  local status = "idle"
  if self.recording then
    status = "recording"
  elseif self.replaying then
    status = "replaying"
  end

  -- Build table rows (show last N events, most recent first)
  local maxRows = 200
  local rows = {}
  local startIdx = math.max(1, #self.events - maxRows + 1)
  for i = #self.events, startIdx, -1 do
    local e = self.events[i]
    rows[#rows + 1] = {
      ["#"] = tostring(i),
      time = formatTime(e.time),
      type = TYPE_LABELS[e.type] or e.type,
      details = formatDetails(e),
    }
  end

  return {
    type = "table",
    loading = self.recording or self.replaying,
    columns = {
      { key = "#", label = "#" },
      { key = "time", label = "Time" },
      { key = "type", label = "Type" },
      { key = "details", label = "Details" },
    },
    data = rows,
    -- Extra metadata for the observer
    _status = status,
    _eventCount = #self.events,
    _duration = #self.events > 0 and self.events[#self.events].time or 0,
  }
end

function InputReplayPlugin:handleActionRequest(request, _feather)
  local action = request.params and request.params.action
  if action == "record" then
    if self.recording then
      self:stopRecording()
    else
      self:startRecording()
    end
    return true
  elseif action == "replay" then
    if self.replaying then
      self:stopReplay()
    else
      self:startReplay()
    end
    return true
  elseif action == "clear" then
    self.recording = false
    self.replaying = false
    self.events = {}
    self.replayIndex = 1
    return true
  elseif action == "save" then
    return self:_saveToFile()
  elseif action == "load" then
    return self:_loadFromFile()
  end
end

--- Save recorded events to a JSON file in the save directory.
---@return boolean, string|nil
function InputReplayPlugin:_saveToFile()
  if #self.events == 0 then
    return nil, "No events to save"
  end
  local filename = "feather_input_" .. os.date("%Y%m%d_%H%M%S") .. ".json"
  local data = json.encode({
    version = 1,
    eventCount = #self.events,
    duration = self.events[#self.events].time,
    events = self.events,
  })
  local ok, err = love.filesystem.write(filename, data)
  if not ok then
    return nil, "Failed to write: " .. tostring(err)
  end
  if self.logger and self.logger.log then
    self.logger:log({ type = "trace", str = "[InputReplay] Saved " .. #self.events .. " events to " .. filename })
  end
  return true
end

--- Load events from the most recent feather_input_*.json file.
---@return boolean, string|nil
function InputReplayPlugin:_loadFromFile()
  local files = love.filesystem.getDirectoryItems("")
  local inputFiles = {}
  for _, f in ipairs(files) do
    if f:match("^feather_input_.*%.json$") then
      inputFiles[#inputFiles + 1] = f
    end
  end
  if #inputFiles == 0 then
    return nil, "No saved input files found"
  end
  table.sort(inputFiles)
  local filename = inputFiles[#inputFiles] -- most recent

  local content = love.filesystem.read(filename)
  if not content then
    return nil, "Failed to read " .. filename
  end

  local ok, data = pcall(json.decode, content)
  if not ok or not data or not data.events then
    return nil, "Invalid input file format"
  end

  self.events = data.events
  self.replayIndex = 1
  self.recording = false
  self.replaying = false

  if self.logger and self.logger.log then
    self.logger:log({
      type = "trace",
      str = "[InputReplay] Loaded " .. #self.events .. " events from " .. filename,
    })
  end
  return true
end

function InputReplayPlugin:handleParamsUpdate(request, _feather)
  local params = request.params or {}
  if params.captureKeys ~= nil then
    self.captureKeys = params.captureKeys == "true" or params.captureKeys == true
  end
  if params.captureMouse ~= nil then
    self.captureMouse = params.captureMouse == "true" or params.captureMouse == true
  end
  if params.captureMouseMove ~= nil then
    self.captureMouseMove = params.captureMouseMove == "true" or params.captureMouseMove == true
  end
end

function InputReplayPlugin:finish(_feather)
  self:_removeHooks()
  self.recording = false
  self.replaying = false
end

function InputReplayPlugin:getConfig()
  local recordLabel = self.recording and "Stop Recording" or "Record"
  local recordIcon = self.recording and "square" or "circle"
  local replayLabel = self.replaying and "Stop Replay" or "Replay"
  local replayIcon = self.replaying and "square" or "play"

  return {
    type = "input-replay",
    icon = "play",
    tabName = "Input Replay",
    actions = {
      { label = recordLabel, key = "record", icon = recordIcon, type = "button" },
      { label = replayLabel, key = "replay", icon = replayIcon, type = "button" },
      { label = "Clear", key = "clear", icon = "trash-2", type = "button" },
      { label = "Save", key = "save", icon = "save", type = "button" },
      { label = "Load", key = "load", icon = "folder-open", type = "button" },
      { label = "Keys", key = "captureKeys", icon = "keyboard", type = "checkbox", value = true },
      { label = "Mouse", key = "captureMouse", icon = "mouse", type = "checkbox", value = true },
      { label = "Mouse Move", key = "captureMouseMove", icon = "move", type = "checkbox", value = false },
    },
  }
end

return InputReplayPlugin
