local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")
local format = require(FEATHER_PATH .. ".utils").format

---@class FeatherObserver: FeatherPlugin
---@field defaultObservers boolean
---@field observers table
---@field debug boolean
---@field observe fun(self: FeatherObserver, key: string, value: table | string | number | boolean)
local FeatherObserver = Class({
  __includes = Base,
  init = function(self, config)
    self.debug = config.debug
    self.defaultObservers = config.defaultObservers
    self.observers = {}
  end,
})

--- Tracks the value of a key in the observers table
---@alias FeatherObserve fun(self: Feather, key: string, value: table | string | number | boolean)
---@type FeatherObserve
function FeatherObserver:observe(key, value)
  if not self.debug then
    return
  end

  local curr = format(value)

  for _, observer in ipairs(self.observers) do
    if observer.key == key then
      observer.value = curr
      return
    end
  end

  table.insert(self.observers, { key = key, value = curr, type = type(value) })
end

function FeatherObserver:__defaultObservers()
  self:observe("Lua Version", _VERSION)
end

function FeatherObserver:getResponseBody()
  if self.defaultObservers then
    self:__defaultObservers()
  end
  return self.observers
end

return FeatherObserver
