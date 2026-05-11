# Hot Reload Plugin

Development-only Lua module hot reload over Feather's WebSocket connection.

> [!WARNING]
> This plugin is controlled remote code execution. Only enable it in trusted development sessions, keep `allow` narrow, and never ship it in production builds.

## Auto Setup

```lua
require("feather.auto").setup({
  include = { "hot-reload" },
  debugger = {
    enabled = true,
    hotReload = {
      enabled = true,
      allow = { "game.player" },
      deny = { "main", "conf", "feather.*" },
      persistToDisk = false,
      clearOnBoot = false,
      requireLocalNetwork = true,
    },
  },
})
```

## Manual Setup

```lua
local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local HotReloadPlugin = require("plugins.hot-reload")

DEBUGGER = FeatherDebugger({
  debug = true,
  debugger = { enabled = true },
  plugins = {
    FeatherPluginManager.createPlugin(HotReloadPlugin, "hot-reload", {
      enabled = true,
      allow = { "game.player" },
      deny = { "main", "conf", "feather.*" },
    }),
  },
})
```
