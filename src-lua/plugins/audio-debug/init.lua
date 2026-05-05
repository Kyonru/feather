local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")

--- Audio Debug Plugin — inspect love.audio state, track sources, diagnose playback issues.
--- Hooks love.audio.newSource to automatically track all created sources.
--- Shows a table of all tracked sources with status, volume, pitch, etc.
--- Displays listener position, master volume, distance model, and source limits.

---@class TrackedSource
---@field source love.Source
---@field label string
---@field created number

---@class AudioDebugPlugin: FeatherPlugin
---@field tracked TrackedSource[]
---@field _hooked boolean
---@field _origNewSource function|nil
---@field masterVolume number
---@field showStopped boolean
local AudioDebugPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.tracked = {}
    self._hooked = false
    self._origNewSource = nil
    self.showStopped = self.options.showStopped ~= false
    self.masterVolume = love.audio.getVolume()

    if self.options.autoHook ~= false then
      self:hookNewSource()
    end
  end,
})

--- Hook love.audio.newSource to automatically track all created sources.
function AudioDebugPlugin:hookNewSource()
  if self._hooked then
    return
  end
  self._origNewSource = love.audio.newSource
  local plugin = self
  love.audio.newSource = function(...)
    local source = plugin._origNewSource(...)
    plugin:addSource(source, tostring((...)))
    return source
  end
  self._hooked = true
end

--- Restore the original love.audio.newSource.
function AudioDebugPlugin:unhookNewSource()
  if not self._hooked then
    return
  end
  if self._origNewSource then
    love.audio.newSource = self._origNewSource
    self._origNewSource = nil
  end
  self._hooked = false
end

--- Manually register a source for tracking.
---@param source love.Source
---@param label? string  Display label (defaults to source type)
function AudioDebugPlugin:addSource(source, label)
  self.tracked[#self.tracked + 1] = {
    source = source,
    label = label or source:getType(),
    created = love.timer.getTime(),
  }
end

--- Remove released/destroyed sources from the tracked list.
function AudioDebugPlugin:_prune()
  local live = {}
  for _, entry in ipairs(self.tracked) do
    -- Source:type() will fail on released objects; pcall to detect
    local ok = pcall(function()
      return entry.source:getType()
    end)
    if ok then
      live[#live + 1] = entry
    end
  end
  self.tracked = live
end

function AudioDebugPlugin:update()
  -- No per-frame work; data gathered in handleRequest
end

function AudioDebugPlugin:handleRequest()
  self:_prune()

  -- Build source rows
  local rows = {}
  for _, entry in ipairs(self.tracked) do
    local src = entry.source
    local playing = src:isPlaying()
    local status = playing and "playing" or "stopped"

    -- Skip stopped sources if filter is off
    if not self.showStopped and not playing then
      goto continue
    end

    local channels = src:getChannelCount()
    local vol = src:getVolume()
    local pitch = src:getPitch()
    local looping = src:isLooping()
    local srcType = src:getType() -- static / stream / queue
    local duration = src:getDuration("seconds")
    local position = src:tell("seconds")

    rows[#rows + 1] = {
      name = entry.label,
      type = srcType,
      status = status,
      volume = string.format("%.2f", vol),
      pitch = string.format("%.2f", pitch),
      looping = looping and "yes" or "no",
      channels = channels == 1 and "mono" or "stereo",
      duration = duration >= 0 and string.format("%.1fs", duration) or "?",
      position = string.format("%.1fs", position),
    }
    ::continue::
  end

  local columns = {
    { key = "name", label = "Name" },
    { key = "status", label = "Status" },
    { key = "type", label = "Type" },
    { key = "volume", label = "Vol" },
    { key = "pitch", label = "Pitch" },
    { key = "looping", label = "Loop" },
    { key = "channels", label = "Ch" },
    { key = "position", label = "Pos" },
    { key = "duration", label = "Dur" },
  }

  return {
    type = "table",
    columns = columns,
    data = rows,
    loading = false,
  }
end

function AudioDebugPlugin:handleActionRequest(request)
  local action = request.params and request.params.action
  if action == "stop-all" then
    love.audio.stop()
    return "All sources stopped"
  elseif action == "pause-all" then
    love.audio.pause()
    return "All sources paused"
  end
  return nil, "Unknown action: " .. tostring(action)
end

function AudioDebugPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.masterVolume ~= nil then
    local v = tonumber(params.masterVolume)
    if v then
      v = math.max(0, math.min(1, v))
      love.audio.setVolume(v)
      self.masterVolume = v
    end
  end
  if params.showStopped ~= nil then
    self.showStopped = params.showStopped == "true" or params.showStopped == true
  end
  return {}
end

function AudioDebugPlugin:getConfig()
  local activeCount = love.audio.getActiveSourceCount()
  local lx, ly, lz = love.audio.getPosition()
  local distModel = love.audio.getDistanceModel()
  local dopplerScale = love.audio.getDopplerScale()
  local effectsSupported = love.audio.isEffectsSupported()
  local maxSceneEffects = 0
  local maxSourceEffects = 0
  if effectsSupported then
    maxSceneEffects = love.audio.getMaxSceneEffects()
    maxSourceEffects = love.audio.getMaxSourceEffects()
  end

  return {
    type = "audio-debug",
    color = "#818cf8",
    icon = "volume-2",
    tabName = "Audio",
    actions = {
      -- Toolbar actions (no group)
      { label = "Stop All", key = "stop-all", icon = "square", type = "button" },
      { label = "Pause All", key = "pause-all", icon = "pause", type = "button" },
      { label = "Show Stopped", key = "showStopped", icon = "eye", type = "checkbox", value = tostring(self.showStopped) },

      -- Listener card
      { label = "Position", key = "listenerPos", icon = "map-pin", type = "input",
        value = string.format("%.1f, %.1f, %.1f", lx, ly, lz),
        props = { disabled = true }, group = "Listener" },

      -- Stats card
      { label = "Active Sources", key = "activeSources", icon = "activity", type = "input",
        value = tostring(activeCount),
        props = { disabled = true }, group = "Stats" },
      { label = "Tracked Sources", key = "trackedSources", icon = "list", type = "input",
        value = tostring(#self.tracked),
        props = { disabled = true }, group = "Stats" },
      { label = "Distance Model", key = "distanceModel", icon = "radar", type = "input",
        value = distModel,
        props = { disabled = true }, group = "Stats" },
      { label = "Doppler Scale", key = "dopplerScale", icon = "wind", type = "input",
        value = string.format("%.2f", dopplerScale),
        props = { disabled = true }, group = "Stats" },

      -- Settings card
      { label = "Master Volume", key = "masterVolume", icon = "volume-2", type = "input",
        value = string.format("%.2f", love.audio.getVolume()),
        props = { type = "number", min = 0, max = 1, step = 0.05 }, group = "Settings" },

      -- Effects card
      { label = "Effects Supported", key = "effectsSupported", icon = "sparkles", type = "input",
        value = effectsSupported and "yes" or "no",
        props = { disabled = true }, group = "Effects" },
      { label = "Max Scene Effects", key = "maxSceneEffects", icon = "layers", type = "input",
        value = tostring(maxSceneEffects),
        props = { disabled = true }, group = "Effects" },
      { label = "Max Source Effects", key = "maxSourceEffects", icon = "sliders-horizontal", type = "input",
        value = tostring(maxSourceEffects),
        props = { disabled = true }, group = "Effects" },
    },
  }
end

function AudioDebugPlugin:finish()
  self:unhookNewSource()
end

return AudioDebugPlugin
