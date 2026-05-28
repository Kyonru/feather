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

If you work in VS Code, the [VS Code extension](vscode-extension.md) exposes the same CLI-managed workflow from the Feather activity bar, including init, run/watch, doctor, plugin/package management, release builds, uploads, and project settings.

> [!WARNING]
> Manual setup can leave Feather code, remote debugging hooks, or powerful plugins such as Console in places you did not intend to ship. Use it only if you understand the security consequences of accidental or unintended use. Prefer the CLI-managed workflow for normal development and releases.

CLI init creates a `feather.config.lua` with `debug = true`, automatic error capture enabled, and the default creative plugins `particle-system-playground` and `shader-graph` included. Add or remove plugins with:

```bash
feather config plugins --include profiler,input-replay --dir path/to/my-game
feather config plugins --exclude shader-graph --dir path/to/my-game
```

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

## Command Center

Press <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd>, or use the **Command** button in the app header, to open the Command Center.

It searches pages, plugins, Console snippets, Debugger actions, Hot Reload shortcuts, sessions, and docs links. By default, features hidden from the sidebar are also hidden from Command Center search; enable **Show hidden sidebar features in Command Center** in Settings to keep them searchable with a **Hidden** badge. Disabled plugins hidden from the sidebar are hidden from Command Center too.

Actions that need a live session or enabled plugin stay visible but disabled with a reason. The first pass only includes navigation and safe shortcuts: it can switch or refresh sessions, insert snippets into Console, open docs, and toggle debugger options, but it does not run arbitrary Console eval or plugin actions.

---

## Appearance

Open **Settings → General → Appearance** to choose the app theme. Feather keeps the default **System**, **Feather Light**, and **Feather Dark** options, and also includes all Noctis variants: Lux, Hibernus, Lilac, Noctis, Azureus, Bordo, Obscuro, Sereno, Uva, Viola, and Minimus. Tokyo Night variants are available as Light, Night, and Storm, Rainglow includes Absent Light, and the Microsoft Visual Studio C/C++ set includes Light, Dark, 2017 Light, and 2017 Dark.

Theme choices update the app chrome and syntax-highlighted code surfaces, including Console output, Debugger source views, shader code, and Lua/GLSL editors.

---

## Session Health

Open **Session** first when you want to know what Feather thinks is happening. The page summarizes connection state, runtime/API version, project roots, capabilities, enabled or incompatible plugins, Console/API-key status, Hot Reload state, debugger state, package lockfile status, and recent performance signals.

The **Recommended Next Actions** panel points to the next useful place to go, such as Settings for security/API-key issues, Debugger for paused breakpoints or Hot Reload failures, Performance for frame hitches, or package guidance when no lockfile is available.

---

## Observers

Watch variable values in real-time from the Observability tab:

```lua
debugger:observe("player", player)
debugger:observe("camera", camera)
```

The Observability page tracks first seen, last seen, last changed, value size, change counts, and recent value history for each observer. Use key prefixes like `player.x`, `player.health`, or `physics.contacts` to get automatic group filters, then search, filter, sort, inspect diffs, customize how long changed markers stay visible, and export the visible observer set as JSON.

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

Live session logs are also cached locally in the desktop app. Reopening Feather or restarting a CLI-launched game restores the recent log history for that saved session/project, while screenshots stay out of the cache to keep the app storage small.

---

## Performance And Profiler

The **Performance** page has a **Health** tab for live FPS, frame-time, memory, disk, draw-call, canvas-switch, shader-switch, and texture-memory charts. Use pause/follow when a hitch happens, inspect recent spikes, then export the visible JSON window if you need to compare runs.

Enable the `profiler` plugin to use the **Performance → Profiler** tab for instrumented hot paths:

```bash
feather config plugins --include profiler --dir path/to/my-game
```

The profiler still uses explicit instrumentation via `profiler:wrap(name, fn)`, or scoped samples with `profiler:begin(name)` and `profiler:finish(name)`. The desktop can start/stop captures, group rows by name prefix, hide one-call entries, filter rows, sort by percent/total/average/max/calls, save before/after snapshots, compare diffs, and export JSON.

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

Console also includes structured inspectors for table results, live pins that publish expressions into Observability as `console.*` keys, and a best-effort **Read-only** guardrail mode. Read-only blocks obvious mutation patterns, but it is not a true dry run or rollback system.

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

---

## Session Replay

Session Replay combines input replay with developer-selected state checkpoints so you can reproduce playthroughs.

Enable it from `feather.config.lua`:

```lua
return {
  include = { "session-replay" },
}
```

Add guarded state capture where it helps reproduction:

```lua
if DEBUGGER then
  DEBUGGER:replayState("player", {
    x = player.x,
    y = player.y,
    health = player.health,
  })
end
```

For reliable playback, register a restore handler with `DEBUGGER:replayRegister()`. Feather captures an initial baseline at recording start, then records inputs and the state deltas you provide; it does not magically serialize the whole game.

→ [Full Session Replay documentation](session-replay.md)
