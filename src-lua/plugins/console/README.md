# ConsolePlugin

The `ConsolePlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **execute Lua code remotely** inside your running LÖVE game from the Feather desktop app. It provides a sandboxed eval environment with instruction limits, output capture, and API key authentication.

> **Warning:** Remote code execution is a powerful feature. The plugin is **disabled by default** and requires both `evalEnabled = true` and a non-empty `apiKey` to function.

## 📦 Installation

The plugin lives in `feather/plugins/console/`. Require it from your project:

```lua
local ConsolePlugin = require("feather.plugins.console")
```

## ⚙️ Configuration

Register the plugin using `FeatherPluginManager.createPlugin`:

```lua
FeatherPluginManager.createPlugin(ConsolePlugin, "console", {
  evalEnabled = true,                -- must be explicitly true to allow eval
  apiKey = "my-secret-key",          -- set on FeatherDebugger, must match
  maxCodeSize = 20000,               -- max input code length (chars)
  instructionLimit = 100000,         -- max Lua instructions per eval
  maxOutputSize = 100000,            -- max result string length (chars)
})
```

You must also set the matching `apiKey` on the `FeatherDebugger` instance:

```lua
local debugger = FeatherDebugger({
  apiKey = "my-secret-key",
  plugins = {
    FeatherPluginManager.createPlugin(ConsolePlugin, "console", {
      evalEnabled = true,
    }),
  },
})
```

## Options

| Option             | Type    | Default  | Description                                                      |
| ------------------ | ------- | -------- | ---------------------------------------------------------------- |
| `evalEnabled`      | boolean | `false`  | Must be `true` to allow code execution.                          |
| `maxCodeSize`      | number  | `20000`  | Maximum character length of incoming code.                       |
| `instructionLimit` | number  | `100000` | Lua instruction limit per eval to prevent infinite loops.        |
| `maxOutputSize`    | number  | `100000` | Maximum character length of the result string before truncation. |

## 🔒 Security

The console plugin enforces multiple layers of protection:

1. **Opt-in only** — `evalEnabled` must be explicitly set to `true`.
2. **API key authentication** — The `apiKey` sent from the desktop must exactly match the one configured on the `FeatherDebugger` instance. Empty or missing keys are rejected.
3. **Code size limit** — Incoming code exceeding `maxCodeSize` is rejected before compilation.
4. **Instruction limit** — A `debug.sethook` instruction counter aborts execution if the limit is exceeded, preventing infinite loops and runaway code.
5. **Output truncation** — Return values larger than `maxOutputSize` are truncated.
6. **Sandboxed environment** — Code runs in a sandbox that inherits `_G` but overrides `print()` to capture output.

If the plugin is not registered, `cmd:eval` commands from the desktop are rejected with a clear error message.

## 🔍 How It Works

1. The desktop app sends a `cmd:eval` message containing `{ code, id, apiKey }`.
2. Feather's `__handleCommand` routes the message to `ConsolePlugin:handleEval()`.
3. The plugin validates auth, compiles the code via `loadstring`, and executes it in a sandboxed environment.
4. `print()` calls inside the eval are captured and returned alongside the result.
5. An `eval:response` message is sent back with `{ status, result, prints }`.

### Response Format

```lua
{
  type = "eval:response",
  session = "<sessionId>",
  id = "<requestId>",
  status = "success" | "error",
  result = "...",          -- inspected return value(s), or error message
  prints = { "..." },      -- captured print() output lines
}
```

### Debugger Metadata (`getConfig`)

- Type: `console`
- Icon: `terminal`

## 📊 Example

```lua
local ConsolePlugin = require("feather.plugins.console")

local debugger = FeatherDebugger({
  debug = true,
  apiKey = "dev-key-12345",
  plugins = {
    FeatherPluginManager.createPlugin(ConsolePlugin, "console", {
      evalEnabled = true,
    }),
  },
})
```

From the Feather desktop console, you can then run code like:

```lua
-- Returns the value and captures the print
print("Hello from the game!")
return love.graphics.getWidth(), love.graphics.getHeight()
```

The response will include:
- `prints`: `["Hello from the game!"]`
- `result`: `"800, 600"`
