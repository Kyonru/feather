# EntityInspectorPlugin

The `EntityInspectorPlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **browse and inspect game entities in real-time**. It displays a tree view of your game objects with their properties (position, size, rotation, health, etc.) inside the Feather desktop app.

LÖVE doesn't have a built-in scene graph, so this plugin works with **any entity structure** — custom tables, ECS libraries (Concord, tiny-ecs), or scene trees. You register one or more entity sources, and the plugin handles introspection automatically.

## 📦 Installation

The plugin lives in `plugins/entity-inspector/`. Require it from your project:

```lua
local EntityInspectorPlugin = require("plugins.entity-inspector")
```

## ⚙️ Configuration

Register the plugin using `FeatherPluginManager.createPlugin`:

```lua
FeatherPluginManager.createPlugin(EntityInspectorPlugin, "entity-inspector", {
  sources = {
    {
      name = "Game Objects",
      entities = function() return myEntityList end,
    },
  },
})
```

### Plugin Options

| Option        | Type     | Default | Description                                     |
| ------------- | -------- | ------- | ----------------------------------------------- |
| `sources`     | `table`  | `{}`    | Array of entity sources to inspect (see below). |
| `maxValueLen` | `number` | `120`   | Max characters for property value display.      |
| `maxEntities` | `number` | `500`   | Max entities to send per push cycle.            |
| `maxDepth`    | `number` | `3`     | Max depth for nested children.                  |

### Entity Source

Each source in the `sources` array describes how to read a group of entities:

| Field           | Type                         | Required | Description                                           |
| --------------- | ---------------------------- | -------- | ----------------------------------------------------- |
| `name`          | `string`                     | Yes      | Display name shown in the source selector.            |
| `entities`      | `table` or `function`        | Yes      | An array of entities, or a function that returns one. |
| `getChildren`   | `fun(entity): table\|nil`    | No       | Return child entities for tree nesting.               |
| `getProperties` | `fun(entity): table\|nil`    | No       | Return `{ key = value }` for custom properties.       |
| `getName`       | `fun(entity, index): string` | No       | Return a display name for the entity.                 |
| `filter`        | `fun(entity): boolean`       | No       | Return `false` to exclude an entity.                  |

## 🔍 How It Works

### Auto-Detection

When entities are plain Lua tables, the plugin automatically detects common properties:

- **Position:** `x`, `y`, `z`
- **Size:** `width`, `height`, `w`, `h`
- **Transform:** `rotation`, `angle`, `scale`, `scaleX`, `scaleY`
- **State:** `visible`, `active`, `alive`, `enabled`
- **Identity:** `name`, `id`, `tag`, `type`, `class`
- **Gameplay:** `health`, `hp`, `speed`, `velocity`, `vx`, `vy`
- **Ordering:** `layer`, `zIndex`, `order`

Custom properties from `getProperties` are merged with auto-detected ones.

### Entity Naming

The display name for each entity is resolved in order:

1. `getName(entity, index)` callback (if provided)
2. `entity.name`, `entity.id`, `entity.tag`, `entity.type`, or `entity.class` (first non-nil)
3. `#index` (fallback)

### Children / Tree Nesting

If you provide `getChildren`, the desktop app renders entities as an expandable tree. Children are recursed up to `maxDepth` levels.

### Dynamic Entities

Pass a **function** for `entities` instead of a static table. The function is called every push cycle, so the inspector always shows the current state:

```lua
sources = {
  {
    name = "Enemies",
    entities = function() return world:getEntities("enemy") end,
  },
}
```

### Adding Sources After Init

You can register additional sources at runtime:

```lua
local inspector = debugger.pluginManager:getPlugin("entity-inspector")
if inspector then
  inspector.instance:addSource({
    name = "Particles",
    entities = function() return particleList end,
  })
end
```

## 🎮 Usage Examples

### Simple Entity Table

```lua
local entities = {
  { name = "Player", x = 100, y = 200, health = 100, speed = 150 },
  { name = "Enemy",  x = 400, y = 180, health = 30,  tag = "goblin" },
}

FeatherPluginManager.createPlugin(EntityInspectorPlugin, "entity-inspector", {
  sources = {
    { name = "All Entities", entities = entities },
  },
})
```

### With Children (Scene Graph)

```lua
FeatherPluginManager.createPlugin(EntityInspectorPlugin, "entity-inspector", {
  sources = {
    {
      name = "Scene",
      entities = function() return scene.rootNodes end,
      getChildren = function(node) return node.children end,
    },
  },
})
```

### ECS Integration (tiny-ecs)

```lua
FeatherPluginManager.createPlugin(EntityInspectorPlugin, "entity-inspector", {
  sources = {
    {
      name = "ECS Entities",
      entities = function() return world.entities end,
      getProperties = function(e)
        return {
          components = table.concat(world:getComponents(e), ", "),
        }
      end,
    },
  },
})
```

### Multiple Sources

```lua
FeatherPluginManager.createPlugin(EntityInspectorPlugin, "entity-inspector", {
  sources = {
    { name = "Players", entities = function() return playerList end },
    { name = "Enemies", entities = function() return enemyList end },
    { name = "Pickups", entities = function() return pickupList end },
  },
})
```

The desktop app shows a dropdown to switch between sources.

### Filtering

```lua
{
  name = "Active Only",
  entities = allEntities,
  filter = function(e) return e.active == true end,
}
```

The desktop app also has a text filter that matches entity names.

## 🎮 Actions

- **Refresh** — forces an immediate data push (useful if `sampleRate` is slow).

### Desktop Params

The desktop app sends these params to control display:

- `selectedSource` — index of the active entity source (1-based)
- `searchFilter` — text filter applied to entity names

## Debugger Metadata (`getConfig`)

- Type: `entity-inspector`
- Icon: `boxes`
- Tab name: `Entities`
