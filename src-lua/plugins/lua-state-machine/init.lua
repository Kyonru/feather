local FeatherPlugin = require("feather.plugins.base")
local Class = require("feather.lib.class")

---@class LuaStateMachinePlugin: FeatherPlugin
---@field type string
local LuaStateMachinePlugin = Class({
  __includes = FeatherPlugin,
})

function LuaStateMachinePlugin:init(config)
  FeatherPlugin.init(self, config)
  self.type = "lua-state-machine"
  self.states = {}

  local machine = config.options.machine

  if not machine then
    return
  end

  local pluginSelf = self

  local original = machine.create
  machine.create = function(self, ...)
    local tempState = original(self, ...)
    table.insert(pluginSelf.states, tempState)
    return tempState
  end
end

function LuaStateMachinePlugin:update(dt, feather)
  FeatherPlugin.update(self, dt, feather)

  for i = 1, #self.states do
    local state = self.states[i]

    local name = "lua-state-machine-plugin-state-" .. tostring(i)

    feather:observe(name, state.current)
  end
end

function LuaStateMachinePlugin:getConfig()
  return {
    type = self.type,
    color = "#253900",
    icon = "workflow",
  }
end

return LuaStateMachinePlugin
