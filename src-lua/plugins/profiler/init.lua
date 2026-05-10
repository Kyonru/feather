local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

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

--- Profiler entry for a single tracked function.
---@class ProfilerEntry
---@field name string Display name
---@field calls number Total invocation count
---@field totalTime number Cumulative wall time (seconds)
---@field minTime number Fastest call (seconds)
---@field maxTime number Slowest call (seconds)
---@field depth number Current nesting depth (for recursive calls)
---@field activeStart number|nil Timestamp of most recent entry

---@class ProfilerPlugin: FeatherPlugin
---@field entries table<string, ProfilerEntry>
---@field order string[] Insertion-order list of names
---@field wrappers table<string, function> Wrapped functions keyed by name
---@field sortBy string Column to sort by
---@field sortDesc boolean Sort descending
local ProfilerPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.entries = {}
    self.order = {}
    self.wrappers = {}
    self.sortBy = "totalTime"
    self.sortDesc = true
  end,
})

--- Wrap a function for profiling.
--- Returns the wrapped function; the original is called transparently.
---@param name string  Display name for this function in the profiler table
---@param fn function  The original function to instrument
---@return function wrappedFn
function ProfilerPlugin:wrap(name, fn)
  if self.wrappers[name] then
    return self.wrappers[name]
  end

  if not self.entries[name] then
    self.entries[name] = {
      name = name,
      calls = 0,
      totalTime = 0,
      minTime = math.huge,
      maxTime = 0,
      depth = 0,
      activeStart = nil,
    }
    self.order[#self.order + 1] = name
  end

  local entry = self.entries[name]

  local wrapped = function(...)
    entry.depth = entry.depth + 1

    -- Only time the outermost call (avoid double-counting recursion)
    if entry.depth == 1 then
      entry.activeStart = gettime()
    end

    local results = { fn(...) }

    entry.depth = entry.depth - 1

    if entry.depth == 0 and entry.activeStart then
      local elapsed = gettime() - entry.activeStart
      entry.activeStart = nil
      entry.calls = entry.calls + 1
      entry.totalTime = entry.totalTime + elapsed
      if elapsed < entry.minTime then
        entry.minTime = elapsed
      end
      if elapsed > entry.maxTime then
        entry.maxTime = elapsed
      end
    end

    return unpack(results)
  end

  self.wrappers[name] = wrapped
  return wrapped
end

--- Reset all profiling data.
function ProfilerPlugin:reset()
  for _, entry in pairs(self.entries) do
    entry.calls = 0
    entry.totalTime = 0
    entry.minTime = math.huge
    entry.maxTime = 0
  end
end

--- Format a time value for display.
---@param seconds number
---@return string
local function formatTime(seconds)
  if seconds == math.huge or seconds ~= seconds then
    return "-"
  end
  if seconds >= 1 then
    return string.format("%.3f s", seconds)
  elseif seconds >= 0.001 then
    return string.format("%.3f ms", seconds * 1000)
  else
    return string.format("%.1f µs", seconds * 1000000)
  end
end

--- Build sorted rows for the profiler table.
---@return table[] rows
function ProfilerPlugin:_buildRows()
  local rows = {}
  for _, name in ipairs(self.order) do
    local e = self.entries[name]
    if e and e.calls > 0 then
      rows[#rows + 1] = {
        name = e.name,
        calls = e.calls,
        totalTime = e.totalTime,
        avgTime = e.totalTime / e.calls,
        minTime = e.minTime,
        maxTime = e.maxTime,
      }
    end
  end

  local sortKey = self.sortBy
  local desc = self.sortDesc
  table.sort(rows, function(a, b)
    if desc then
      return (a[sortKey] or 0) > (b[sortKey] or 0)
    else
      return (a[sortKey] or 0) < (b[sortKey] or 0)
    end
  end)

  return rows
end

--- Return data for the desktop plugin table.
--- Called by plugin_manager:pushAll() via handleRequest().
function ProfilerPlugin:handleRequest(_request, _feather)
  local rows = self:_buildRows()

  local tableRows = {}
  for i, row in ipairs(rows) do
    tableRows[i] = {
      name = row.name,
      calls = tostring(row.calls),
      totalTime = formatTime(row.totalTime),
      avgTime = formatTime(row.avgTime),
      minTime = formatTime(row.minTime),
      maxTime = formatTime(row.maxTime),
    }
  end

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "name", label = "Function" },
      { key = "calls", label = "Calls" },
      { key = "totalTime", label = "Total" },
      { key = "avgTime", label = "Avg" },
      { key = "minTime", label = "Min" },
      { key = "maxTime", label = "Max" },
    },
    data = tableRows,
  }
end

function ProfilerPlugin:handleActionRequest(request, _feather)
  local action = request.params and request.params.action
  if action == "reset" then
    self:reset()
    return true
  end
end

function ProfilerPlugin:handleParamsUpdate(request, _feather)
  local params = request.params or {}
  if params.sortBy then
    self.sortBy = params.sortBy
  end
  if params.sortDesc ~= nil then
    self.sortDesc = params.sortDesc == "true" or params.sortDesc == true
  end
end

function ProfilerPlugin:getConfig()
  return {
    type = "profiler",
    icon = "timer",
    tabName = "Profiler",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/profiler",
    actions = {
      { label = "Reset", key = "reset", icon = "rotate-ccw", type = "button" },
    },
  }
end

return ProfilerPlugin
