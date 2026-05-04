# Collision Debug Plugin (bump.lua)

Visualize [bump.lua](https://github.com/kikito/bump.lua) AABB collision worlds with a debug overlay — see bounding boxes, cell grids, and track collision stats.

## Features

- **Bounding box overlay** — Draw rectangles for all items in bump worlds
- **Cell grid** — Optional grid showing bump's spatial hash cells
- **Item labels** — Optional per-item labels via custom `labelFn`
- **Custom colors** — Per-item color coding via `colorFn`
- **Collision logging** — `logCollision()` to record collisions from `world:move` results
- **Multi-world** — Track multiple bump worlds simultaneously
- **Auto-hook** — Hooks `love.draw()` automatically (or call `draw()` manually)

## Usage

### With auto.lua

```lua
require("feather.auto").setup({
  include = { "collision-debug" },
  pluginOptions = {
    ["collision-debug"] = {
      autoHook = true,
    },
  },
})
```

### Manual registration

```lua
local CollisionDebugPlugin = require("plugins.collision-debug")
local FeatherPluginManager = require("feather.plugin_manager")

DEBUGGER = Feather({
  plugins = {
    FeatherPluginManager.createPlugin(CollisionDebugPlugin, "collision-debug", {
      autoHook = false,  -- call draw() manually
    }),
  },
})
```

### Registering worlds

```lua
local bump = require("lib.bump")
local world = bump.newWorld(64)

local plugin = DEBUGGER.pluginManager:getPlugin("collision-debug")
if plugin then
  plugin.instance:addWorld("main", function()
    return world
  end)
end
```

### Per-item colors and labels

```lua
plugin.instance:addWorld("main", function()
  return world
end, function(item)
  -- colorFn: return r, g, b per item
  if item.isPlayer then return 0.2, 0.8, 1.0 end
  if item.isEnemy  then return 1.0, 0.3, 0.3 end
  return 0.5, 0.5, 0.5 -- default gray for tiles
end, function(item)
  -- labelFn: return a string label
  return item.name or nil
end)
```

### Logging collisions

After `world:move`, feed collision data to the plugin:

```lua
local actualX, actualY, cols, len = world:move(player, goalX, goalY)
for i = 1, len do
  local col = cols[i]
  plugin.instance:logCollision(col.item, col.other, col.type, col.normal)
end
```

## Configuration

| Option       | Type    | Default | Description                           |
| ------------ | ------- | ------- | ------------------------------------- |
| `autoHook`   | boolean | `true`  | Hook `love.draw()` to render overlay  |
| `enabled`    | boolean | `true`  | Whether the overlay draws on start    |
| `showGrid`   | boolean | `false` | Show the cell grid overlay            |
| `showLabels` | boolean | `false` | Show item labels (requires `labelFn`) |
| `alpha`      | number  | `0.6`   | Overlay transparency                  |
| `maxLog`     | number  | `200`   | Max collision log entries to keep     |

## Desktop UI

### Table columns

| Column    | Description                    |
| --------- | ------------------------------ |
| World     | Registered world name          |
| Items     | Number of items in the world   |
| Cells     | Number of active spatial cells |
| Cell Size | The world's cell size          |

### Actions

- **Enable/Disable Overlay** — Toggle the debug drawing
- **Clear Log** — Clear the collision log
- **Grid** — Toggle cell grid visibility
- **Labels** — Toggle item label display

### Cards

- **Stats** — Worlds, Total Items, Total Cells, Logged Collisions

## Debugging scenarios

- **Missing collision** — Enable overlay to verify items are in the world and have correct bounding boxes
- **Performance** — High cell count with few items may indicate a too-small `cellSize`; reduce item count or increase cell size
- **Spatial coverage** — Toggle Grid to visualize how items map to the spatial hash
- **Collision type issues** — Use `logCollision()` to track which response types are being triggered
