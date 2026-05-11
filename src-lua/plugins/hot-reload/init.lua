local Class = require(FEATHER_PATH .. ".lib.class")
local json = require(FEATHER_PATH .. ".lib.json")
local Base = require(FEATHER_PATH .. ".core.base")

local PLUGIN_PATH = (...):gsub("%.init$", "")
local HotReloader = require(PLUGIN_PATH .. ".hot_reloader")

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
    if self.feather then
      self.feather.hotReloader = self.reloader
    end
  end,
})

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
    self:sendState(feather)
    return
  end

  if msg.type == "req:hot_reload:state" then
    self:sendState(feather)
  end
end

function HotReloadPlugin:getConfig()
  return {
    type = "hot-reload",
    icon = "refresh-cw",
  }
end

return HotReloadPlugin
