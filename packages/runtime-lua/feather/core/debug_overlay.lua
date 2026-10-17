local Class = require(FEATHER_PATH .. ".lib.class")

local DebugOverlay = Class({})

local DEFAULTS = {
  enabled = true,
  visible = true,
  hideKey = "f12",
  touchToggle = true,
  corner = "top-right",
  text = true,
}

local function withDefault(value, fallback)
  if value == nil then
    return fallback
  end
  return value
end

function DebugOverlay:init(feather, config)
  config = config or {}
  if config == false then
    config = { enabled = false }
  end

  self.feather = feather
  self.enabled = withDefault(config.enabled, DEFAULTS.enabled)
  self.visible = withDefault(config.visible, DEFAULTS.visible)
  self.hideKey = config.hideKey or DEFAULTS.hideKey
  self.touchToggle = withDefault(config.touchToggle, DEFAULTS.touchToggle)
  self.corner = config.corner or DEFAULTS.corner
  self.text = withDefault(config.text, DEFAULTS.text)
  self._lastTouchTime = 0
  self._doubleTapWindow = config.doubleTapWindow or 0.35
  self._touchSize = config.touchSize or 96
  self.toast = nil
  self.toastDuration = config.toastDuration or 3
end

function DebugOverlay:toggle()
  self.visible = not self.visible
end

function DebugOverlay:onKeypressed(key)
  if not self.enabled then
    return
  end
  if key == self.hideKey then
    self:toggle()
  end
end

function DebugOverlay:_isInCorner(x, y)
  if not love or not love.graphics then
    return false
  end
  local width, height = love.graphics.getDimensions()
  local size = self._touchSize

  if self.corner == "top-left" then
    return x <= size and y <= size
  elseif self.corner == "bottom-left" then
    return x <= size and y >= height - size
  elseif self.corner == "bottom-right" then
    return x >= width - size and y >= height - size
  end

  return x >= width - size and y <= size
end

function DebugOverlay:onTouchpressed(_id, x, y)
  if not self.enabled or not self.touchToggle then
    return
  end
  if not self:_isInCorner(x, y) then
    return
  end

  local now = love and love.timer and love.timer.getTime and love.timer.getTime() or os.clock()
  if now - self._lastTouchTime <= self._doubleTapWindow then
    self:toggle()
    self._lastTouchTime = 0
  else
    self._lastTouchTime = now
  end
end

function DebugOverlay:_status()
  local feather = self.feather
  if feather.featherDebugger and feather.featherDebugger.paused then
    return "paused", { 1.0, 0.78, 0.28, 1 }
  end
  if feather.mode == "disk" then
    return "disk mode", { 0.52, 0.78, 1.0, 1 }
  end
  if feather.wsConnected then
    return "connected", { 0.35, 1.0, 0.55, 1 }
  end
  if feather.__connState == "authenticating" or feather.__connState == "idle" then
    return "connecting", { 0.52, 0.78, 1.0, 1 }
  end
  return "disconnected", { 1.0, 0.38, 0.38, 1 }
end

local function currentTime()
  if love and love.timer and love.timer.getTime then
    return love.timer.getTime()
  end
  return os.clock()
end

function DebugOverlay:showToast(kind, message, duration)
  if not self.enabled then
    return
  end

  self.toast = {
    kind = kind or "info",
    message = tostring(message or ""),
    expiresAt = currentTime() + (duration or self.toastDuration),
  }
end

function DebugOverlay:_drawToast(g, yOffset)
  local toast = self.toast
  if not toast then
    return
  end
  if currentTime() >= toast.expiresAt then
    self.toast = nil
    return
  end

  local width = g.getWidth and g.getWidth() or 800
  local font = g.getFont and g.getFont() or nil
  local message = toast.message
  local textWidth = math.min(width - 48, 440)
  local wrapped = { message }
  if font and font.getWrap then
    local _, lines = font:getWrap(message, textWidth - 24)
    wrapped = lines or wrapped
  end

  local lineHeight = font and font:getHeight() or 14
  local boxHeight = math.max(44, (#wrapped * lineHeight) + 22)
  local boxWidth = textWidth
  local x = math.max(12, width - boxWidth - 18)
  local y = 18 + (yOffset or 0)
  local bg = toast.kind == "error" and { 0.35, 0.07, 0.08 } or { 0.12, 0.13, 0.18 }

  g.setColor(0, 0, 0, 0.35)
  g.rectangle("fill", x + 3, y + 4, boxWidth, boxHeight, 6, 6)
  g.setColor(bg[1], bg[2], bg[3], 0.92)
  g.rectangle("fill", x, y, boxWidth, boxHeight, 6, 6)
  g.setColor(1, 1, 1, 0.95)
  g.printf(message, x + 12, y + 11, boxWidth - 24, "left")
end

function DebugOverlay:onDraw()
  if not self.enabled then
    return
  end
  if not love or not love.graphics then
    return
  end

  pcall(function()
    local g = love.graphics
    local text, accent = self:_status()
    local label = "Feather debugger enabled · " .. text
    local font = g.getFont()
    local paddingX, paddingY = 8, 5
    local textWidth = self.text and font and font:getWidth(label) or (self.text and #label * 7 or 0)
    local textHeight = self.text and font and font:getHeight() or 14
    local width = textWidth + paddingX * 2
    local height = textHeight + paddingY * 2
    local screenWidth = g.getWidth()
    local x = math.max(8, screenWidth - width - 10)
    local y = 10

    if g.push then
      g.push("all")
    end
    if self.visible then
      g.setColor(0.04, 0.05, 0.07, 0.82)
      g.rectangle("fill", x, y, width, height, 5, 5)
      g.setColor(accent)
      g.rectangle("fill", x, y, 4, height, 5, 5)
      if self.text then
        g.setColor(1, 1, 1, 0.92)
        g.print(label, x + paddingX, y + paddingY)
      end
    end
    self:_drawToast(g, self.visible and height + 8 or 0)
    if g.pop then
      g.pop()
    end
  end)
end

return DebugOverlay
