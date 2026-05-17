# Usage

## Setup

Use the CLI for normal development. It injects Feather for desktop runs and embeds a temporary debug runtime for web/mobile dev runs without requiring game-side Lua integration:

```bash
feather init path/to/my-game
feather run path/to/my-game
feather run path/to/my-game --target web
feather run path/to/my-game --target android
feather run path/to/my-game --target ios
```

The direct Lua API is still available for unusual projects that intentionally vendor Feather themselves.

> [!WARNING]
> Manual setup can leave Feather code, remote debugging hooks, or powerful plugins such as Console in places you did not intend to ship. Use it only if you understand the security consequences of accidental or unintended use. Prefer the CLI-managed workflow for normal development and releases.

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

Enable it from `feather.config.lua`:

```lua
return {
  include = { "console" },
  pluginOptions = { console = { evalEnabled = true } },
}
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

Enable it from `feather.config.lua`:

```lua
return {
  debugger = true,
}
```

Click any line number in the source view to add a breakpoint. While paused, use **Continue**, **Step Over**, **Step Into**, and **Step Out** to navigate execution.

→ [Full Debugger documentation](debugger.md)

---

## Assets

The Assets tab tracks textures, fonts, and audio sources loaded at runtime. It can preview file-backed images directly from the desktop filesystem, and falls back to game-rendered PNG previews for procedural textures and fonts.

Use **Select Folder** in the Assets tab to set the session's Game Root when the desktop needs a local copy of the game project.

→ [Full Assets documentation](assets.md)

---

## Time Travel

Time Travel records per-frame observer snapshots into a ring buffer and lets you scrub backwards through history to find exactly when a value changed.

Enable it from `feather.config.lua`:

```lua
return {
  include = { "time-travel" },
}
```

Open the **Time Travel** tab, click **Start Recording**, reproduce the bug, then click **Stop & Load** to fetch and scrub through the captured frames.

→ [Full Time Travel documentation](time-travel.md)
