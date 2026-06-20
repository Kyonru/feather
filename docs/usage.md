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
feather config plugins --include input-replay --dir path/to/my-game
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

## Command Center

Press <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd>, or use the **Command** button in the app header, to open the Command Center.

It searches pages, plugins, Console snippets, Debugger actions, Hot Reload shortcuts, sessions, and docs links. By default, features hidden from the sidebar are also hidden from Command Center search; enable **Show hidden sidebar features in Command Center** in Settings to keep them searchable with a **Hidden** badge. Disabled plugins hidden from the sidebar are hidden from Command Center too.

Actions that need a live session or enabled plugin stay visible but disabled with a reason. The first pass only includes navigation and safe shortcuts: it can switch or refresh sessions, insert snippets into Console, open docs, and toggle debugger options, but it does not run arbitrary Console eval or plugin actions.

---

## Appearance

Settings is organized into **Connection**, **General**, **Security**, and **CLI** areas. Each area shows a short summary at the top, and changes are saved as soon as you make them.

Open **Settings → CLI** for CLI & Project Actions. The desktop resolves the configured CLI path first, then the bundled sidecar, then `PATH`/common npm bin locations. Project actions such as Doctor, build vendor setup, package install/remove, plugin include/exclude, skills install, and CLI-managed init run through a Tauri allowlist instead of a generic terminal. Mutating actions use dry-run previews and require confirmation before writing files.

Open **Settings → General → Appearance** to choose the app theme. Feather keeps the default **System**, **Feather Light**, and **Feather Dark** options, and also includes all Noctis variants: Lux, Hibernus, Lilac, Noctis, Azureus, Bordo, Obscuro, Sereno, Uva, Viola, and Minimus. Tokyo Night variants are available as Light, Night, and Storm, Rainglow includes a curated selection grouped into Light, Dark, and Contrast options, GitHub includes Light Default, Light High Contrast, Light Colorblind, Dark Default, Dark High Contrast, Dark Colorblind, Dark Dimmed, and classic Light, and the Microsoft Visual Studio C/C++ set includes Light, Dark, 2017 Light, and 2017 Dark.

Theme choices update the app chrome and syntax-highlighted code surfaces, including Console output, Debugger source views, shader code, and Lua/GLSL editors.

The sidebar groups tools into **Favorites**, **Core**, **Inspect**, **Creative**, and **History** sections so common workflows are easier to scan. By default, **Logs**, **Performance**, and **Session** are pinned to Favorites. Use the star action beside a sidebar tool, or **Settings → General → Appearance → Pinned Tools**, to change Favorites. Pinned tools follow Feather's fixed sidebar order rather than drag-and-drop order.

Hidden sidebar features still take precedence over pins: a hidden tool does not appear in Favorites or its normal group, but its pin is remembered and returns when the tool is shown again.

---

## About And Updates

Open **About** from the lower sidebar to see the desktop app version, update status, project links, release notes, license, docs, and sponsorship links. When Feather detects that a newer desktop release is available, the About entry changes to **Update available** and the modal links directly to releases.

---

## Session Health

Open **Session** first when you want to know what Feather thinks is happening. It summarizes connection state, auth/config status, runtime versions, enabled plugins, debugger state, package state, and recommended next actions.

Use the session pause button to temporarily suspend Feather runtime work while keeping the socket available for resume.

→ [Full Session documentation](session.md)

---

## Observers

Watch variable values from the **Observability** tab:

```lua
debugger:observe("player", player)
debugger:observe("camera", camera)
debugger:watch("player.health", function() return player.health end)
```

Use `observe` for values you want to expose directly and `watch` for cheap on-demand values. Observability wakes up when the page asks for data, then goes dormant again when you leave.

→ [Full Observability documentation](observability.md)

---

## Logging

Feather automatically wraps `print()` when `wrapPrint = true`. You can also send logs manually:

```lua
debugger:print("Something happened")

debugger:log({ type = "combat", str = "Player took damage" })
debugger:trace("Something happened")
debugger:error("Something went wrong")
```

Logs support follow-tail, search, filters, clear, local history restore, `.featherlog` files, and immediate delivery for error/fatal events.

→ [Full Logs documentation](logs.md)

---

## Performance And Profiler

The **Performance** page has **Health** for game runtime signals, **Overhead** for Feather's own runtime cost, and **Profiler** for explicit instrumentation captures.

Use the core profiler for hot paths:

```lua
local updateWorld = DEBUGGER.profiler:wrap("World:update", updateWorld)
```

Record captures from the desktop or from debugger profiler probes, then inspect hotspots, run comparisons, snapshots, diffs, and exports.

→ [Full Performance documentation](performance.md)

→ [Full Profiler documentation](profiler.md)

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

Use the stopwatch gutter beside line numbers for profiler probes. They trigger profiler start, stop, or snapshot actions on line hits while breakpoints keep their normal pause behavior. On supported function declaration lines, **Profile function here** installs a profiler wrapper without source rewriting.

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
