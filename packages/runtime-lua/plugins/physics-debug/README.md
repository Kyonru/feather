# Physics Debug Plugin

Renders a real-time debug overlay on top of your game for every `love.physics` World you register. Bodies, joints, contact points, and AABBs are drawn with color-coded lines directly on the game canvas. The desktop tab shows a live table of body/joint/contact counts and gravity per world.

## Features

- **Color-coded bodies** — static (gray), dynamic (green), kinematic (blue), sleeping (muted blue), sensors (yellow)
- **Joints** — purple lines connecting anchor points
- **Contact points** — red dots at active collision positions
- **AABBs** — olive bounding boxes per fixture (opt-in)
- **Toggle overlay** from the desktop without restarting the game
- **Per-layer visibility** — show/hide bodies, joints, contacts, and AABBs independently
- **Multiple worlds** — register as many worlds as you need; each gets its own row in the stats table

## Installation

The plugin is included with Feather. If using `auto.lua`, it's registered automatically (starts disabled).

### With auto.lua (zero-config)

```lua
require("feather.auto")
```

The plugin starts disabled. Enable it from the Feather desktop or force-enable on startup:

```lua
require("feather.auto").setup({
  include = { "physics-debug" },
})
```

### Manual registration

```lua
local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local PhysicsDebugPlugin = require("plugins.physics-debug")

local plugin = FeatherPluginManager.createPlugin(PhysicsDebugPlugin, "physics-debug", {
  enabled = true,
  showBodies = true,
  showJoints = true,
  showContacts = true,
  showAABBs = false,
  alpha = 0.7,
  autoHook = true,
})

local debugger = FeatherDebugger({ plugins = { plugin } })
```

## Registering a World

Call `addWorld` after the plugin is set up. The `getter` is called every frame, so it is safe to pass a function that lazily returns the world.

```lua
-- In love.load, after setting up Feather
local world = love.physics.newWorld(0, 800)

DEBUGGER:getPlugin("physics-debug"):addWorld("main", function()
  return world
end)
```

You can register multiple worlds:

```lua
physicsPlugin:addWorld("foreground", function() return fgWorld end)
physicsPlugin:addWorld("background", function() return bgWorld end)
```

To remove a world:

```lua
physicsPlugin:removeWorld("background")
```

## Drawing the overlay

By default (`autoHook = true`) the plugin wraps `love.draw` so the overlay renders automatically after your game's draw call. Nothing else is needed.

If you set `autoHook = false`, call `draw()` yourself at the end of your draw function:

```lua
function love.draw()
  -- your game drawing...
  DEBUGGER:getPlugin("physics-debug"):draw()
end
```

To stop auto-hooking at runtime:

```lua
DEBUGGER:getPlugin("physics-debug"):unhookDraw()
```

## Desktop UI

**Toolbar:**

| Control | Description |
| ------- | ----------- |
| **Enable / Disable Overlay** | Toggle the debug overlay on and off |
| **Bodies** checkbox | Show/hide body shapes |
| **Joints** checkbox | Show/hide joint lines and anchors |
| **Contacts** checkbox | Show/hide active contact points |
| **AABBs** checkbox | Show/hide fixture bounding boxes |

**Table columns:**

| Column | Description |
| ------ | ----------- |
| World | Name passed to `addWorld` |
| Bodies | Number of bodies in the world |
| Joints | Number of joints |
| Contacts | Number of currently touching contacts |
| Gravity | World gravity as `x, y` |

A **TOTAL** summary row is appended when more than one world is registered.

## Color reference

| Color | Meaning |
| ----- | ------- |
| Gray | Static body |
| Green | Dynamic body (awake) |
| Muted blue | Dynamic body (sleeping) |
| Blue | Kinematic body |
| Yellow | Sensor fixture |
| Purple | Joint |
| Red | Active contact point |
| Olive | AABB bounding box |

## Options

Pass options when registering the plugin manually:

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `enabled` | boolean | `true` | Whether the overlay is drawn on startup |
| `showBodies` | boolean | `true` | Draw body shapes |
| `showJoints` | boolean | `true` | Draw joints |
| `showContacts` | boolean | `true` | Draw contact points |
| `showAABBs` | boolean | `false` | Draw fixture AABBs |
| `alpha` | number | `0.7` | Overlay transparency (0–1) |
| `autoHook` | boolean | `true` | Wrap `love.draw` automatically |

## Notes

- The overlay is drawn in screen space using the current `love.graphics` transform. If your game uses a camera, the overlay follows the camera automatically.
- `draw()` saves and restores `love.graphics` color and line width, so it does not affect your game's render state.
- If a world's getter throws an error (e.g. the world is nil during a state transition), that entry is skipped silently and shows `N/A` in the stats table.
