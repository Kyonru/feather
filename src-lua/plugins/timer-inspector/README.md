# Timer/Tween Inspector Plugin

Inspect active timers and tweens from HUMP timer and flux — see progress bars, remaining time, easing, and cancel from the desktop.

## Features

- **HUMP timer support** — Reads internal `timer.functions` to display all active `after`, `every`, `during`, and `tween` handles
- **flux support** — Reads active tweens from flux groups with progress, easing, and duration
- **Progress bars** — Visual `█░` progress bars in the table showing completion percentage
- **Cancel from desktop** — Clear all HUMP timers or stop all flux tweens with toolbar buttons
- **Multi-instance** — Track multiple timer instances and flux groups simultaneously
- **Custom entries** — Generic API for registering timers from any library

## Usage

### With auto.lua

```lua
local Timer = require("lib.hump.timer")
local flux = require("lib.flux")

require("feather.auto").setup({
  include = { "timer-inspector" },
  pluginOptions = {
    ["timer-inspector"] = {
      humpTimer = Timer,  -- pass HUMP timer module/instance
      flux = flux,        -- pass flux module
    },
  },
})
```

### Manual registration

```lua
local TimerInspectorPlugin = require("plugins.timer-inspector")
local FeatherPluginManager = require("feather.plugin_manager")

DEBUGGER = Feather({
  plugins = {
    FeatherPluginManager.createPlugin(TimerInspectorPlugin, "timer-inspector", {}),
  },
})
```

### Registering timer instances

```lua
local Timer = require("lib.hump.timer")
local gameTimer = Timer.new()
local uiTimer = Timer.new()

local plugin = DEBUGGER.pluginManager:getPlugin("timer-inspector")
if plugin then
  plugin.instance:addHumpTimer("game", function() return gameTimer end)
  plugin.instance:addHumpTimer("ui", function() return uiTimer end)
end
```

### Registering flux groups

```lua
local flux = require("lib.flux")
local uiFlux = flux.group()

local plugin = DEBUGGER.pluginManager:getPlugin("timer-inspector")
if plugin then
  plugin.instance:addFluxGroup("default", function() return flux end)
  plugin.instance:addFluxGroup("ui", function() return uiFlux end)
end
```

### Custom timer entries

For libraries not directly supported:

```lua
plugin.instance:addCustom({
  label = "cooldown",
  kind = "custom",
  progress = 0.6,
  remaining = 2.0,
  duration = 5.0,
  repeating = false,
  ease = "linear",
})
```

## Configuration

| Option         | Type    | Default | Description                                     |
| -------------- | ------- | ------- | ----------------------------------------------- |
| `humpTimer`    | table   | `nil`   | HUMP timer module/instance for auto-registration |
| `flux`         | table   | `nil`   | flux module for auto-registration                |
| `showCompleted`| boolean | `false` | Show completed timers (not yet implemented)      |

## Desktop UI

### Table columns

| Column    | Description                                         |
| --------- | --------------------------------------------------- |
| Lib       | Source library: hump, flux, or custom                |
| Group     | Timer instance / flux group name                     |
| Kind      | after, every, during, tween, or custom               |
| Progress  | Visual progress bar with percentage (█░░░ 30%)       |
| Remaining | Time remaining in seconds                            |
| Duration  | Total duration in seconds                            |
| Repeat    | Whether the timer repeats                            |
| Easing    | Easing function name (flux tweens)                   |

### Actions

- **Clear HUMP** — Call `timer:clear()` on all registered HUMP timer instances
- **Clear Flux** — Stop all tweens in registered flux groups
- **Clear Custom** — Remove all manually registered entries

### Cards

- **Stats** — Active count, HUMP Timers, Flux Tweens, Custom count
- **Sources** — Number of registered HUMP instances and Flux groups

## Debugging scenarios

- **Timer leak** — Active count growing without bound; timers not completing or repeating unexpectedly
- **Wrong easing** — Check the Easing column to verify the correct easing function is applied
- **Stalled tween** — Progress bar stuck at 0% may indicate the flux group's `update(dt)` isn't being called
- **Too many timers** — High HUMP timer count can indicate `after`/`every` calls without proper cleanup
