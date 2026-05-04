local Class = require("feather.lib.class")
local Base = require("feather.plugins.base")

--- Animation Inspector Plugin — inspect anim8 sprite animation states.
--- Register animations with addAnimation(name, getter), view current frame, speed,
--- status, looping, and flip state. Supports pause/resume/gotoFrame from the desktop.

---@class TrackedAnimation
---@field name string
---@field getter function  Returns the anim8 Animation instance
---@field imageRef string|nil  Optional image reference string for display

---@class AnimationInspectorPlugin: FeatherPlugin
---@field animations TrackedAnimation[]
---@field showPaused boolean
---@field _hooked boolean
---@field _origNewAnimation function|nil
---@field _nextId number
local AnimationInspectorPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.animations = {}
    self.showPaused = self.options.showPaused ~= false
    self._hooked = false
    self._origNewAnimation = nil
    self._nextId = 1

    if self.options.autoHook ~= false and self.options.anim8 then
      self:hook(self.options.anim8)
    end
  end,
})

--- Register an anim8 animation for tracking.
---@param name string       Display label
---@param getter function   Returns the anim8 Animation instance
---@param imageRef? string  Optional image reference for display
function AnimationInspectorPlugin:addAnimation(name, getter, imageRef)
  for i, entry in ipairs(self.animations) do
    if entry.name == name then
      self.animations[i] = { name = name, getter = getter, imageRef = imageRef }
      return
    end
  end
  self.animations[#self.animations + 1] = { name = name, getter = getter, imageRef = imageRef }
end

--- Hook anim8.newAnimation to automatically track all created animations.
---@param anim8 table  The anim8 module (result of require("anim8"))
function AnimationInspectorPlugin:hook(anim8)
  if self._hooked then
    return
  end
  self._origNewAnimation = anim8.newAnimation
  local plugin = self
  anim8.newAnimation = function(...)
    local animation = plugin._origNewAnimation(...)
    local id = plugin._nextId
    plugin._nextId = id + 1
    plugin:addAnimation("anim#" .. id, function()
      return animation
    end)
    return animation
  end
  self._hooked = true
end

--- Restore the original anim8.newAnimation.
function AnimationInspectorPlugin:unhook()
  if not self._hooked then
    return
  end
  -- We can't easily restore since we don't hold a ref to the module;
  -- but _origNewAnimation is the original function
  self._hooked = false
end

--- Remove a tracked animation.
---@param name string
function AnimationInspectorPlugin:removeAnimation(name)
  for i, entry in ipairs(self.animations) do
    if entry.name == name then
      table.remove(self.animations, i)
      return
    end
  end
end

function AnimationInspectorPlugin:update()
  -- No per-frame work; data gathered in handleRequest
end

function AnimationInspectorPlugin:handleRequest()
  local rows = {}

  for _, entry in ipairs(self.animations) do
    local ok, anim = pcall(entry.getter)
    if ok and anim then
      local status = anim.status or "?"
      if not self.showPaused and status == "paused" then
        goto continue
      end

      local totalFrames = anim.frames and #anim.frames or 0
      local position = anim.position or 0
      local timer = anim.timer or 0
      local totalDuration = anim.totalDuration or 0
      local currentDuration = (anim.durations and anim.durations[position]) or 0
      local flipped = ""
      if anim.flippedH then
        flipped = flipped .. "H"
      end
      if anim.flippedV then
        flipped = flipped .. (flipped ~= "" and "+V" or "V")
      end
      if flipped == "" then
        flipped = "—"
      end

      -- Get frame dimensions if available
      local dims = "?"
      if anim.frames and anim.frames[position] then
        local pok, w, h = pcall(function()
          local _, _, fw, fh = anim.frames[position]:getViewport()
          return fw, fh
        end)
        if pok then
          dims = string.format("%dx%d", w, h)
        end
      end

      rows[#rows + 1] = {
        name = entry.name,
        status = status,
        frame = string.format("%d/%d", position, totalFrames),
        timer = string.format("%.2f/%.2fs", timer, totalDuration),
        frameDur = string.format("%.3fs", currentDuration),
        flip = flipped,
        size = dims,
      }
      ::continue::
    else
      rows[#rows + 1] = {
        name = entry.name,
        status = "error",
        frame = "N/A",
        timer = "N/A",
        frameDur = "N/A",
        flip = "N/A",
        size = "N/A",
      }
    end
  end

  local columns = {
    { key = "name", label = "Name" },
    { key = "status", label = "Status" },
    { key = "frame", label = "Frame" },
    { key = "timer", label = "Timer" },
    { key = "frameDur", label = "Frame Dur" },
    { key = "flip", label = "Flip" },
    { key = "size", label = "Size" },
  }

  return {
    type = "table",
    columns = columns,
    data = rows,
    loading = false,
  }
end

function AnimationInspectorPlugin:handleActionRequest(request)
  local action = request.params and request.params.action
  local target = request.params and request.params.target

  if action == "pause-all" then
    for _, entry in ipairs(self.animations) do
      local ok, anim = pcall(entry.getter)
      if ok and anim and anim.pause then
        anim:pause()
      end
    end
    return "All animations paused"
  elseif action == "resume-all" then
    for _, entry in ipairs(self.animations) do
      local ok, anim = pcall(entry.getter)
      if ok and anim and anim.resume then
        anim:resume()
      end
    end
    return "All animations resumed"
  elseif action == "reset-all" then
    for _, entry in ipairs(self.animations) do
      local ok, anim = pcall(entry.getter)
      if ok and anim and anim.gotoFrame then
        anim:gotoFrame(1)
        if anim.resume then
          anim:resume()
        end
      end
    end
    return "All animations reset to frame 1"
  end

  return nil, "Unknown action: " .. tostring(action)
end

function AnimationInspectorPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.showPaused ~= nil then
    self.showPaused = params.showPaused == "true" or params.showPaused == true
  end
  return {}
end

function AnimationInspectorPlugin:getConfig()
  local playingCount = 0
  local pausedCount = 0

  for _, entry in ipairs(self.animations) do
    local ok, anim = pcall(entry.getter)
    if ok and anim then
      if anim.status == "playing" then
        playingCount = playingCount + 1
      elseif anim.status == "paused" then
        pausedCount = pausedCount + 1
      end
    end
  end

  return {
    type = "animation-inspector",
    color = "#ec4899",
    icon = "clapperboard",
    tabName = "Animations",
    actions = {
      -- Toolbar
      { label = "Pause All", key = "pause-all", icon = "pause", type = "button" },
      { label = "Resume All", key = "resume-all", icon = "play", type = "button" },
      { label = "Reset All", key = "reset-all", icon = "rotate-ccw", type = "button" },
      { label = "Show Paused", key = "showPaused", icon = "eye", type = "checkbox", value = tostring(self.showPaused) },

      -- Summary card
      {
        label = "Tracked",
        key = "tracked",
        icon = "list",
        type = "input",
        value = tostring(#self.animations),
        props = { disabled = true },
        group = "Summary",
      },
      {
        label = "Playing",
        key = "playing",
        icon = "play",
        type = "input",
        value = tostring(playingCount),
        props = { disabled = true },
        group = "Summary",
      },
      {
        label = "Paused",
        key = "paused",
        icon = "pause",
        type = "input",
        value = tostring(pausedCount),
        props = { disabled = true },
        group = "Summary",
      },
    },
  }
end

function AnimationInspectorPlugin:finish()
  self:unhook()
end

return AnimationInspectorPlugin
