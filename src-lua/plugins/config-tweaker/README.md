# ConfigTweakerPlugin

The `ConfigTweakerPlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **tweak game config values live** from the Feather desktop app. Expose any variable — gravity, speed, spawn rate, toggle flags — as inputs, number fields, or checkboxes in the desktop UI. Changes apply instantly without restarting.

## 📦 Installation

The plugin lives in `plugins/config-tweaker/`. Require it from your project:

```lua
local ConfigTweakerPlugin = require("plugins.config-tweaker")
```

## ⚙️ Configuration

Register the plugin with a list of config fields:

```lua
FeatherPluginManager.createPlugin(ConfigTweakerPlugin, "config-tweaker", {
  fields = {
    {
      key = "gravity",
      label = "Gravity",
      type = "number",
      min = 0, max = 2000, step = 10,
      get = function() return gameConfig.gravity end,
      set = function(v) gameConfig.gravity = v end,
    },
    {
      key = "playerSpeed",
      label = "Player Speed",
      type = "number",
      min = 0, max = 1000,
      get = function() return player.speed end,
      set = function(v) player.speed = v end,
    },
    {
      key = "godMode",
      label = "God Mode",
      type = "boolean",
      get = function() return gameConfig.godMode end,
      set = function(v) gameConfig.godMode = v end,
    },
  },
})
```

### Plugin Options

| Option   | Type    | Default | Description                        |
| -------- | ------- | ------- | ---------------------------------- |
| `fields` | `table` | `{}`    | Array of config field definitions. |

### Config Field

Each field in the `fields` array:

| Property | Type          | Required | Description                                         |
| -------- | ------------- | -------- | --------------------------------------------------- |
| `key`    | `string`      | Yes      | Unique identifier for this field.                   |
| `label`  | `string`      | No       | Display label (defaults to `key`).                  |
| `icon`   | `string`      | No       | Lucide icon name (default: `"sliders-horizontal"`). |
| `get`    | `fun(): any`  | Yes      | Getter function — returns current value.            |
| `set`    | `fun(v: any)` | Yes      | Setter function — applies the new value.            |
| `type`   | `string`      | No       | `"number"` (default), `"string"`, or `"boolean"`.   |
| `min`    | `number`      | No       | Minimum value (number fields only).                 |
| `max`    | `number`      | No       | Maximum value (number fields only).                 |
| `step`   | `number`      | No       | Step increment (number fields only).                |

## 🔍 How It Works

### Desktop Rendering

The plugin uses the existing **server-driven UI** action system:

- **Number** fields render as `<input type="number">` with min/max/step constraints
- **String** fields render as `<input type="text">`
- **Boolean** fields render as checkboxes

When you change a value in the desktop UI, it sends `cmd:plugin:params` with the field key and new value. The plugin coerces the value to the correct type, clamps numbers to min/max, and calls your setter.

### Live Values

The plugin also pushes a table showing all current values, so you can see the actual state even if the input field shows a stale value.

### Type Coercion

- `"number"` — parsed with `tonumber()`, clamped to `min`/`max` if set
- `"boolean"` — `"true"` or `true` → `true`, everything else → `false`
- `"string"` — passed through as-is via `tostring()`

Invalid values (e.g. non-numeric string for a number field) are silently ignored.

### Error Handling

If a setter throws an error, it's caught with `pcall` and logged. The game continues running.

## 🎮 Usage Examples

### Physics Config

```lua
FeatherPluginManager.createPlugin(ConfigTweakerPlugin, "config-tweaker", {
  fields = {
    { key = "gravity", label = "Gravity", type = "number", min = 0, max = 2000, step = 10,
      get = function() return physics.gravity end,
      set = function(v) physics.gravity = v end },
    { key = "friction", label = "Friction", type = "number", min = 0, max = 1, step = 0.01,
      get = function() return physics.friction end,
      set = function(v) physics.friction = v end },
    { key = "bounce", label = "Bounce", type = "number", min = 0, max = 1, step = 0.05,
      get = function() return physics.bounce end,
      set = function(v) physics.bounce = v end },
  },
})
```

### Adding Fields at Runtime

```lua
local tweaker = debugger.pluginManager:getPlugin("config-tweaker")
if tweaker then
  tweaker.instance:addField({
    key = "spawnRate",
    label = "Spawn Rate",
    type = "number",
    min = 0.1, max = 10, step = 0.1,
    get = function() return spawner.rate end,
    set = function(v) spawner.rate = v end,
  })
end
```

### Game Flags

```lua
{
  fields = {
    { key = "debug", label = "Debug Draw", type = "boolean",
      get = function() return config.debugDraw end,
      set = function(v) config.debugDraw = v end },
    { key = "music", label = "Music", type = "boolean",
      get = function() return config.musicEnabled end,
      set = function(v)
        config.musicEnabled = v
        if v then bgm:play() else bgm:pause() end
      end },
    { key = "level", label = "Level Name", type = "string",
      get = function() return config.levelName end,
      set = function(v) config.levelName = v end },
  },
}
```

## 🎮 Actions

| Action      | Icon         | Description                 |
| ----------- | ------------ | --------------------------- |
| **Refresh** | `refresh-cw` | Re-read all current values. |

Each config field also appears as an interactive input or checkbox.

### Debug Render Overlay

Instead of a dedicated plugin, use the Config Tweaker to expose debug draw toggles. The game already owns the rendering logic — the tweaker just provides desktop UI controls:

```lua
{
  fields = {
    { key = "wireframe", label = "Wireframe", type = "boolean",
      get = function() return love.graphics.isWireframe() end,
      set = function(v) love.graphics.setWireframe(v) end },
    { key = "showColliders", label = "Show Colliders", type = "boolean",
      get = function() return gameConfig.showColliders end,
      set = function(v) gameConfig.showColliders = v end },
    { key = "showSpriteBounds", label = "Show Sprite Bounds", type = "boolean",
      get = function() return gameConfig.showSpriteBounds end,
      set = function(v) gameConfig.showSpriteBounds = v end },
  },
}
```

Then in your `love.draw()`:

```lua
if gameConfig.showColliders then
  love.graphics.setColor(0, 1, 0, 0.5)
  for _, body in ipairs(world:getBodies()) do
    for _, fixture in ipairs(body:getFixtures()) do
      local shape = fixture:getShape()
      if shape:typeOf("CircleShape") then
        local x, y = body:getWorldPoint(shape:getPoint())
        love.graphics.circle("line", x, y, shape:getRadius())
      elseif shape:typeOf("PolygonShape") then
        love.graphics.polygon("line", body:getWorldPoints(shape:getPoints()))
      end
    end
  end
end

if gameConfig.showSpriteBounds then
  love.graphics.setColor(1, 1, 0, 0.5)
  for _, entity in ipairs(entities) do
    love.graphics.rectangle("line", entity.x, entity.y, entity.width, entity.height)
  end
end
```

## Desktop Display

The plugin pushes a table with all current values:

| Column     | Description                      |
| ---------- | -------------------------------- |
| **Config** | Field label                      |
| **Value**  | Current value (from getter)      |
| **Type**   | `number`, `string`, or `boolean` |

## Debugger Metadata (`getConfig`)

- Type: `config-tweaker`
- Icon: `sliders-horizontal`
- Tab name: `Config`
