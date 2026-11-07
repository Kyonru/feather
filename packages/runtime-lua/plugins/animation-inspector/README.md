# Animation Inspector Plugin (anim8)

Inspect [anim8](https://github.com/kikito/anim8) sprite animation states — see current frame, speed, status, flip state, and control playback from the desktop.

## Features

- **Auto-hooking** — Pass the anim8 module to automatically track all animations created via `anim8.newAnimation`
- **Animation table** — Shows all tracked animations with frame position, timer, duration, flip state, and dimensions
- **Playback control** — Pause All, Resume All, Reset All from the desktop toolbar
- **Status tracking** — Playing/paused state for each animation
- **Frame info** — Current frame, total frames, per-frame duration, total duration
- **Flip detection** — Shows horizontal/vertical flip state
- **Summary cards** — Tracked, Playing, Paused counts

## Usage

### With auto.lua

```lua
require("feather.auto").setup({
  include = { "animation-inspector" },
  pluginOptions = {
    ["animation-inspector"] = {
      anim8 = require("lib.anim8"),  -- pass the anim8 module for auto-hooking
    },
  },
})
```

### Manual registration

```lua
local AnimationInspectorPlugin = require("plugins.animation-inspector")
local FeatherPluginManager = require("feather.plugin_manager")

DEBUGGER = Feather({
  plugins = {
    FeatherPluginManager.createPlugin(AnimationInspectorPlugin, "animation-inspector", {}),
  },
})
```

### Registering animations

```lua
local anim8 = require("lib.anim8")

local image = love.graphics.newImage("player.png")
local grid = anim8.newGrid(32, 32, image:getWidth(), image:getHeight())
local walkAnim = anim8.newAnimation(grid("1-8", 1), 0.1)
local idleAnim = anim8.newAnimation(grid("1-4", 2), 0.2)

local plugin = DEBUGGER.pluginManager:getPlugin("animation-inspector")
if plugin then
  plugin.instance:addAnimation("player-walk", function() return walkAnim end)
  plugin.instance:addAnimation("player-idle", function() return idleAnim end)
end
```

## Configuration

| Option      | Type    | Default | Description                                |
| ----------- | ------- | ------- | ------------------------------------------ |
| `anim8`     | table   | `nil`   | The anim8 module — enables auto-hooking    |
| `autoHook`  | boolean | `true`  | Hook `anim8.newAnimation` (requires `anim8`)|
| `showPaused`| boolean | `true`  | Show paused animations in the table        |

## Desktop UI

### Table columns

| Column    | Description                                      |
| --------- | ------------------------------------------------ |
| Name      | Registered animation label                       |
| Status    | playing / paused                                 |
| Frame     | Current frame / total frames                     |
| Timer     | Current timer / total duration                   |
| Frame Dur | Duration of the current frame                    |
| Flip      | H, V, H+V, or — (none)                          |
| Size      | Frame dimensions (width x height)                |

### Actions

- **Pause All** — Pause all tracked animations
- **Resume All** — Resume all tracked animations
- **Reset All** — Reset all animations to frame 1 and resume
- **Show Paused** — Toggle visibility of paused animations

### Cards

- **Summary** — Tracked, Playing, Paused counts

## Debugging scenarios

- **Wrong frame** — Check the Frame column to verify the animation is on the expected frame
- **Animation stuck** — Status shows "paused" unexpectedly; use Resume All or check your code for stray `pause()` calls
- **Speed issues** — Compare Frame Dur with expected values; a `0.1s` per-frame duration = 10 FPS animation
- **Flip bugs** — Verify the Flip column matches expected horizontal/vertical flip state
- **Missing animation** — If not showing up, ensure the getter function returns the anim8 animation instance
