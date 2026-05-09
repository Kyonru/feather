local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

--- Timer/Tween Inspector Plugin — show active timers, tweens, progress, remaining time.
--- Supports HUMP timer and flux out of the box. Register timer instances and the plugin
--- reads their internal state to display active handles with progress bars.
--- Also provides a generic API to manually register custom timers.

---@class TimerEntry
---@field label string
---@field kind string        "after" | "every" | "during" | "tween" | "custom"
---@field progress number    0..1
---@field remaining number   seconds remaining (or -1 if unknown)
---@field duration number    total duration (or -1 if unknown)
---@field repeating boolean
---@field ease string|nil
---@field source string      "hump" | "flux" | "custom"
---@field handle any         Reference for cancel support

---@class TimerInspectorPlugin: FeatherPlugin
---@field _humpTimers table[]   { name, getter } registered HUMP timer instances
---@field _fluxGroups table[]   { name, getter } registered flux groups
---@field _custom table[]       Manually registered entries
---@field showCompleted boolean
local TimerInspectorPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self._humpTimers = {}
    self._fluxGroups = {}
    self._custom = {}
    self.showCompleted = self.options.showCompleted == true

    -- Auto-register if modules are passed in options
    if self.options.humpTimer then
      self:addHumpTimer("default", function()
        return self.options.humpTimer
      end)
    end
    if self.options.flux then
      self:addFluxGroup("default", function()
        return self.options.flux
      end)
    end
  end,
})

--- Register a HUMP timer instance for inspection.
---@param name string       Display label
---@param getter function   Returns the HUMP timer instance (must have .functions)
function TimerInspectorPlugin:addHumpTimer(name, getter)
  for i, entry in ipairs(self._humpTimers) do
    if entry.name == name then
      self._humpTimers[i] = { name = name, getter = getter }
      return
    end
  end
  self._humpTimers[#self._humpTimers + 1] = { name = name, getter = getter }
end

--- Register a flux group for inspection.
---@param name string       Display label
---@param getter function   Returns the flux group (array of tweens)
function TimerInspectorPlugin:addFluxGroup(name, getter)
  for i, entry in ipairs(self._fluxGroups) do
    if entry.name == name then
      self._fluxGroups[i] = { name = name, getter = getter }
      return
    end
  end
  self._fluxGroups[#self._fluxGroups + 1] = { name = name, getter = getter }
end

--- Manually register a custom timer/tween for display.
---@param entry table { label, progress (0..1), remaining, duration, kind, repeating, ease }
function TimerInspectorPlugin:addCustom(entry)
  self._custom[#self._custom + 1] = entry
end

--- Clear all manually registered custom entries.
function TimerInspectorPlugin:clearCustom()
  self._custom = {}
end

--- Classify a HUMP timer handle's kind.
---@param handle table
---@return string kind, boolean repeating
local function classifyHumpHandle(handle)
  if handle.count == math.huge then
    return "every", true
  end
  -- Tween handles have a during function that isn't _nothing_
  -- We can't easily distinguish during vs after vs tween, so:
  -- count > 1 with finite count = "every" with limit
  -- count == 1 = "after" or "during" or "tween"
  if handle.count > 1 then
    return "every", true
  end
  return "after", false
end

--- Build a progress bar string using block characters.
---@param progress number 0..1
---@param width number   character width
---@return string
local function progressBar(progress, width)
  width = width or 10
  local filled = math.floor(progress * width + 0.5)
  local pct = math.floor(progress * 100)
  return string.rep("█", filled) .. string.rep("░", width - filled) .. " " .. pct .. "%"
end

function TimerInspectorPlugin:update()
  -- No per-frame work; data gathered in handleRequest
end

function TimerInspectorPlugin:handleRequest()
  local rows = {}

  -- Collect HUMP timer handles
  for _, timerEntry in ipairs(self._humpTimers) do
    local ok, timer = pcall(timerEntry.getter)
    if ok and timer and timer.functions then
      for handle in pairs(timer.functions) do
        local kind, repeating = classifyHumpHandle(handle)
        local progress = 0
        if handle.limit > 0 then
          progress = math.min(1, handle.time / handle.limit)
        end
        local remaining = math.max(0, handle.limit - handle.time)

        rows[#rows + 1] = {
          source = "hump",
          group = timerEntry.name,
          kind = kind,
          progress = progressBar(progress),
          remaining = string.format("%.2fs", remaining),
          duration = string.format("%.2fs", handle.limit),
          repeating = repeating and "yes" or "no",
          ease = "—",
          _handle = handle,
          _timer = timer,
        }
      end
    end
  end

  -- Collect flux tweens
  for _, fluxEntry in ipairs(self._fluxGroups) do
    local ok, group = pcall(fluxEntry.getter)
    if ok and group then
      for i = 1, #group do
        local t = group[i]
        if t and t.progress ~= nil then
          local progress = math.min(1, math.max(0, t.progress))
          local duration = t.rate > 0 and (1 / t.rate) or 0
          local remaining = duration * (1 - progress)

          rows[#rows + 1] = {
            source = "flux",
            group = fluxEntry.name,
            kind = "tween",
            progress = progressBar(progress),
            remaining = string.format("%.2fs", remaining),
            duration = string.format("%.2fs", duration),
            repeating = "no",
            ease = t._ease or "?",
            _fluxTween = t,
          }
        end
      end
    end
  end

  -- Collect custom entries
  for _, entry in ipairs(self._custom) do
    local progress = entry.progress or 0
    rows[#rows + 1] = {
      source = "custom",
      group = "—",
      kind = entry.kind or "custom",
      progress = progressBar(progress),
      remaining = entry.remaining and string.format("%.2fs", entry.remaining) or "?",
      duration = entry.duration and string.format("%.2fs", entry.duration) or "?",
      repeating = entry.repeating and "yes" or "no",
      ease = entry.ease or "—",
    }
  end

  -- Strip internal refs before sending
  local cleanRows = {}
  for _, row in ipairs(rows) do
    cleanRows[#cleanRows + 1] = {
      source = row.source,
      group = row.group,
      kind = row.kind,
      progress = row.progress,
      remaining = row.remaining,
      duration = row.duration,
      repeating = row.repeating,
      ease = row.ease,
    }
  end

  local columns = {
    { key = "source", label = "Lib" },
    { key = "group", label = "Group" },
    { key = "kind", label = "Kind" },
    { key = "progress", label = "Progress" },
    { key = "remaining", label = "Remaining" },
    { key = "duration", label = "Duration" },
    { key = "repeating", label = "Repeat" },
    { key = "ease", label = "Easing" },
  }

  return {
    type = "table",
    columns = columns,
    data = cleanRows,
    loading = false,
  }
end

function TimerInspectorPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "clear-hump" then
    -- Clear all HUMP timers
    for _, timerEntry in ipairs(self._humpTimers) do
      local ok, timer = pcall(timerEntry.getter)
      if ok and timer and timer.clear then
        timer:clear()
      end
    end
    return "All HUMP timers cleared"
  elseif action == "clear-flux" then
    -- Stop all flux tweens
    for _, fluxEntry in ipairs(self._fluxGroups) do
      local ok, group = pcall(fluxEntry.getter)
      if ok and group then
        -- Remove tweens from end to start to avoid index shifting
        for i = #group, 1, -1 do
          if group[i] and group[i].stop then
            group[i]:stop()
          end
        end
      end
    end
    return "All flux tweens stopped"
  elseif action == "clear-custom" then
    self:clearCustom()
    return "Custom entries cleared"
  end

  return nil, "Unknown action: " .. tostring(action)
end

function TimerInspectorPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.showCompleted ~= nil then
    self.showCompleted = params.showCompleted == "true" or params.showCompleted == true
  end
  return {}
end

function TimerInspectorPlugin:getConfig()
  -- Count active items
  local humpCount = 0
  for _, timerEntry in ipairs(self._humpTimers) do
    local ok, timer = pcall(timerEntry.getter)
    if ok and timer and timer.functions then
      for _ in pairs(timer.functions) do
        humpCount = humpCount + 1
      end
    end
  end

  local fluxCount = 0
  for _, fluxEntry in ipairs(self._fluxGroups) do
    local ok, group = pcall(fluxEntry.getter)
    if ok and group then
      fluxCount = fluxCount + #group
    end
  end

  local totalActive = humpCount + fluxCount + #self._custom

  return {
    type = "timer-inspector",
    color = "#06b6d4",
    icon = "timer",
    tabName = "Timers",
    docs = "https://github.com/Kyonru/feather/blob/main/src-lua/plugins/timer-inspector",
    actions = {
      -- Toolbar
      { label = "Clear HUMP", key = "clear-hump", icon = "trash-2", type = "button" },
      { label = "Clear Flux", key = "clear-flux", icon = "trash-2", type = "button" },
      { label = "Clear Custom", key = "clear-custom", icon = "trash-2", type = "button" },

      -- Stats card
      {
        label = "Active",
        key = "totalActive",
        icon = "activity",
        type = "input",
        value = tostring(totalActive),
        props = { disabled = true },
        group = "Stats",
      },
      {
        label = "HUMP Timers",
        key = "humpCount",
        icon = "clock",
        type = "input",
        value = tostring(humpCount),
        props = { disabled = true },
        group = "Stats",
      },
      {
        label = "Flux Tweens",
        key = "fluxCount",
        icon = "trending-up",
        type = "input",
        value = tostring(fluxCount),
        props = { disabled = true },
        group = "Stats",
      },
      {
        label = "Custom",
        key = "customCount",
        icon = "wrench",
        type = "input",
        value = tostring(#self._custom),
        props = { disabled = true },
        group = "Stats",
      },

      -- Sources card
      {
        label = "HUMP Instances",
        key = "humpInstances",
        icon = "server",
        type = "input",
        value = tostring(#self._humpTimers),
        props = { disabled = true },
        group = "Sources",
      },
      {
        label = "Flux Groups",
        key = "fluxGroups",
        icon = "server",
        type = "input",
        value = tostring(#self._fluxGroups),
        props = { disabled = true },
        group = "Sources",
      },
    },
  }
end

function TimerInspectorPlugin:finish()
  -- Nothing to unhook
end

return TimerInspectorPlugin
