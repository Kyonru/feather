# Usage

## Manual Setup

For full control over which plugins are loaded:

```lua
local FeatherDebugger = require "feather"
local FeatherPluginManager = require "feather.plugin_manager"
local ScreenshotPlugin = require "feather.plugins.screenshots"

local debugger = FeatherDebugger({
  debug = Config.__IS_DEBUG,
  wrapPrint = true,
  defaultObservers = true,
  autoRegisterErrorHandler = true,
  plugins = {
    FeatherPluginManager.createPlugin(ScreenshotPlugin, "screenshots", {
      screenshotDirectory = "screenshots",
      fps = 30,
      gifDuration = 5,
    }),
  },
})

function love.update(dt)
  debugger:update(dt)
end
```

---

## Observers

Watch variable values in real-time from the Observability tab:

```lua
debugger:observe("player", player)
debugger:observe("camera", camera)
```

---

## Logging

Feather automatically wraps `print()` when `wrapPrint = true`. You can also log manually:

```lua
debugger:print("Something happened")

debugger:log({
  type = "awesome_log_type",
  str  = "Something happened",
})
```

### Trace

```lua
debugger:trace("Something happened")
```

### Error logging

```lua
debugger:error("Something went wrong")
```

---

## Console / REPL

The Console is an **opt-in plugin** for evaluating Lua code directly inside the running game. It is not included by default.

```lua
require("feather.auto").setup({
  include = { "console" },
  pluginOptions = { console = { evalEnabled = true } },
})
```

Once enabled, open the **Console** tab in the desktop app and type any Lua expression. Return values are shown inline; `print()` output is captured automatically.

```lua
return player.health          -- inspect a value
player.speed = 500            -- tweak live
return love.graphics.getStats()
```

→ [Full Console documentation](console.md)

---

## Step Debugger

The step debugger pauses game execution at any line and lets you inspect local variables, closure values, and the call stack from the **Debugger** tab.

```lua
require("feather.auto").setup({ debugger = true })
```

Click any line number in the source view to add a breakpoint. While paused, use **Continue**, **Step Over**, **Step Into**, and **Step Out** to navigate execution.

→ [Full Debugger documentation](debugger.md)

---

## Time Travel

Time Travel records per-frame observer snapshots into a ring buffer and lets you scrub backwards through history to find exactly when a value changed.

```lua
require("feather.auto").setup({ include = { "time-travel" } })
```

Open the **Time Travel** tab, click **Start Recording**, reproduce the bug, then click **Stop & Load** to fetch and scrub through the captured frames.

→ [Full Time Travel documentation](time-travel.md)
