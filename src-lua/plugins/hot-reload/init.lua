local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")
local Base = require(FEATHER_PATH .. ".core.base")

local PLUGIN_PATH = (...):gsub("%.init$", "")
local HotReloader = require(PLUGIN_PATH .. ".hot_reloader")

local function currentTime()
  if love and love.timer and love.timer.getTime then
    return love.timer.getTime()
  end
  return os.clock()
end

local HotReloadPlugin = Class({
  __includes = Base,
  init = function(self, config)
    Base.init(self, config)
    self.feather = config.feather

    local options = {}
    for key, value in pairs(self.options or {}) do
      options[key] = value
    end
    local source = self.feather and self.feather.hotReloadConfig or {}
    for key, value in pairs(source or {}) do
      options[key] = value
    end

    self.reloader = HotReloader(self.feather, options)
    self.toast = nil
    self.toastDuration = options.toastDuration or 2.5
    self.showOverlay = options.showOverlay ~= false
    if self.feather then
      self.feather.hotReloader = self.reloader
    end
  end,
})

function HotReloadPlugin:showToast(kind, message)
  if not self.showOverlay then
    return
  end
  self.toast = {
    kind = kind or "info",
    message = tostring(message or ""),
    expiresAt = currentTime() + self.toastDuration,
  }
end

function HotReloadPlugin:sendState(feather)
  if not self.reloader then
    return
  end
  feather:__sendWs(json.encode({
    type = "hot_reload:state",
    session = feather.sessionId,
    data = self.reloader:getState(),
  }))
end

function HotReloadPlugin:handleHotReloadCommand(msg, feather)
  if not self.reloader then
    return
  end

  if msg.type == "cmd:hot_reload:module" and type(msg.data) == "table" then
    local ok, err, persisted = self.reloader:reload(msg.data.module, msg.data.source)
    local moduleName = msg.data.module or "module"
    if ok then
      self:showToast("success", "Hot reloaded " .. moduleName .. (persisted and " (saved)" or ""))
    else
      self:showToast("error", "Hot reload failed: " .. moduleName)
    end
    feather:__sendWs(json.encode({
      type = "hot_reload:result",
      session = feather.sessionId,
      data = {
        ok = ok == true,
        module = msg.data.module or "",
        error = err,
        persisted = persisted == true,
        state = self.reloader:getState(),
      },
    }))
    self:sendState(feather)
    return
  end

  if msg.type == "cmd:hot_reload:restore" then
    self.reloader:restore()
    self:showToast("info", "Hot reload restored original modules")
    self:sendState(feather)
    return
  end

  if msg.type == "req:hot_reload:state" then
    self:sendState(feather)
  end
end

function HotReloadPlugin:onDraw()
  local toast = self.toast
  if not toast or currentTime() >= toast.expiresAt then
    self.toast = nil
    return
  end
  if not love or not love.graphics then
    return
  end

  local g = love.graphics
  local width = g.getWidth and g.getWidth() or 800
  local font = g.getFont and g.getFont() or nil
  local message = toast.message
  local textWidth = math.min(width - 48, 420)
  local wrapped = { message }
  if font and font.getWrap then
    local _, lines = font:getWrap(message, textWidth - 24)
    wrapped = lines or wrapped
  end
  local lineHeight = font and font:getHeight() or 14
  local boxHeight = math.max(44, (#wrapped * lineHeight) + 22)
  local boxWidth = textWidth
  local x = math.max(12, width - boxWidth - 18)
  local y = 18

  local r, gc, b, a = g.getColor()
  local bg = toast.kind == "error" and { 0.35, 0.07, 0.08 } or toast.kind == "success" and { 0.08, 0.27, 0.16 } or { 0.12, 0.13, 0.18 }
  g.setColor(0, 0, 0, 0.35)
  g.rectangle("fill", x + 3, y + 4, boxWidth, boxHeight, 6, 6)
  g.setColor(bg[1], bg[2], bg[3], 0.92)
  g.rectangle("fill", x, y, boxWidth, boxHeight, 6, 6)
  g.setColor(1, 1, 1, 0.95)
  g.printf(message, x + 12, y + 11, boxWidth - 24, "left")
  g.setColor(r, gc, b, a)
end

function HotReloadPlugin:getConfig()
  return {
    type = "hot-reload",
    icon = "refresh-cw",
  }
end

return HotReloadPlugin
