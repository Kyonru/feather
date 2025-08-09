local Class = require("feather.lib.class")

local FeatherPlugin = Class({
  init = function(self, config)
    self.config = config
  end,
  update = function(self, dt)
    print("update")
  end,
  onerror = function(self, msg)
    print("onerror")
  end,
  onerrorhandler = function(self, msg)
    print("onerrorhandler")
  end,
  getResponseBody = function(self)
    return "Hello World"
  end,
})

return FeatherPlugin
