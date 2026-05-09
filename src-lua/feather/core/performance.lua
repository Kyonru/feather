local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

local DISK_SCAN_INTERVAL = 5 -- seconds between save-dir scans
local FRAME_WINDOW = 60      -- frames for rolling min/max/avg

local function getDirSize(path)
  local total = 0
  local ok, items = pcall(love.filesystem.getDirectoryItems, path)
  if not ok or not items then return 0 end
  for _, item in ipairs(items) do
    local fullPath = (path == "" or path == "/") and item or (path .. "/" .. item)
    local info = love.filesystem.getInfo(fullPath)
    if info then
      if info.type == "file" then
        total = total + (info.size or 0)
      elseif info.type == "directory" then
        total = total + getDirSize(fullPath)
      end
    end
  end
  return total
end

local FeatherPerformance = Class({
  __includes = Base,
  init = function(self, config)
    self.config = config
    self.sysInfo = {
      arch = love.system.getOS() ~= "Web" and require("ffi").arch or "Web",
      os = love.system.getOS(),
      cpuCount = love.system.getProcessorCount(),
    }
    self.supported = love.graphics.getSupported()
    self._diskUsageEnabled = false
    self._diskUsage = 0
    self._diskScanTimer = DISK_SCAN_INTERVAL
    self._peakMemory = 0
    self._frameTimes = {}
  end,
})

function FeatherPerformance:getResponseBody(dt)
  -- Rolling frame-time window (seconds)
  local frameTimes = self._frameTimes
  frameTimes[#frameTimes + 1] = dt
  if #frameTimes > FRAME_WINDOW then
    table.remove(frameTimes, 1)
  end

  local ftMin, ftMax, ftSum = math.huge, 0, 0
  for _, ft in ipairs(frameTimes) do
    if ft < ftMin then ftMin = ft end
    if ft > ftMax then ftMax = ft end
    ftSum = ftSum + ft
  end
  local ftAvg = ftSum / #frameTimes

  -- Disk usage: scan save dir every DISK_SCAN_INTERVAL seconds (opt-in)
  if self._diskUsageEnabled then
    self._diskScanTimer = self._diskScanTimer + dt
    if self._diskScanTimer >= DISK_SCAN_INTERVAL then
      self._diskScanTimer = 0
      self._diskUsage = getDirSize("")
    end
  else
    self._diskUsage = 0
    self._diskScanTimer = DISK_SCAN_INTERVAL
  end

  -- Peak Lua heap memory (KB, normalised to MB on the desktop side)
  local mem = collectgarbage("count")
  if mem > self._peakMemory then
    self._peakMemory = mem
  end

  return {
    sysInfo = self.sysInfo,
    supported = self.supported,
    memory = mem,
    peakMemory = self._peakMemory,
    diskUsage = self._diskUsage,
    stats = love.graphics.getStats(),
    fps = love.timer.getFPS(),
    frameTime = dt,
    frameTimeMin = ftMin == math.huge and dt or ftMin,
    frameTimeMax = ftMax,
    frameTimeAvg = ftAvg,
    vsyncEnabled = love.window.getVSync() == 1,
    time = os.time(),
    gameTime = love.timer.getTime(),
  }
end

return FeatherPerformance
