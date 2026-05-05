# Coroutine Monitor Plugin

Track active coroutines, their status, and yield frequency — useful for debugging cutscenes, async loading, sequenced events, and any coroutine-based game logic.

## Features

- **Auto-hooking** — Hooks `coroutine.create`, `coroutine.wrap`, and `coroutine.resume` to automatically discover and track all coroutines
- **Status tracking** — Shows running, suspended, normal, and dead states in real-time
- **Yield counting** — Total yields per coroutine and yields-per-frame for spotting hot coroutines
- **Summary cards** — At-a-glance counts: tracked, active, suspended, running, dead
- **Lifetime stats** — Total created and total dead across the session
- **Manual registration** — `addCoroutine(co, label)` for coroutines created before the plugin loads

## Usage

### With auto.lua (zero-config)

```lua
require("feather.auto")
```

The coroutine monitor is included by default.

### Manual registration

```lua
local CoroutineMonitorPlugin = require("plugins.coroutine-monitor")
local FeatherPluginManager = require("feather.plugin_manager")

DEBUGGER = Feather({
  plugins = {
    FeatherPluginManager.createPlugin(CoroutineMonitorPlugin, "coroutine-monitor", {}),
  },
})
```

### Labeling coroutines

Coroutines created after the hook is active are auto-labeled (`coroutine#1`, `coroutine#2`, etc.). For meaningful names, register manually:

```lua
local coPlugin = DEBUGGER.pluginManager:getPlugin("coroutine-monitor")
if coPlugin then
  local co = coroutine.create(myCutsceneFunction)
  coPlugin.instance:addCoroutine(co, "intro-cutscene")
end
```

## Configuration

| Option     | Type    | Default | Description                                  |
| ---------- | ------- | ------- | -------------------------------------------- |
| `autoHook` | boolean | `true`  | Hook `coroutine.*` functions automatically   |
| `showDead` | boolean | `false` | Show dead coroutines in the table by default |

## Desktop UI

### Table columns

| Column       | Description                           |
| ------------ | ------------------------------------- |
| Name         | Label or auto-generated ID            |
| Status       | running / suspended / normal / dead   |
| Total Yields | Cumulative yield count since creation |
| Yields/Frame | Number of yields in the last frame    |
| Last Yield   | Time since the last yield             |
| Age          | Time since the coroutine was created  |

### Actions

- **Clear Dead** — Remove dead coroutines from the tracking list
- **Reset Counts** — Zero out all yield counters
- **Show Dead** — Toggle visibility of dead coroutines in the table

### Cards

- **Summary** — Tracked, Active, Suspended, Running, Dead counts
- **Lifetime** — Total Created, Total Dead across the session

## Debugging scenarios

- **Stuck coroutine** — A coroutine stuck in "suspended" with 0 yields/frame means it's not being resumed
- **Yield storm** — High yields/frame on a single coroutine may indicate a tight loop or busy-wait
- **Coroutine leak** — Total Created growing without Total Dead increasing means coroutines aren't completing
- **Dead accumulation** — Many dead coroutines suggest they should be cleaned up (use Clear Dead)
