package = "feather"
version = "0.1-0"
source = {
  url = "git://github.com/Kyonru/feather.git",
  tag = "v0.1.0",
  dir = "src-lua",
}
description = {
  summary = "Plugin-based debugger for Love2D",
  detailed = "Feather is a debugger tool with a plugin system for Love2D projects.",
  homepage = "https://github.com/Kyonru/feather",
  license = "https://github.com/Kyonru/feather/blob/main/LICENSE.md",
}
dependencies = {
  "lua >= 5.1",
}
build = {
  type = "builtin",
  modules = {
    ["feather"] = "feather/init.lua",
    ["feather.utils"] = "feather/utils.lua",
    ["feather.error_handler"] = "feather/error_handler.lua",
    ["feather.plugins.base"] = "feather/plugins/base.lua",
    ["feather.plugins.performance"] = "feather/plugins/performance.lua",
    -- Export with External Deps
    ["feather.lib.inspect"] = "feather/lib/inspect.lua",
    ["feather.lib.json"] = "feather/lib/json.lua",
    ["feather.lib.class"] = "feather/lib/class.lua",
  },
}
