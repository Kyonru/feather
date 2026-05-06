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

The Console is an **optional, opt-in plugin** for executing Lua code directly in the running game. It is **not included by default**.

```lua
local ConsolePlugin = require("lib.feather.plugins.console")

local debugger = FeatherDebugger({
  debug  = true,
  apiKey = "your-secret-key",
  plugins = {
    FeatherPluginManager.createPlugin(ConsolePlugin, "console", {
      evalEnabled = true,
    }),
  },
})
```

Once enabled, type any Lua expression in the Console tab:

- **Enter** to execute, **Shift+Enter** for multiline
- **Arrow Up/Down** to recall previous commands
- `print()` output is captured and displayed inline
- Return values are serialized with `inspect()` for readable table output
- A sandbox instruction limit prevents infinite loops from freezing the game

```lua
return player.health              -- inspect a value
player.speed = 500                -- tweak a variable live
return love.graphics.getStats()   -- check draw calls
print("hello"); return 1 + 1      -- print + return both captured
```

**Plugin options:**

| Option             | Type      | Default   | Description                              |
| ------------------ | --------- | --------- | ---------------------------------------- |
| `evalEnabled`      | `boolean` | `false`   | Must be `true` to allow code execution.  |
| `maxCodeSize`      | `number`  | `20000`   | Max characters per eval payload.         |
| `instructionLimit` | `number`  | `100000`  | Lua instructions before auto-abort.      |
| `maxOutputSize`    | `number`  | `100000`  | Max characters in serialized return values. |

> **Security:** `apiKey` must be set and non-empty in both the game config and Feather desktop settings. The Console refuses to execute code without a matching key.
>
> **Warning:** Do not enable this in production or in builds shipped to users.

---

## Step Debugger

The step debugger lets you pause game execution at any line, inspect local variables and the call stack, and resume with continue, step over, step into, or step out — all from the **Debugger** tab in the Feather desktop app.

### Enable

```lua
local debugger = FeatherDebugger({
  debug    = true,
  debugger = true,
})
```

Or leave `debugger = false` and toggle it on at runtime from the desktop without restarting the game.

### Setting breakpoints

Click any line number in the Debugger tab's source view to add a breakpoint. Breakpoints persist across desktop restarts and are synced to the game whenever the debugger is enabled or a breakpoint changes.

Conditional breakpoints are supported — enter a Lua expression in the condition field; the game only pauses when it evaluates to truthy.

### While paused

- **Call Stack** — full stack trace: file, line, and function name per frame. Click a frame to navigate to it in the source view.
- **Variables** — locals and upvalues of the paused frame, expanded one level deep for tables.
- **Controls** — Continue (resume freely), Step Over (next line, same depth), Step Into (follow function calls), Step Out (run until caller returns).

### How it works

Lua's `debug.sethook` line hook fires on every executed line. When a breakpoint or step condition is met, `love.update` blocks in a tight poll while the WS client keeps running — so the desktop stays connected and commands arrive. Resuming any step command unblocks the loop and reinstalls the hook for the next pause.

> **Note:** `debug.sethook` adds overhead to every executed line. Enable the debugger only during active debugging sessions for best performance.
