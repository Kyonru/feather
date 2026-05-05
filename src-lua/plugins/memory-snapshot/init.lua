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

--- Count entries in a table (works for non-sequential tables too).
---@param t table
---@return number
local function tableCount(t)
  local n = 0
  for _ in pairs(t) do
    n = n + 1
  end
  return n
end

--- Recursively estimate memory usage of a table in bytes.
--- Tracks visited tables to avoid cycles. Uses rough estimates
--- for Lua value sizes (8 bytes per value slot, 40 bytes per table header,
--- string length + 24 bytes overhead).
---@param t table
---@param visited table|nil
---@return number bytes
local function estimateTableSize(t, visited)
  visited = visited or {}
  if visited[t] then
    return 0
  end
  visited[t] = true

  -- Table header overhead (~40 bytes in LuaJIT/Lua 5.1)
  local size = 40
  for k, v in pairs(t) do
    -- Key size
    local kt = type(k)
    if kt == "string" then
      size = size + #k + 24
    else
      size = size + 8
    end
    -- Value size
    local vt = type(v)
    if vt == "table" then
      size = size + estimateTableSize(v, visited)
    elseif vt == "string" then
      size = size + #v + 24
    else
      size = size + 8
    end
  end
  return size
end

---@class TrackedTable
---@field name string
---@field getter function  Returns the table to measure
---@field label string|nil  Optional display label

---@class MemorySnapshot
---@field id number
---@field label string
---@field time number         Wall-clock timestamp
---@field gameTime number     Game time (seconds)
---@field gcCount number      collectgarbage("count") in KB
---@field tables table<string, {count: number, sizeBytes: number}>

---@class MemorySnapshotPlugin: FeatherPlugin
---@field snapshots MemorySnapshot[]
---@field trackedTables TrackedTable[]
---@field nextId number
---@field maxSnapshots number
---@field selectedA number|nil  Snapshot ID for diff left
---@field selectedB number|nil  Snapshot ID for diff right
---@field viewMode string       "snapshots" | "diff"
---@field autoInterval number   0 = disabled, >0 = seconds between auto-snapshots
---@field _autoTimer number
local MemorySnapshotPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.snapshots = {}
    self.trackedTables = {}
    self.nextId = 1
    self.maxSnapshots = self.options.maxSnapshots or 100
    self.autoInterval = self.options.autoInterval or 0
    self._autoTimer = 0
    self.selectedA = nil
    self.selectedB = nil
    self.viewMode = "snapshots"
  end,
})

--- Register a table to track in snapshots.
---@param name string   Unique key for this table
---@param getter function  A function that returns the table to measure (called at snapshot time)
---@param label string|nil  Optional display label (defaults to name)
function MemorySnapshotPlugin:trackTable(name, getter, label)
  -- Replace if already tracked
  for i, t in ipairs(self.trackedTables) do
    if t.name == name then
      self.trackedTables[i] = { name = name, getter = getter, label = label or name }
      return
    end
  end
  self.trackedTables[#self.trackedTables + 1] = {
    name = name,
    getter = getter,
    label = label or name,
  }
end

--- Remove a tracked table.
---@param name string
function MemorySnapshotPlugin:untrackTable(name)
  for i, t in ipairs(self.trackedTables) do
    if t.name == name then
      table.remove(self.trackedTables, i)
      return
    end
  end
end

--- Take a snapshot now.
---@param label string|nil
---@return MemorySnapshot
function MemorySnapshotPlugin:takeSnapshot(label)
  collectgarbage("collect")
  local gcCount = collectgarbage("count")

  local tables = {}
  for _, tracked in ipairs(self.trackedTables) do
    local ok, tbl = pcall(tracked.getter)
    if ok and type(tbl) == "table" then
      tables[tracked.name] = {
        count = tableCount(tbl),
        sizeBytes = estimateTableSize(tbl),
      }
    else
      tables[tracked.name] = { count = 0, sizeBytes = 0 }
    end
  end

  local snapshot = {
    id = self.nextId,
    label = label or ("Snapshot #" .. self.nextId),
    time = os.time(),
    gameTime = love and love.timer and love.timer.getTime() or gettime(),
    gcCount = gcCount,
    tables = tables,
  }
  self.nextId = self.nextId + 1
  self.snapshots[#self.snapshots + 1] = snapshot

  -- Trim oldest
  while #self.snapshots > self.maxSnapshots do
    table.remove(self.snapshots, 1)
  end

  return snapshot
end

local function formatKB(kb)
  if kb < 1024 then
    return string.format("%.1f KB", kb)
  else
    return string.format("%.2f MB", kb / 1024)
  end
end

local function formatBytes(bytes)
  if bytes < 1024 then
    return bytes .. " B"
  elseif bytes < 1024 * 1024 then
    return string.format("%.1f KB", bytes / 1024)
  else
    return string.format("%.2f MB", bytes / (1024 * 1024))
  end
end

local function formatDelta(delta, unit)
  local sign = delta >= 0 and "+" or ""
  if unit == "kb" then
    return sign .. formatKB(delta)
  else
    return sign .. formatBytes(delta)
  end
end

--- Build the snapshots list view.
function MemorySnapshotPlugin:_buildSnapshotRows()
  local rows = {}
  for i = #self.snapshots, 1, -1 do
    local s = self.snapshots[i]
    local tablesSummary = {}
    for name, info in pairs(s.tables) do
      tablesSummary[#tablesSummary + 1] = name .. "(" .. info.count .. ")"
    end

    local deltaStr = ""
    if i > 1 then
      local prev = self.snapshots[i - 1]
      local delta = s.gcCount - prev.gcCount
      deltaStr = formatDelta(delta, "kb")
    end

    rows[#rows + 1] = {
      id = tostring(s.id),
      label = s.label,
      gcMemory = formatKB(s.gcCount),
      delta = deltaStr,
      tables = table.concat(tablesSummary, ", "),
      gameTime = string.format("%.2f", s.gameTime),
    }
  end
  return rows
end

--- Build the diff view between two snapshots.
function MemorySnapshotPlugin:_buildDiffRows(idA, idB)
  local snapA, snapB
  for _, s in ipairs(self.snapshots) do
    if s.id == idA then
      snapA = s
    end
    if s.id == idB then
      snapB = s
    end
  end
  if not snapA or not snapB then
    return {}
  end

  -- Ensure A is the earlier snapshot
  if snapA.id > snapB.id then
    snapA, snapB = snapB, snapA
  end

  local rows = {}

  -- GC memory row
  local gcDelta = snapB.gcCount - snapA.gcCount
  rows[#rows + 1] = {
    metric = "GC Memory",
    snapshotA = formatKB(snapA.gcCount),
    snapshotB = formatKB(snapB.gcCount),
    delta = formatDelta(gcDelta, "kb"),
    status = gcDelta > 0 and "▲ grew" or (gcDelta < 0 and "▼ shrunk" or "— same"),
  }

  -- Collect all table names
  local allNames = {}
  local seen = {}
  for name in pairs(snapA.tables) do
    if not seen[name] then
      allNames[#allNames + 1] = name
      seen[name] = true
    end
  end
  for name in pairs(snapB.tables) do
    if not seen[name] then
      allNames[#allNames + 1] = name
      seen[name] = true
    end
  end
  table.sort(allNames)

  for _, name in ipairs(allNames) do
    local a = snapA.tables[name] or { count = 0, sizeBytes = 0 }
    local b = snapB.tables[name] or { count = 0, sizeBytes = 0 }
    local countDelta = b.count - a.count
    local sizeDelta = b.sizeBytes - a.sizeBytes

    local status
    if sizeDelta > 0 then
      status = "▲ leak?"
    elseif sizeDelta < 0 then
      status = "▼ shrunk"
    else
      status = "— same"
    end

    rows[#rows + 1] = {
      metric = name .. " (count)",
      snapshotA = tostring(a.count),
      snapshotB = tostring(b.count),
      delta = (countDelta >= 0 and "+" or "") .. countDelta,
      status = countDelta > 0 and "▲ grew" or (countDelta < 0 and "▼ shrunk" or "— same"),
    }
    rows[#rows + 1] = {
      metric = name .. " (size)",
      snapshotA = formatBytes(a.sizeBytes),
      snapshotB = formatBytes(b.sizeBytes),
      delta = formatDelta(sizeDelta, "bytes"),
      status = status,
    }
  end

  return rows
end

function MemorySnapshotPlugin:update(dt)
  -- Auto-snapshot
  if self.autoInterval > 0 then
    self._autoTimer = self._autoTimer + dt
    if self._autoTimer >= self.autoInterval then
      self._autoTimer = 0
      self:takeSnapshot("Auto @" .. string.format("%.1f", love and love.timer and love.timer.getTime() or 0) .. "s")
    end
  end
end

function MemorySnapshotPlugin:handleRequest()
  if self.viewMode == "diff" and self.selectedA and self.selectedB then
    return {
      type = "table",
      loading = false,
      columns = {
        { key = "metric", label = "Metric" },
        { key = "snapshotA", label = "Snapshot A" },
        { key = "snapshotB", label = "Snapshot B" },
        { key = "delta", label = "Delta" },
        { key = "status", label = "Status" },
      },
      data = self:_buildDiffRows(self.selectedA, self.selectedB),
    }
  end

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "id", label = "#" },
      { key = "label", label = "Label" },
      { key = "gcMemory", label = "GC Memory" },
      { key = "delta", label = "Δ vs Prev" },
      { key = "tables", label = "Tracked Tables" },
      { key = "gameTime", label = "Time (s)" },
    },
    data = self:_buildSnapshotRows(),
  }
end

function MemorySnapshotPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "snapshot" then
    local snap = self:takeSnapshot()
    return { data = "Snapshot #" .. snap.id .. " taken — GC: " .. formatKB(snap.gcCount) }
  end

  if action == "clear" then
    self.snapshots = {}
    self.nextId = 1
    self.selectedA = nil
    self.selectedB = nil
    self.viewMode = "snapshots"
    return { data = "All snapshots cleared" }
  end

  if action == "diff" then
    if #self.snapshots < 2 then
      return nil, "Need at least 2 snapshots to diff"
    end
    -- Default: diff first vs last
    self.selectedA = self.snapshots[1].id
    self.selectedB = self.snapshots[#self.snapshots].id
    self.viewMode = "diff"
    return { data = "Showing diff: #" .. self.selectedA .. " vs #" .. self.selectedB }
  end

  if action == "list" then
    self.viewMode = "snapshots"
    return { data = "Showing snapshot list" }
  end

  if action == "export" then
    local exportData = {}
    for _, s in ipairs(self.snapshots) do
      exportData[#exportData + 1] = {
        id = s.id,
        label = s.label,
        time = s.time,
        gameTime = s.gameTime,
        gcCount = s.gcCount,
        tables = s.tables,
      }
    end
    return {
      data = "Export ready",
      download = {
        filename = "memory_snapshots_" .. os.time() .. ".json",
        content = json.encode(exportData),
      },
    }
  end

  if action == "gc" then
    local before = collectgarbage("count")
    collectgarbage("collect")
    local after = collectgarbage("count")
    local freed = before - after
    return { data = "GC collected — freed " .. formatKB(freed) .. " (now " .. formatKB(after) .. ")" }
  end

  return nil, "Unknown action: " .. tostring(action)
end

function MemorySnapshotPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.autoInterval ~= nil then
    local val = tonumber(params.autoInterval)
    if val then
      self.autoInterval = val
      self._autoTimer = 0
    end
  end
  if params.diffA ~= nil then
    self.selectedA = tonumber(params.diffA)
  end
  if params.diffB ~= nil then
    self.selectedB = tonumber(params.diffB)
  end
end

function MemorySnapshotPlugin:getConfig()
  return {
    type = "memory",
    icon = "hard-drive",
    tabName = "Memory",
    actions = {
      {
        label = "Take Snapshot",
        key = "snapshot",
        icon = "camera",
        type = "button",
      },
      {
        label = "Force GC",
        key = "gc",
        icon = "refresh-cw",
        type = "button",
      },
      {
        label = "Diff First ↔ Last",
        key = "diff",
        icon = "git-compare",
        type = "button",
      },
      {
        label = "Show List",
        key = "list",
        icon = "list",
        type = "button",
      },
      {
        label = "Auto Interval (s)",
        key = "autoInterval",
        icon = "clock",
        type = "input",
        value = tostring(self.autoInterval),
        props = { type = "number", min = 0, max = 300, placeholder = "0 = off" },
      },
      {
        label = "Diff Snapshot A",
        key = "diffA",
        icon = "arrow-left",
        type = "input",
        value = self.selectedA and tostring(self.selectedA) or "",
        props = { type = "number", min = 1, placeholder = "Snapshot # for A" },
      },
      {
        label = "Diff Snapshot B",
        key = "diffB",
        icon = "arrow-right",
        type = "input",
        value = self.selectedB and tostring(self.selectedB) or "",
        props = { type = "number", min = 1, placeholder = "Snapshot # for B" },
      },
      {
        label = "Clear",
        key = "clear",
        icon = "trash-2",
        type = "button",
      },
      {
        label = "Export",
        key = "export",
        icon = "download",
        type = "button",
      },
    },
  }
end

return MemorySnapshotPlugin
