local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

---@class RuntimeSnapshotPlugin: FeatherPlugin
---@field uptime number
---@field frames number
---@field peakMemory number
---@field minFps number|nil
---@field lastGcAt number
local RuntimeSnapshotPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.uptime = 0
    self.frames = 0
    self.peakMemory = 0
    self.minFps = nil
    self.lastGcAt = 0
  end,
})

local function formatBytes(kb)
  if kb >= 1024 * 1024 then
    return string.format("%.2f GB", kb / 1024 / 1024)
  end
  if kb >= 1024 then
    return string.format("%.2f MB", kb / 1024)
  end
  return string.format("%.0f KB", kb)
end

local function formatSeconds(seconds)
  if seconds >= 3600 then
    return string.format("%dh %02dm %02ds", seconds / 3600, (seconds / 60) % 60, seconds % 60)
  end
  if seconds >= 60 then
    return string.format("%dm %02ds", seconds / 60, seconds % 60)
  end
  return string.format("%.1fs", seconds)
end

local function yesNo(value)
  return value and "yes" or "no"
end

local function joinCapabilities(capabilities)
  if type(capabilities) ~= "table" or #capabilities == 0 then
    return "-"
  end
  return table.concat(capabilities, ", ")
end

local function getRendererInfo()
  if not love or not love.graphics or not love.graphics.getRendererInfo then
    return "-"
  end

  local ok, name, version, vendor, device = pcall(love.graphics.getRendererInfo)
  if not ok then
    return "-"
  end

  local parts = {}
  if vendor and #vendor > 0 then
    parts[#parts + 1] = vendor
  end
  if device and #device > 0 then
    parts[#parts + 1] = device
  end
  if name and #name > 0 then
    parts[#parts + 1] = name
  end
  if version and #version > 0 then
    parts[#parts + 1] = version
  end

  return #parts > 0 and table.concat(parts, " / ") or "-"
end

local function getOs()
  if love and love.system and love.system.getOS then
    return love.system.getOS()
  end
  return "-"
end

local function makeMetricRows(self, feather)
  local fps = love and love.timer and love.timer.getFPS and love.timer.getFPS() or 0
  local mem = collectgarbage("count")
  if mem > self.peakMemory then
    self.peakMemory = mem
  end
  if fps > 0 and (not self.minFps or fps < self.minFps) then
    self.minFps = fps
  end

  return {
    { metric = "FPS", value = tostring(fps) },
    { metric = "Lowest FPS", value = self.minFps and tostring(self.minFps) or "-" },
    { metric = "Memory", value = formatBytes(mem) },
    { metric = "Peak memory", value = formatBytes(self.peakMemory) },
    { metric = "Uptime", value = formatSeconds(self.uptime) },
    { metric = "Frames", value = tostring(self.frames) },
    { metric = "WebSocket", value = feather.wsConnected and "connected" or "disconnected" },
    { metric = "Asset preview", value = yesNo(feather.assetPreviewEnabled) },
    { metric = "Debugger", value = yesNo(feather.debuggerEnabled) },
  }
end

local function makePluginRows(feather)
  local rows = {}
  if not feather.pluginManager then
    return rows
  end

  for _, plugin in ipairs(feather.pluginManager:getPlugins() or {}) do
    rows[#rows + 1] = {
      id = plugin.identifier,
      status = plugin.disabled and "disabled" or "active",
      capabilities = joinCapabilities(plugin.capabilities),
    }
  end

  table.sort(rows, function(a, b)
    return a.id < b.id
  end)

  return rows
end

local function makeEnvironmentRows(feather)
  local saveDir = love and love.filesystem and love.filesystem.getSaveDirectory and love.filesystem.getSaveDirectory()
    or "-"

  return {
    { name = "Session", value = feather.sessionName ~= "" and feather.sessionName or feather.sessionId },
    { name = "Feather", value = tostring(feather.versionName or feather.version) },
    { name = "API", value = tostring(feather.version) },
    { name = "Love", value = love and love.getVersion and table.concat({ love.getVersion() }, ".") or "-" },
    { name = "OS", value = getOs() },
    { name = "Renderer", value = getRendererInfo() },
    { name = "Save directory", value = saveDir },
  }
end

function RuntimeSnapshotPlugin:update(dt)
  self.uptime = self.uptime + dt
  self.frames = self.frames + 1
end

function RuntimeSnapshotPlugin:handleRequest(_request, feather)
  local ui = feather.ui
  local fps = love and love.timer and love.timer.getFPS and love.timer.getFPS() or 0
  local memory = collectgarbage("count")

  return ui.render(ui.panel({
    title = "Runtime Snapshot",
    ui.row({
      ui.stat({ label = "FPS", value = tostring(fps), description = "Current frame rate" }),
      ui.stat({ label = "Memory", value = formatBytes(memory), description = "Lua heap" }),
      ui.stat({ label = "Uptime", value = formatSeconds(self.uptime), description = "Session runtime" }),
    }),
    ui.progress({
      label = "Frame budget",
      value = math.min(fps, 60),
      min = 0,
      max = 60,
      description = "Relative to a 60 FPS target",
    }),
    ui.alert({
      title = "Connection",
      value = feather.wsConnected and "Desktop bridge is connected." or "Desktop bridge is offline.",
      variant = feather.wsConnected and "default" or "destructive",
    }),
    ui.row({
      ui.button({ label = "Collect garbage", action = "collect-garbage" }),
      ui.button({ label = "Reset peaks", action = "reset-peaks" }),
    }),
    ui.tabs({
      ui.tab({
        id = "overview",
        title = "Overview",
        ui.table({
          columns = {
            { key = "metric", label = "Metric" },
            { key = "value", label = "Value" },
          },
          data = makeMetricRows(self, feather),
        }),
      }),
      ui.tab({
        id = "plugins",
        title = "Plugins",
        ui.table({
          columns = {
            { key = "id", label = "Plugin" },
            { key = "status", label = "Status" },
            { key = "capabilities", label = "Capabilities" },
          },
          data = makePluginRows(feather),
        }),
      }),
      ui.tab({
        id = "environment",
        title = "Environment",
        ui.table({
          columns = {
            { key = "name", label = "Name" },
            { key = "value", label = "Value" },
          },
          data = makeEnvironmentRows(feather),
        }),
      }),
    }),
  }))
end

function RuntimeSnapshotPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "collect-garbage" then
    collectgarbage("collect")
    self.lastGcAt = self.uptime
    self.peakMemory = collectgarbage("count")
    return true
  end

  if action == "reset-peaks" then
    self.peakMemory = collectgarbage("count")
    self.minFps = nil
    return true
  end

  return nil
end

function RuntimeSnapshotPlugin:getConfig()
  return {
    type = "runtime-snapshot",
    icon = "activity",
    tabName = "Runtime",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/runtime-snapshot",
    actions = {},
  }
end

return RuntimeSnapshotPlugin
