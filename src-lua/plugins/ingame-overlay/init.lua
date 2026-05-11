local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

local PLUGIN_PATH = (...):gsub("%.init$", "")
local overlayStats = require(PLUGIN_PATH .. ".overlay_stats")

---@class IngameOverlayPlugin: FeatherPlugin
---@field overlay table
local IngameOverlayPlugin = Class({
  __includes = Base,
  init = function(self, config)
    Base.init(self, config)
    self.overlay = overlayStats
    self.overlay.sampleSize = self.options.sampleSize or self.overlay.sampleSize
    self.overlay.touch.cornerSize = self.options.touchCornerSize or self.overlay.touch.cornerSize
    self.overlay.touch.doubleTapThreshold = self.options.doubleTapThreshold or self.overlay.touch.doubleTapThreshold
    self.overlay.load()
    if self.options.visible == true then
      self.overlay.isActive = true
    end
  end,
})

function IngameOverlayPlugin:update(dt)
  self.overlay.update(dt)
end

function IngameOverlayPlugin:onDraw()
  self.overlay.draw()
end

function IngameOverlayPlugin:onKeypressed(key)
  self.overlay.handleKeyboard(key)
end

function IngameOverlayPlugin:onTouchpressed(id, x, y, dx, dy, pressure)
  self.overlay.handleTouch(id, x, y, dx, dy, pressure)
end

function IngameOverlayPlugin:registerParticleSystem(particleSystem)
  self.overlay.registerParticleSystem(particleSystem)
end

function IngameOverlayPlugin:unregisterParticleSystem(particleSystem)
  self.overlay.unregisterParticleSystem(particleSystem)
end

function IngameOverlayPlugin:getConfig()
  return {
    type = "ingame-overlay",
    tabName = "In-Game Overlay",
    icon = "activity",
  }
end

return IngameOverlayPlugin
