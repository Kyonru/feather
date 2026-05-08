# Console / REPL

The Console is an **opt-in plugin** that lets you evaluate arbitrary Lua code inside the running game from the Feather desktop app. It is not included by default and must be explicitly enabled.

---

## Setup

### With auto.lua

```lua
require("feather.auto").setup({
  include = { "console" },
  pluginOptions = {
    console = { evalEnabled = true },
  },
})
```

### Manual setup

```lua
local FeatherDebugger  = require "feather"
local FeatherPluginManager = require "feather.plugin_manager"
local ConsolePlugin    = require "feather.plugins.console"

local debugger = FeatherDebugger({
  debug  = true,
  apiKey = "my-secret-key",   -- required for eval to work
  plugins = {
    FeatherPluginManager.createPlugin(ConsolePlugin, "console", {
      evalEnabled = true,
    }),
  },
})

function love.update(dt)
  debugger:update(dt)
end
```

> **Security:** `apiKey` must be set and non-empty in both the game config and the Feather desktop **Settings → API Key** field. The Console refuses to execute any code if the keys don't match.

---

## Usage

Open the **Console** tab in the Feather desktop app. Type any Lua expression or statement and press **Enter** to run it.

| Key           | Action                           |
| ------------- | -------------------------------- |
| `Enter`       | Execute                          |
| `Shift+Enter` | Insert newline (multiline input) |
| `↑` / `↓`     | Recall previous commands         |

### What gets captured

- **Return values** — serialized with `inspect()` for readable table output.
- **`print()` calls** — captured and shown inline below the command, even in sandbox mode.

---

## Examples

### Inspect live state

```lua
-- Read a value
return player.health

-- Inspect a whole table (one level deep)
return player

-- Nested field
return world.enemies[1].position
```

### Tweak values at runtime

```lua
-- Teleport the player
player.x = 100
player.y = 200

-- Refill health
player.health = player.maxHealth

-- Speed up the game
love.timer.sleep = function() end
```

### Call game functions

```lua
-- Trigger a function defined in your game
spawnEnemy("goblin", 300, 400)

-- Play a sound
sfx.hit:play()

-- Reload a level
gameState:loadLevel(1)
```

### Inspect love2d internals

```lua
-- Draw call stats
return love.graphics.getStats()

-- Memory usage
return collectgarbage("count") .. " KB"

-- Screen size
return love.graphics.getDimensions()
```

### Multi-line scripts

Use `Shift+Enter` to write multi-line code:

```lua
local total = 0
for _, enemy in ipairs(world.enemies) do
  total = total + enemy.health
end
return total
```

### Print multiple values

```lua
print("pos:", player.x, player.y)
print("state:", player.state)
return player.velocity
-- Output:
-- pos:   142   320
-- state: jumping
-- { x = 2.5, y = -8.1 }
```

---

## Options

| Option             | Type      | Default  | Description                                                                                                                                                             |
| ------------------ | --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evalEnabled`      | `boolean` | `false`  | Must be `true` to allow code execution. Acts as a second safety gate alongside `apiKey`.                                                                                |
| `sandbox`          | `boolean` | `true`   | Run code in a sandboxed environment that inherits `_G` but isolates `print()`. Set to `false` to run in the real global environment (allows mutating globals directly). |
| `maxCodeSize`      | `number`  | `20000`  | Maximum characters per eval payload. Payloads over this limit are rejected.                                                                                             |
| `instructionLimit` | `number`  | `100000` | Lua instruction count before the eval is aborted. Prevents infinite loops from freezing the game.                                                                       |
| `maxOutputSize`    | `number`  | `100000` | Maximum characters in the serialized return value before it is truncated.                                                                                               |

---

## Security

!!! warning
Never enable the Console in builds you ship to players. Anyone who knows the host IP, port, and `apiKey` can execute arbitrary Lua code inside your game process.

Recommended setup for development:

```lua
local debugger = FeatherDebugger({
  debug  = Config.IS_DEBUG,       -- disabled in release builds
  apiKey = os.getenv("FEATHER_KEY") or "dev-only",
})
```

Set `FEATHER_KEY` in your shell and match it in Feather desktop **Settings → API Key**. This way the key is never committed to source control and the Console is inert in release builds.

See [Recommendations → Level 3 — Exclude from the release build](recommendations.md#level-3-exclude-from-the-release-build-recommended) for ways to strip Feather entirely from release builds.
