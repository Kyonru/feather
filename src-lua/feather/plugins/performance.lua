local PATH = string.sub(..., 1, string.len(...) - string.len("plugins.performance"))

local Class = require(PATH .. ".lib.class")
local Base = require(PATH .. ".plugins.base")

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
  end,
})

function FeatherPerformance:getResponseBody(dt)
  return {
    sysInfo = self.sysInfo,
    supported = self.supported,
    memory = collectgarbage("count"),
    stats = love.graphics.getStats(),
    fps = love.timer.getFPS(),
    frameTime = dt,
    vsyncEnabled = love.window.getVSync() == 1,
    time = os.time(),
  }
end

return FeatherPerformance
