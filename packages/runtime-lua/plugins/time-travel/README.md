# Time Travel

Time Travel records per-frame snapshots of your observer values into a ring buffer, then lets you scrub backwards through history to see exactly what changed and when. It answers the question: *"What was my game state 3 seconds before that crash?"*

---

## Setup

### With auto.lua

The time-travel plugin ships disabled by default. Enable it explicitly:

```lua
require("feather.auto").setup({
  include = { "time-travel" },
})
```

To customize the buffer size:

```lua
require("feather.auto").setup({
  include = { "time-travel" },
  pluginOptions = {
    ["time-travel"] = { bufferSize = 2000 },
  },
})
```

### Manual setup

```lua
local FeatherDebugger      = require "feather"
local FeatherPluginManager = require "feather.plugin_manager"
local TimeTravelPlugin     = require "feather.plugins.time-travel"

local debugger = FeatherDebugger({
  debug   = true,
  plugins = {
    FeatherPluginManager.createPlugin(TimeTravelPlugin, "time-travel", {
      bufferSize = 1000,
    }),
  },
})

function love.update(dt)
  debugger:update(dt)
end
```

---

## Registering observers

Time Travel snapshots whatever values you register with `observe()` each frame. The more you observe, the richer the history:

```lua
function love.update(dt)
  -- Player state
  DEBUGGER:observe("player.x",       player.x)
  DEBUGGER:observe("player.y",       player.y)
  DEBUGGER:observe("player.state",   player.state)
  DEBUGGER:observe("player.health",  player.health)

  -- Physics
  DEBUGGER:observe("velocity.x",     player.velocity.x)
  DEBUGGER:observe("velocity.y",     player.velocity.y)
  DEBUGGER:observe("on_ground",      player.onGround)

  -- Game world
  DEBUGGER:observe("enemy_count",    #world.enemies)
  DEBUGGER:observe("active_room",    world.currentRoom)

  DEBUGGER:update(dt)
end
```

Observer values are formatted as strings before being stored — there is no deep clone of your game tables. The cost is proportional to the number of keys, not to their complexity.

---

## Using the timeline

### Basic workflow

1. Open the **Time Travel** tab in the Feather desktop app.
2. Click **Start Recording**. The plugin captures a snapshot every frame.
3. Play your game and reproduce the bug.
4. Click **Stop & Load**. The desktop fetches all recorded frames.
5. Drag the **timeline scrubber** (or use the **‹** and **›** buttons) to any frame.
6. The **Observer Snapshot** panel shows every key's value at that frame.

### Reading the diff

The snapshot table compares the current frame against the previous one and highlights what changed:

| Indicator                       | Meaning                               |
| ------------------------------- | ------------------------------------- |
| 🟡 Yellow dot + strikethrough   | Value changed from the previous frame |
| 🟢 Green dot                    | Key appeared for the first time       |
| 🔴 Red dot                      | Key was no longer present             |

Changed keys are sorted to the top so you can spot the transition immediately.

### Frame navigation

- **Scrubber** — drag to jump anywhere in the history.
- **‹ / ›** buttons — move exactly one frame at a time, useful for pinpointing the exact frame a value flipped.
- Frame info above the scrubber shows: frame ID, timestamp in seconds, and frame delta time.

---

## Example: finding the frame a jump breaks

```lua
-- Observe jump-related state every frame
DEBUGGER:observe("on_ground",     player.onGround)
DEBUGGER:observe("velocity.y",    player.velocity.y)
DEBUGGER:observe("jump_count",    player.jumpCount)
DEBUGGER:observe("state",         player.state)
```

After recording and scrubbing to the moment the jump felt wrong, you might see:

| Frame | on_ground | velocity.y | jump_count | state   |
| ----- | --------- | ---------- | ---------- | ------- |
| 241   | true      | 0          | 0          | idle    |
| 242   | **false** | **-12**    | **1**      | **jumping** |
| 243   | false     | -10.4      | 1          | jumping |
| …     | …         | …          | …          | …       |

Step backwards from where the bug manifests to frame 242 — the exact frame the jump was triggered — and check whether `velocity.y = -12` matches your expected jump force.

---

## Integration with the step debugger

If both the **Step Debugger** and **Time Travel** are active, Feather automatically pushes the current frame buffer to the desktop whenever a breakpoint fires — without you clicking anything.

The **Debugger** toolbar shows a **Time Travel (N frames)** button. Clicking it navigates to the timeline pre-loaded with all recorded frames, positioned at the latest one.

**Recommended setup for deep debugging:**

```lua
require("feather.auto").setup({
  debugger = true,
  include  = { "time-travel" },
  pluginOptions = {
    ["time-travel"] = { bufferSize = 500 },
  },
})
```

With this config:

1. Set a breakpoint anywhere near the bug.
2. Start Time Travel recording.
3. Run the game — it pauses at the breakpoint.
4. The desktop shows the call stack, locals, **and** the frame history in one click.
5. Use Step commands to walk forward; switch to Time Travel to walk backward.

---

## Configuration

| Option       | Type     | Default | Description                                                                                                                                         |
| ------------ | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bufferSize` | `number` | `1000`  | Maximum frames stored. When the buffer is full, the oldest frame is overwritten. At 60 fps this is ~16 seconds of history. |

### Buffer size guide

| Game FPS | `bufferSize` | Coverage   |
| -------- | ------------ | ---------- |
| 60       | 300          | ~5 seconds |
| 60       | 1000         | ~16 seconds |
| 60       | 3600         | ~60 seconds |
| 30       | 1000         | ~33 seconds |

> **Tip:** Start with `bufferSize = 1000`. If the bug takes longer than ~15 seconds to trigger after you start recording, increase it. Very large buffers (5000+) may take a moment to transfer over the WebSocket when you click Stop & Load.

---

## Performance

- Snapshots are captured in `update()` — one per frame.
- Observer values are pre-formatted strings (set by `observe()`), so snapshot cost is a shallow table copy: one string per key.
- Large observer strings are sent as binary text attachments when frames are transferred, keeping the JSON frame index compact.
- The ring buffer allocates a fixed table up front; there is no GC pressure during recording.
- Sending frames over the WebSocket happens only when you click **Stop & Load** or **Refresh** — not during recording.
