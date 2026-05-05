---@diagnostic disable: duplicate-set-field
local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")

--- Coroutine Monitor Plugin — track active coroutines, status, yields per frame.
--- Hooks coroutine.create/wrap to automatically discover coroutines.
--- Shows a table of all tracked coroutines with status, yields, and age.

---@class TrackedCoroutine
---@field co thread
---@field label string
---@field created number
---@field yields number          Total yields since creation
---@field yieldsThisFrame number Yields counted in the current frame
---@field lastYieldTime number
---@field dead boolean           Cached dead status (so we keep the row after GC)

---@class CoroutineMonitorPlugin: FeatherPlugin
---@field tracked TrackedCoroutine[]
---@field _hooked boolean
---@field _origCreate function|nil
---@field _origWrap function|nil
---@field _origResume function|nil
---@field _origYield function|nil
---@field showDead boolean
---@field _nextId number
---@field _frameYields table<thread, number>
---@field totalCreated number
---@field totalDead number
local CoroutineMonitorPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.tracked = {}
    self._hooked = false
    self._origCreate = nil
    self._origWrap = nil
    self._origResume = nil
    self._origYield = nil
    self.showDead = self.options.showDead or false
    self._nextId = 1
    self._frameYields = {}
    self.totalCreated = 0
    self.totalDead = 0

    if self.options.autoHook ~= false then
      self:hook()
    end
  end,
})

--- Find a tracked entry by coroutine thread reference.
---@param co thread
---@return TrackedCoroutine|nil
function CoroutineMonitorPlugin:_findEntry(co)
  for _, entry in ipairs(self.tracked) do
    if entry.co == co then
      return entry
    end
  end
  return nil
end

--- Register a coroutine for tracking.
---@param co thread
---@param label? string
function CoroutineMonitorPlugin:addCoroutine(co, label)
  if self:_findEntry(co) then
    return -- already tracked
  end
  self.totalCreated = self.totalCreated + 1
  local id = self._nextId
  self._nextId = self._nextId + 1
  self.tracked[#self.tracked + 1] = {
    co = co,
    label = label or ("coroutine#" .. id),
    created = love.timer.getTime(),
    yields = 0,
    yieldsThisFrame = 0,
    lastYieldTime = 0,
    dead = false,
  }
end

--- Hook coroutine.create, coroutine.wrap, coroutine.resume, and coroutine.yield.
function CoroutineMonitorPlugin:hook()
  if self._hooked then
    return
  end
  local plugin = self

  -- luacheck: push
  -- luacheck: ignore 122
  -- Hook coroutine.create
  self._origCreate = coroutine.create
  coroutine.create = function(f)
    local co = plugin._origCreate(f)
    plugin:addCoroutine(co)
    return co
  end

  -- Hook coroutine.wrap — returns a function, but we can get the thread
  self._origWrap = coroutine.wrap
  coroutine.wrap = function(f)
    local co = plugin._origCreate(f)
    plugin:addCoroutine(co, nil)
    -- Return a wrapper that calls resume internally (matching coroutine.wrap behavior)
    return function(...)
      local results = { coroutine.resume(co, ...) }
      local ok = results[1]
      if not ok then
        error(results[2], 2)
      end
      return select(2, unpack(results))
    end
  end

  -- Hook coroutine.resume to count yields
  self._origResume = coroutine.resume
  coroutine.resume = function(co, ...)
    local results = { plugin._origResume(co, ...) }
    -- If the coroutine yielded (status == "suspended" after resume), count it
    local status = coroutine.status(co)
    if status == "suspended" then
      local entry = plugin:_findEntry(co)
      if entry then
        entry.yields = entry.yields + 1
        entry.lastYieldTime = love.timer.getTime()
        plugin._frameYields[co] = (plugin._frameYields[co] or 0) + 1
      end
    end
    return unpack(results)
  end
  -- luacheck: pop

  self._hooked = true
end

--- Restore original coroutine functions.
function CoroutineMonitorPlugin:unhook()
  if not self._hooked then
    return
  end
  -- luacheck: push
  -- luacheck: ignore 122
  if self._origCreate then
    coroutine.create = self._origCreate
    self._origCreate = nil
  end
  if self._origWrap then
    coroutine.wrap = self._origWrap
    self._origWrap = nil
  end
  if self._origResume then
    coroutine.resume = self._origResume
    self._origResume = nil
  end
  -- luacheck: pop
  self._hooked = false
end

function CoroutineMonitorPlugin:update()
  -- Snapshot per-frame yields onto each entry, then reset counters
  for _, entry in ipairs(self.tracked) do
    entry.yieldsThisFrame = self._frameYields[entry.co] or 0
  end
  self._frameYields = {}

  -- Update dead status
  local deadCount = 0
  for _, entry in ipairs(self.tracked) do
    if not entry.dead then
      local status = coroutine.status(entry.co)
      if status == "dead" then
        entry.dead = true
      end
    end
    if entry.dead then
      deadCount = deadCount + 1
    end
  end
  self.totalDead = deadCount
end

function CoroutineMonitorPlugin:handleRequest()
  local now = love.timer.getTime()
  local rows = {}

  for _, entry in ipairs(self.tracked) do
    local status
    if entry.dead then
      status = "dead"
    else
      status = coroutine.status(entry.co)
    end

    -- Skip dead coroutines if filter is off
    if not self.showDead and status == "dead" then
      goto continue
    end

    local age = now - entry.created
    local lastYield = entry.lastYieldTime > 0 and string.format("%.1fs ago", now - entry.lastYieldTime) or "—"

    rows[#rows + 1] = {
      name = entry.label,
      status = status,
      yields = tostring(entry.yields),
      yieldsFrame = tostring(entry.yieldsThisFrame),
      lastYield = lastYield,
      age = string.format("%.1fs", age),
    }
    ::continue::
  end

  local columns = {
    { key = "name", label = "Name" },
    { key = "status", label = "Status" },
    { key = "yields", label = "Total Yields" },
    { key = "yieldsFrame", label = "Yields/Frame" },
    { key = "lastYield", label = "Last Yield" },
    { key = "age", label = "Age" },
  }

  return {
    type = "table",
    columns = columns,
    data = rows,
    loading = false,
  }
end

function CoroutineMonitorPlugin:handleActionRequest(request)
  local action = request.params and request.params.action
  if action == "clear-dead" then
    local live = {}
    for _, entry in ipairs(self.tracked) do
      if not entry.dead then
        live[#live + 1] = entry
      end
    end
    self.tracked = live
    return "Cleared dead coroutines"
  elseif action == "reset-counts" then
    for _, entry in ipairs(self.tracked) do
      entry.yields = 0
      entry.yieldsThisFrame = 0
    end
    return "Yield counters reset"
  end
  return nil, "Unknown action: " .. tostring(action)
end

function CoroutineMonitorPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.showDead ~= nil then
    self.showDead = params.showDead == "true" or params.showDead == true
  end
  return {}
end

function CoroutineMonitorPlugin:getConfig()
  local activeCount
  local suspendedCount = 0
  local deadCount = 0
  local runningCount = 0

  for _, entry in ipairs(self.tracked) do
    local status
    if entry.dead then
      status = "dead"
    else
      status = coroutine.status(entry.co)
    end
    if status == "suspended" then
      suspendedCount = suspendedCount + 1
    elseif status == "dead" then
      deadCount = deadCount + 1
    elseif status == "running" or status == "normal" then
      runningCount = runningCount + 1
    end
  end
  activeCount = suspendedCount + runningCount

  return {
    type = "coroutine-monitor",
    color = "#f59e0b",
    icon = "repeat",
    tabName = "Coroutines",
    actions = {
      -- Toolbar
      { label = "Clear Dead", key = "clear-dead", icon = "trash-2", type = "button" },
      { label = "Reset Counts", key = "reset-counts", icon = "rotate-ccw", type = "button" },
      { label = "Show Dead", key = "showDead", icon = "eye", type = "checkbox", value = tostring(self.showDead) },

      -- Summary card
      {
        label = "Tracked",
        key = "tracked",
        icon = "list",
        type = "input",
        value = tostring(#self.tracked),
        props = { disabled = true },
        group = "Summary",
      },
      {
        label = "Active",
        key = "active",
        icon = "play",
        type = "input",
        value = tostring(activeCount),
        props = { disabled = true },
        group = "Summary",
      },
      {
        label = "Suspended",
        key = "suspended",
        icon = "pause",
        type = "input",
        value = tostring(suspendedCount),
        props = { disabled = true },
        group = "Summary",
      },
      {
        label = "Running",
        key = "running",
        icon = "zap",
        type = "input",
        value = tostring(runningCount),
        props = { disabled = true },
        group = "Summary",
      },
      {
        label = "Dead",
        key = "dead",
        icon = "x-circle",
        type = "input",
        value = tostring(deadCount),
        props = { disabled = true },
        group = "Summary",
      },

      -- Lifetime card
      {
        label = "Total Created",
        key = "totalCreated",
        icon = "plus-circle",
        type = "input",
        value = tostring(self.totalCreated),
        props = { disabled = true },
        group = "Lifetime",
      },
      {
        label = "Total Dead",
        key = "totalDead",
        icon = "minus-circle",
        type = "input",
        value = tostring(self.totalDead),
        props = { disabled = true },
        group = "Lifetime",
      },
    },
  }
end

function CoroutineMonitorPlugin:finish()
  self:unhook()
end

return CoroutineMonitorPlugin
