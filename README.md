# Feather 🪶 — Debug & Inspect Tool for LÖVE (love2d)

Feather is an extensible debug tool for [LÖVE](https://love2d.org) projects, inspired by [LoveBird](https://github.com/rxi/lovebird).
It lets you **inspect logs, variables, performance metrics, and errors in real-time** over a WebSocket connection and local log files, perfect for debugging games.

---

## ✨ Features

- 📜 **Live log viewer** — See `print()` output instantly in the app.
- 🔍 **Variable inspection** — Watch values update in real-time.
- 🚨 **Error capturing** — Automatically catch and display errors with optional delivery delay.
- 📸 **Screenshots & GIF capture** — Capture screenshots and record GIFs from your game via the built-in plugin.
- 🔌 **Plugin system** — 17 built-in plugins + custom ones. Server-driven UI: plugins define their actions in Lua, the desktop renders them automatically.
- 📱 **Multi-session support** — Connect multiple games simultaneously, each gets its own session tab.
- 📲 **Mobile debugging** — Auto-detected local IP in Settings with copyable connection string for WiFi debugging.
- 💻 **Console / REPL** — Optional plugin to execute Lua code in the running game. Must be explicitly included and guarded by `apiKey`.
- 📁 **Log file viewer** — Open `.featherlog` files manually for offline inspection (great for mobile devices).
- ⚡ **Zero-config setup** — `require("feather.auto")` registers all plugins with sensible defaults.
- 📦 **One-line installer** — `curl | bash` script to download core + plugins.

---

![log tab](docs/images/logs.png)
![performance tab](docs/images/performance.png)
![observability tab](docs/images/observable.png)

## 📦 Installation

### Option 1: Direct Download (Recommended)

This is the simplest approach, no package manager required.

1. Go to the [releases page](https://github.com/Kyonru/feather/releases) and download `feather-x.x.x.zip`
2. Unzip it and copy the `feather/` folder into your project, e.g. `lib/feather/`
3. Require it by path:

```lua
local Feather = require "lib.feather"
```

### Option 2: LuaRocks

Install globally and use `luarocks-loader` to resolve the path automatically:

```bash
luarocks install feather
```

Then at the top of your `main.lua`, before any `require` calls:

```lua
require("luarocks.loader")
local Feather = require("feather")
```

Or install into a local tree to keep dependencies project-scoped:

```bash
luarocks install feather --tree ./lua_modules
```

Then add the local tree to your path:

```lua
package.path = package.path .. ";./lua_modules/share/lua/5.1/?.lua"
local Feather = require("feather")
```

### Option 3: Install Script

Download the Feather library and all plugins with a single command:

```bash
curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh | bash
```

This creates a `feather/` directory (core library) and a `plugins/` directory (all built-in plugins) in your current folder.

**Customize with environment variables:**

```bash
# Install into a custom directory
FEATHER_DIR=lib/feather bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Download from a specific branch or tag
FEATHER_BRANCH=v0.6.0 bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Skip certain plugins
FEATHER_SKIP_PLUGINS="network-inspector,memory-snapshot" bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Skip all plugins (core only)
FEATHER_PLUGINS=0 bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"
```

---

## 🚀 Usage

### Quick Start (Zero Config)

The fastest way to get started — one line, all built-in plugins, sensible defaults:

```lua
require("feather.auto")

function love.update(dt)
  DEBUGGER:update(dt)
  -- ...your game code...
end
```

That's it. `DEBUGGER` is a global variable created automatically with all plugins registered.

**Customize auto setup:**

```lua
require("feather.auto").setup({
  sessionName = "My RPG",
  host = "192.168.1.50",           -- for mobile debugging
  exclude = { "network-inspector" }, -- skip specific plugins
  include = { "console" },          -- opt-in plugins (console requires explicit inclusion)
  pluginOptions = {                  -- override default plugin options
    bookmark = { hotkey = "f5", categories = { "bug", "note", "todo" } },
  },
})
```

> **Note:** The Console plugin is opt-in for safety (it allows remote code execution). Pass `include = { "console" }` to enable it.

### Manual Setup

```lua
local FeatherDebugger = require "feather"

local debugger = FeatherDebugger({
  debug = Config.__IS_DEBUG, -- Make sure to only run in debug mode
  wrapPrint = true,
  defaultObservers = true,
  autoRegisterErrorHandler = true,
})

function love.update(dt)
  debugger:update(dt) -- Required: drives WS I/O and plugin updates
end
```

---

### 🔗 Connecting

Feather uses a **push-based WebSocket architecture**. The desktop app runs a WebSocket server (port 4004 by default), and your game connects to it as a client.

1. Start the Feather desktop app from the [releases page](https://github.com/Kyonru/feather/releases)
2. Run your game with Feather enabled — you'll see:

```text
[Feather] WS client created — connecting to 127.0.0.1:4004
[Feather] Connected to 127.0.0.1:4004
```

The game automatically reconnects if the desktop app is restarted.

### 📱 iOS, Android & Remote Devices

Feather's live WebSocket connection works on mobile too — you just need the device to reach your computer's port 4004.

#### Android (USB via ADB reverse)

Similar to React Native's `adb reverse`, you can forward the device's `localhost:4004` to your computer:

```bash
adb reverse tcp:4004 tcp:4004
```

Then use the default config — the game connects to `127.0.0.1:4004`, which ADB routes to your computer:

```lua
local debugger = FeatherDebugger({
  debug = true,
  -- host defaults to "127.0.0.1", port defaults to 4004
})
```

#### Android / iOS (Wi-Fi)

If the device is on the same Wi-Fi network, point `host` to your computer's local IP:

```lua
local debugger = FeatherDebugger({
  debug = true,
  host = "192.168.1.42", -- Your computer's local IP
})
```

> **Tip:** Open the Feather desktop app → **Settings** → scroll to **Mobile Connection**. Your local IP is auto-detected with a copyable `ws://` connection string and ready-to-paste Lua snippet.

#### Offline mode (disk only)

If live connection isn't practical (no USB, no shared network), use `mode = "disk"` to skip WebSocket entirely and only write log files:

```lua
local debugger = FeatherDebugger({
  debug = true,
  mode = "disk", -- No WebSocket, just log files
})
```

Then transfer the `.featherlog` file from the device and open it in the Feather app using **Open Log File**.

---

## ⚙️ Configuration

`Feather:init(config)` accepts the following options:

| Option                     | Type       | Default             | Description                                                                                          |
| -------------------------- | ---------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `debug`                    | `boolean`  | `false`             | Enable or disable Feather entirely.                                                                  |
| `host`                     | `string`   | `"127.0.0.1"`       | Desktop IP or hostname the game connects to.                                                         |
| `port`                     | `number`   | `4004`              | Feather desktop WS server port.                                                                      |
| `mode`                     | `string`   | `"socket"`          | `"socket"` for live WS connection, `"disk"` for log-file-only mode (no network).                     |
| `baseDir`                  | `string`   | `""`                | Base directory path for file references and deeplinking to VS Code.                                  |
| `wrapPrint`                | `boolean`  | `false`             | Wrap `print()` calls to send to Feather's log viewer.                                                |
| `maxTempLogs`              | `number`   | `200`               | Max number of temporary logs stored before rotation.                                                 |
| `sampleRate`               | `number`   | `1`                 | Seconds between push cycles (performance, observers, plugins).                                       |
| `updateInterval`           | `number`   | `0.1`               | Interval between sending updates to clients.                                                         |
| `defaultObservers`         | `boolean`  | `false`             | Register built-in variable watchers.                                                                 |
| `errorWait`                | `number`   | `3`                 | Seconds to wait for error delivery before showing LÖVE's handler.                                    |
| `autoRegisterErrorHandler` | `boolean`  | `false`             | Replace LÖVE's `errorhandler` to capture errors.                                                     |
| `errorHandler`             | `function` | `love.errorhandler` | Custom error handler to use.                                                                         |
| `plugins`                  | `table`    | `{}`                | List of plugin modules to load.                                                                      |
| `captureScreenshot`        | `boolean`  | `false`             | Capture screenshots on error. WARNING: This impacts performance. Use with caution.                   |
| `sessionName`              | `string`   | `""`                | Custom display name shown in desktop session tabs (e.g. "My RPG").                                   |
| `deviceId`                 | `string`   | auto-generated      | Persistent device ID. Auto-generated and saved to disk if not set.                                   |
| `writeToDisk`              | `boolean`  | `true`              | Whether to write logs to `.featherlog` files.                                                        |
| `retryInterval`            | `number`   | `5`                 | Seconds between WebSocket reconnection attempts.                                                     |
| `connectTimeout`           | `number`   | `2`                 | Seconds to wait for initial WS connection.                                                           |
| `apiKey`                   | `string`   | `""`                | API key for authenticated connections.                                                               |

---

## 🛠 Development Tips

- Only enable `debug = true` in development builds — disable it for release for performance and security.
- Use `wrapPrint = true` to capture all `print()` logs automatically. `print` function will be wrapped with custom logic to send logs to Feather.
- Add custom variable observers to monitor your game's state.

---

## Documentation

### Observers

Observers are a way to inspect variables values in real-time. They are useful for debugging and observing game state.

```lua
  debugger:observe("Awesome player instance", player)
```

### Log

Feather will automatically capture and log print() calls in real-time, using the `output` type. You can also manually log using the `log` and `print` functions.

```lua
  debugger:print("Something happened")
```

```lua
  debugger:log({
    type = "awesome_log_type",
    str = "Something happened",
  })
```

### Trace

Feather automatically includes trace in errors and logs. You can also manually log traces using the `trace` function.

```lua
  debugger:trace("Something happened")
```

### Error Logging

Feather will automatically capture and log errors in real-time. You can also manually log errors using the `error` function.

```lua
  debugger:error("Something went wrong")
```

### Console / REPL

The Console is an **optional plugin** that lets you execute Lua code directly in the running game from the Feather desktop app. It is **not included by default** — you must explicitly register it and enable eval:

```lua
local ConsolePlugin = require("lib.feather.plugins.console")

local debugger = FeatherDebugger({
  debug = true,
  apiKey = "your-secret-key", -- required for console to work
  plugins = {
    FeatherPluginManager.createPlugin(ConsolePlugin, "console", {
      evalEnabled = true, -- must be explicitly enabled
    }),
  },
})
```

If the plugin is not registered, `cmd:eval` commands from the desktop are rejected with a clear error message. No eval code is loaded into your game unless you opt in.

Once enabled, type any Lua expression in the Console tab and see the result immediately — great for tweaking values, inspecting state, or testing functions without restarting.

- **Enter** to execute, **Shift+Enter** for multiline input
- **Arrow Up/Down** to recall previous commands
- `print()` output during execution is captured and displayed inline
- Return values are serialized with `inspect()` for readable table output
- Code runs in a sandbox with an instruction limit to prevent infinite loops from freezing the game

Examples:

```lua
return player.health              -- inspect a value
player.speed = 500                 -- tweak a variable live
return love.graphics.getStats()    -- check draw calls, texture memory
print("hello"); return 1 + 1      -- print + return both captured
```

Plugin options:

| Option             | Type      | Default  | Description                                 |
| ------------------ | --------- | -------- | ------------------------------------------- |
| `evalEnabled`      | `boolean` | `false`  | Must be `true` to allow code execution.     |
| `maxCodeSize`      | `number`  | `20000`  | Max characters per eval payload.            |
| `instructionLimit` | `number`  | `100000` | Lua instruction count before auto-abort.    |
| `maxOutputSize`    | `number`  | `100000` | Max characters in serialized return values. |

> **Security:** `apiKey` must be configured and non-empty in both the game and Feather desktop settings. The Console will refuse to execute code without a matching key.

> **Warning:** DO NOT ENABLE THIS IN PRODUCTION. This is intended for local development only.

## Plugins

Feather comes with a plugin system that allows you to extend its functionality with custom data inspectors. Plugins use a **server-driven UI** approach: the Lua plugin declares its actions (buttons, inputs, checkboxes) in `getConfig()`, and the desktop app renders them automatically — no TypeScript code needed. Plugins can be enabled/disabled at runtime from the desktop.

Check out the [Feather Plugins](docs/plugins.md) documentation for more information.

### Built-in Plugins

| Plugin                | Description                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Screenshots**       | Capture screenshots and record GIFs. Gallery view with download.                       |
| **Console / REPL**    | Remote Lua code execution (opt-in, requires `apiKey`).                                 |
| **Profiler**          | Function-level CPU profiling with start/stop.                                          |
| **Input Replay**      | Record and replay input sequences (keyboard, mouse, touch).                            |
| **Entity Inspector**  | ECS entity browser — register sources, browse and inspect live.                        |
| **Config Tweaker**    | Live game config editing from the desktop.                                             |
| **Bookmark**          | Mark and navigate to points of interest in game state.                                 |
| **Network Inspector** | HTTP/WS traffic monitor — wraps `socket.http` to intercept requests.                   |
| **Memory Snapshot**   | Heap snapshots, table size tracking, diff between snapshots for leak detection.        |
| **Physics Debug**     | Auto-render `love.physics` World overlay (bodies, joints, contacts, AABBs).            |
| **Particle Editor**   | Live ParticleSystem editor — tweak 30+ properties in real-time, export to Lua code.    |
| **Audio Debug**       | Inspect `love.audio` state — track sources, volumes, listener position, source limits. |
| **Coroutine Monitor** | Track active coroutines — status (running/suspended/dead), yields per frame, lifetime stats. |
| **Collision Debug**   | Visualize [bump.lua](https://github.com/kikito/bump.lua) AABB worlds — bounding boxes, cell grid, collision logging. |
| **Animation Inspector** | Inspect [anim8](https://github.com/kikito/anim8) sprite animations — current frame, speed, status, flip state. |
| **HUMP Signal**       | Integration with [HUMP signal](https://hump.readthedocs.io/en/latest/signal.html).     |
| **Lua State Machine** | Integration with [lua-state-machine](https://github.com/kyleconroy/lua-state-machine). |

### TL;DR

Minimal example of a debugger file to load feather

```lua
-- debugger.lua
local FeatherDebugger = require("lib.feather")
local FeatherPluginManager = require("lib.feather.plugin_manager")
local ScreenshotPlugin = require("lib.feather.plugins.screenshots")

local debugger = {}

function debugger:load()
  debugger.feather = FeatherDebugger({
    debug = true, -- Make sure to only run while on development
    wrapPrint = true,
    defaultObservers = true,
    captureScreenshot = true,
    autoRegisterErrorHandler = true,
    errorWait = 10,
    baseDir = "game",
    sessionName = "My Game",
    plugins = {
      FeatherPluginManager.createPlugin(ScreenshotPlugin, "screenshots", {
        screenshotDirectory = "screenshots", -- output folder for captures
        fps = 30, -- frames per second for GIFs
        gifDuration = 5, -- default duration of GIFs in seconds
      }),
    },
  })
end

function debugger:update(dt)
  debugger.feather:update(dt)
end

return debugger
```

## Recommendations

### Security

The `apiKey` option is used to protect your game from unauthorized access. Set it in the game config and match it in the Feather desktop app:

```lua
local debugger = FeatherDebugger({
  apiKey = "your-api-key",
})
```

### Performance

Feather is not meant to be used in production / final builds. It is meant to be used during development and debugging. To improve performance, you can set the `debug` option to `false` in the game.

### In game observability

- [OverlayStats](https://github.com/Oval-Tutu/bootstrap-love2d-project/blob/main/game/lib/overlayStats.lua) by [Oval-Tutu](https://github.com/Oval-Tutu) is a great way to visualize your game's performance in real-time on the game, the performance plugin is inspired by it.

---

## 📦 Built-in Lua Dependencies

- [Hump Class](https://github.com/vrld/hump/blob/master/class.lua)
- [Inspect](https://github.com/kikito/inspect.lua)
- [json.lua](https://github.com/rxi/json.lua)
- [log.lua](https://github.com/rxi/log.lua)

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

**Latest — [v0.6.0](https://github.com/Kyonru/feather/releases/tag/v0.6.0) — The one with the plugin ecosystem**

- 17 built-in plugins: screenshots, console, profiler, input replay, entity inspector, config tweaker, bookmark, network inspector, memory snapshot, physics debug, particle editor, audio debug, coroutine monitor, collision debug, animation inspector, HUMP signal, lua-state-machine
- Grouped card layout for plugins with many inputs (server-driven UI)
- Plugin enable/disable toggle from desktop
- Zero-config `auto.lua` entry point with `exclude`/`include`/`pluginOptions`
- curl-pipe-sh installer script (`install-feather.sh`)
- Mobile connection discovery — auto-detected local IP in Settings
- Per-session version mismatch warning on session tabs
- Disk mode for log-only debugging on Android/iOS
- Console / REPL with sandbox and instruction limit
- WebSocket push-based architecture with multi-session support
- Plugin error isolation and auto-disable after repeated failures

---

## 📜 License

Feel free to use and remix this project for personal, educational, or non-commercial fun.

Just don’t sell it, don’t make forks that let others sell it, and don’t use it for AI training — unless I say it’s okay.

Full license: See [LICENSE.md](LICENSE.md)

---

## 🙏 Credits

Inspired by [LoveBird](https://github.com/rxi/lovebird) by rxi, with added flexibility, plugin support, and modern LÖVE integration.
