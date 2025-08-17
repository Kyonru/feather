local FeatherPlugin = require("feather.plugins.base")
local Class = require("feather.lib.class")

---@type FeatherPlugin
local TestPlugin = Class({
  __includes = FeatherPlugin,
})

function TestPlugin:init(config)
  FeatherPlugin.init(self, config)
end

function TestPlugin:update(dt, feather)
  FeatherPlugin.update(self, dt, feather)
end

function TestPlugin:onerror(msg, feather)
  FeatherPlugin.onerror(self, msg, feather)
end

function TestPlugin:handleRequest(request, feather)
  FeatherPlugin.handleRequest(self, request, feather)
end

function TestPlugin:finish(feather)
  FeatherPlugin.finish(self, feather)
end

return TestPlugin
