# InputReplayPlugin

The `InputReplayPlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **record and replay input events** (keyboard and mouse) with timestamps. Replay recorded inputs deterministically to reproduce bugs, test sequences, or automate repetitive interactions.

## 📦 Installation

The plugin lives in `plugins/input-replay/`. Require it from your project:

```lua
local InputReplayPlugin = require("plugins.input-replay")
```

## ⚙️ Configuration

Register the plugin using `FeatherPluginManager.createPlugin`:

```lua
FeatherPluginManager.createPlugin(InputReplayPlugin, "input-replay", {
  captureKeys = true,       -- record keypressed/keyreleased (default: true)
  captureMouse = true,      -- record mousepressed/mousereleased (default: true)
  captureMouseMove = false,  -- record mousemoved (default: false, can be noisy)
  maxEvents = 10000,         -- max events per recording (default: 10000)
})
```

### Plugin Options

| Option             | Type      | Default | Description                                         |
| ------------------ | --------- | ------- | --------------------------------------------------- |
| `captureKeys`      | `boolean` | `true`  | Record `keypressed` / `keyreleased` events.         |
| `captureMouse`     | `boolean` | `true`  | Record `mousepressed` / `mousereleased` events.     |
| `captureMouseMove` | `boolean` | `false` | Record `mousemoved` events. Off by default (noisy). |
| `maxEvents`        | `number`  | `10000` | Maximum events stored per recording.                |

## 🔍 How It Works

### Recording

When you press **Record**, the plugin wraps LÖVE's input callbacks (`love.keypressed`, `love.keyreleased`, `love.mousepressed`, `love.mousereleased`, and optionally `love.mousemoved`) to intercept events. Each event is stored with:

- **Timestamp** — seconds elapsed since recording started (high-resolution via `socket.gettime` or `love.timer.getTime`)
- **Type** — which callback fired
- **Arguments** — all original arguments (key, scancode, isrepeat, x, y, button, etc.)

The original callbacks still execute normally — recording is transparent to the game.

### Replaying

When you press **Replay**, the plugin fires the recorded events at their original timestamps by calling the original (pre-hook) LÖVE callbacks. This means:

- Events replay in the exact order they were recorded
- Timing is preserved relative to replay start
- The game receives the same input sequence as during recording
- Replay does **not** re-record events (avoids feedback loops)

Replay stops automatically when all events have been fired, or manually via the **Replay** button (toggle).

### Save / Load

- **Save** writes the event recording to a JSON file (`feather_input_YYYYMMDD_HHMMSS.json`) in LÖVE's save directory
- **Load** reads the most recent saved input file, replacing the current event buffer
- Files are portable — share them with teammates to reproduce bugs

### Hook Safety

- Hooks are installed lazily (only when recording or replaying starts)
- Original callbacks are preserved and restored on `finish()`
- If a callback didn't exist before hooking, the hook still works (and fires with no original to call)

## 🎮 Actions

The Feather desktop app shows these controls:

| Action         | Icon          | Description                                       |
| -------------- | ------------- | ------------------------------------------------- |
| **Record**     | `circle`      | Toggle recording on/off. Clears previous events.  |
| **Replay**     | `play`        | Toggle replay on/off. Replays recorded events.    |
| **Clear**      | `trash-2`     | Clear all recorded events.                        |
| **Save**       | `save`        | Save events to a JSON file in the save directory. |
| **Load**       | `folder-open` | Load the most recent saved input file.            |
| **Keys**       | `keyboard`    | Checkbox: enable/disable keyboard capture.        |
| **Mouse**      | `mouse`       | Checkbox: enable/disable mouse button capture.    |
| **Mouse Move** | `move`        | Checkbox: enable/disable mouse movement capture.  |

## 🎮 Usage Examples

### Basic Setup

```lua
local InputReplayPlugin = require("plugins.input-replay")

FeatherPluginManager.createPlugin(InputReplayPlugin, "input-replay", {})
```

Then in the Feather desktop app:

1. Press **Record** and play through a bug reproduction sequence
2. Press **Record** again to stop
3. Press **Replay** to replay the exact same inputs
4. Press **Save** to persist the recording for later

### Programmatic Control

```lua
local plugin = debugger.pluginManager:getPlugin("input-replay")
if plugin then
  local replay = plugin.instance

  -- Start recording from code
  replay:startRecording()

  -- Later, stop and replay
  replay:stopRecording()
  replay:startReplay()
end
```

### Bug Reproduction Workflow

1. Record the input sequence that triggers a bug
2. **Save** the recording
3. Share the JSON file with your team
4. They **Load** it and **Replay** to see the exact same bug

## Desktop Display

The plugin pushes a table with the most recent 200 events (newest first):

| Column      | Description                                       |
| ----------- | ------------------------------------------------- |
| **#**       | Event index in the recording                      |
| **Time**    | Timestamp relative to recording start             |
| **Type**    | `Key ↓`, `Key ↑`, `Mouse ↓`, `Mouse ↑`, `Mouse →` |
| **Details** | Key name, button + coordinates, etc.              |

The table shows a loading spinner while recording or replaying is active.

## Debugger Metadata (`getConfig`)

- Type: `input-replay`
- Icon: `play`
- Tab name: `Input Replay`
