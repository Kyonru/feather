local Class = require(FEATHER_PATH .. ".lib.class")

---@class FeatherPlugin
---@field options table
---@field logger FeatherLogger
---@field observer FeatherObserver
---@field init fun(self: FeatherPlugin, config: table)
---@field update fun(self: FeatherPlugin, dt: number, feather: Feather): ...
---@field onerror fun(self: FeatherPlugin, msg: string, feather: Feather): ...
---@field handleRequest fun(self: FeatherPlugin, request: table, feather: Feather): ...
---@field handleActionRequest fun(self: FeatherPlugin, request: table, feather: Feather): ...
---@field handleActionCancel fun(self: FeatherPlugin, request: table, feather: Feather): ...
---@field handleParamsUpdate fun(self: FeatherPlugin, request: table, feather: Feather): ...
---@field isSupported fun(self: FeatherPlugin, version: number): boolean
---@field finish fun(self: FeatherPlugin, feather: Feather): ...
---@field getConfig fun(self: FeatherPlugin): table
---@field onDraw fun(self: FeatherPlugin)
---@field onKeypressed fun(self: FeatherPlugin, key: string, scancode: string, isrepeat: boolean)
---@field onKeyreleased fun(self: FeatherPlugin, key: string, scancode: string)
---@field onMousepressed fun(self: FeatherPlugin, x: number, y: number, button: number, istouch: boolean, presses: number)
---@field onMousereleased fun(self: FeatherPlugin, x: number, y: number, button: number, istouch: boolean, presses: number)
---@field onTouchpressed fun(self: FeatherPlugin, id: lightuserdata, x: number, y: number, dx: number, dy: number, pressure: number)
---@field onTouchreleased fun(self: FeatherPlugin, id: lightuserdata, x: number, y: number, dx: number, dy: number, pressure: number)
---@field onJoystickpressed fun(self: FeatherPlugin, joystick: table, button: number)
---@field onJoystickreleased fun(self: FeatherPlugin, joystick: table, button: number)
local FeatherPlugin = Class({})

function FeatherPlugin:init(config)
  self.options = config.options or {}
  self.logger = config.logger or {}
  self.observer = config.observer or {}
  self.api = config.api
  self.minApi = config.minApi
  self.maxApi = config.maxApi
end

function FeatherPlugin:update(dt)
  return self, dt
end

function FeatherPlugin:onerror(msg)
  return self, msg
end

function FeatherPlugin:handleRequest()
  return nil
end

function FeatherPlugin:handleActionRequest()
  return nil
end

function FeatherPlugin:handleActionCancel()
  return nil
end

function FeatherPlugin:handleParamsUpdate()
  return {}
end

--- Verify if the plugin is supported by the current plugin api version of Feather
---@param version number
function FeatherPlugin:isSupported(version)
  if self.api ~= nil then
    if type(self.api) == "number" then
      return version == self.api
    end
    if type(self.api) == "table" then
      for _, api in ipairs(self.api) do
        if version == api then
          return true
        end
      end
      if self.api.min ~= nil and version < self.api.min then
        return false
      end
      if self.api.max ~= nil and version > self.api.max then
        return false
      end
      return self.api.min ~= nil or self.api.max ~= nil
    end
  end
  if self.minApi ~= nil and version < self.minApi then
    return false
  end
  if self.maxApi ~= nil and version > self.maxApi then
    return false
  end
  -- By default, plugins with no declared API range are treated as compatible.
  return version > 0
end

function FeatherPlugin:finish()
  return self, "Finish"
end

function FeatherPlugin:getConfig()
  return {}
end

-- Love event hooks — override in subclasses; the plugin manager dispatches these.
function FeatherPlugin:onDraw() end
function FeatherPlugin:onKeypressed() end
function FeatherPlugin:onKeyreleased() end
function FeatherPlugin:onMousepressed() end
function FeatherPlugin:onMousereleased() end
function FeatherPlugin:onTouchpressed() end
function FeatherPlugin:onTouchreleased() end
function FeatherPlugin:onJoystickpressed() end
function FeatherPlugin:onJoystickreleased() end

return FeatherPlugin
