local PATH = string.sub(..., 1, string.len(...) - string.len("plugins.base"))

local Class = require(PATH .. ".lib.class")

local FeatherPlugin = Class({
  init = function(self, config)
    self.config = config
  end,
  update = function(self, dt)
    return self, dt
  end,
  onerror = function(self, msg)
    return self, msg
  end,
  onerrorhandler = function(self, msg)
    return self, msg
  end,
  getResponseBody = function(self)
    return self, "Hello World"
  end,
})

return FeatherPlugin
