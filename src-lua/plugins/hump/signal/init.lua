local FeatherPlugin = require("feather.plugins.base")
local Class = require("feather.lib.class")

---@class HumpSignalPlugin: FeatherPlugin
---@field type string
local HumpSignalPlugin = Class({
  __includes = FeatherPlugin,
})

function HumpSignalPlugin:init(config)
  FeatherPlugin.init(self, config)
  self.type = "Hump.Signal"

  local signal = config.options.signal

  if not signal then
    return
  end

  local register = config.options.register

  if not register then
    return
  end

  for i = 1, #register do
    if type(register[i]) ~= "string" then
      return
    end

    if not signal[register[i]] then
      return
    end

    self.logger:wrapWithLog(signal, register[i], self.type)
  end
end

function HumpSignalPlugin:getConfig()
  return {
    type = self.type,
    color = "#FEA405",
    icon = "radio-tower",
  }
end

return HumpSignalPlugin
