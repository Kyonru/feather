local PATH = string.sub(..., 1, string.len(...) - string.len("plugins.base"))

local Class = require(PATH .. ".lib.class")

---@class FeatherPlugin
---@field options table
---@field logger FeatherLogger
---@field observer FeatherObserver
---@field init fun(self: FeatherPlugin, config: table)
---@field update fun(self: FeatherPlugin, dt: number, feather: Feather): ...
---@field onerror fun(self: FeatherPlugin, msg: string, feather: Feather): ...
---@field handleRequest fun(self: FeatherPlugin, request: table, feather: Feather): ...
---@field handleActionRequest fun(self: FeatherPlugin, request: table, feather: Feather): ...
---@field handleParamsUpdate fun(self: FeatherPlugin, request: table, feather: Feather): ...
---@field isSupported fun(self: FeatherPlugin, version: number): boolean
---@field finish fun(self: FeatherPlugin, feather: Feather): ...
---@field getConfig fun(self: FeatherPlugin): table
local FeatherPlugin = Class({})

function FeatherPlugin:init(config)
  self.options = config.options or {}
  self.logger = config.logger or {}
  self.observer = config.observer or {}
end

function FeatherPlugin:update(dt)
  return self, dt
end

function FeatherPlugin:onerror(msg)
  return self, msg
end

function FeatherPlugin:handleRequest(request)
  return self, request
end

function FeatherPlugin:handleActionRequest(request)
  return self, request
end

function FeatherPlugin:handleParamsUpdate()
  return {}
end

--- Verify if the plugin is supported by the current plugin api version of Feather
---@param version number
function FeatherPlugin:isSupported(version)
  -- By default, all api versions are supported
  return version > 0
end

function FeatherPlugin:finish()
  return self, "Finish"
end

function FeatherPlugin:getConfig()
  return {}
end

return FeatherPlugin
