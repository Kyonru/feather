# Feather Plugins

Feather plugins are Lua modules that extend the functionality of the debugger. Plugins use a **server-driven UI** approach: they declare their actions and configuration in Lua via `getConfig()`, and the Feather desktop app renders the UI automatically — no TypeScript code needed.

## Creating a plugin

To create a plugin, extend the `FeatherPlugin` base class and implement the lifecycle methods you need:

- `init(config)`: Called when the plugin is initialized.
- `update(dt, feather)`: Called every frame. Wrapped in `pcall` for error isolation — a crashing plugin won't take down the game.
- `onerror(msg, feather)`: Called when a game error occurs.
- `handleRequest(request, feather)`: Called on each push cycle to get data for the desktop (GET). Return data to be sent, or `nil` to skip.
- `handleActionRequest(request, feather)`: Called when a plugin action is triggered from the desktop (POST). Returns `(data, err)` tuple.
- `handleActionCancel(request, feather)`: Called when an in-flight action is cancelled from the desktop (DELETE).
- `handleParamsUpdate(request, feather)`: Called when plugin parameters are updated from the desktop (PUT).
- `finish(feather)`: Called when the game disconnects.
- `getConfig()`: Returns the plugin configuration including server-driven UI actions. Sent to the desktop on connect.

To help with the implementation, Feather provides the `FeatherPlugin` class, which you can extend to create your plugin.

```lua
local FeatherPlugin = require("feather.plugins.base")

local MyPlugin = Class({
  __includes = FeatherPlugin,
})

function MyPlugin:init(config)
  -- config.options contains the options passed to createPlugin
  -- config.logger and config.observer are always available
end

function MyPlugin:update(dt, feather)
  -- Called every frame (error-isolated via pcall)
end

function MyPlugin:onerror(msg, feather)
  -- Called when a game error occurs
end

function MyPlugin:handleRequest(request, feather)
  -- Return data to push to desktop each cycle
  return {
    type = "gallery", -- content type: "gallery", etc.
    data = { ... },
    loading = false,
  }
end

function MyPlugin:handleActionRequest(request, feather)
  local action = request.params.action
  -- Handle the action, return (data, err) tuple
  return "success"
end

function MyPlugin:handleActionCancel(request, feather)
  -- Cancel an in-flight action (e.g. stop GIF recording)
end

function MyPlugin:handleParamsUpdate(request, feather)
  -- Handle parameter changes from desktop UI
  return {}
end

function MyPlugin:isSupported(version)
  return version > 0
end

function MyPlugin:finish(feather)
  -- Clean up resources
end

function MyPlugin:getConfig()
  return {
    type = "my-plugin",
    color = "#ff0000",
    icon = "puzzle",           -- Lucide icon name
    tabName = "My Plugin",     -- Display name in sidebar
    actions = {
      { label = "Do Thing", key = "do-thing", icon = "play", type = "button" },
      { label = "Count", key = "count", icon = "hash", type = "input", value = 10, props = { type = "number", min = 1, max = 100 } },
      { label = "Enabled", key = "enabled", icon = "toggle-left", type = "checkbox", value = true },
    },
  }
end

return MyPlugin
```

### Plugin lifecycle

The FeatherPluginManager handles the lifecycle of each plugin. Each plugin's `update()` is wrapped in `pcall` for error isolation — if a plugin crashes, it won't affect the game or other plugins. After 10 consecutive errors, a plugin is automatically disabled. Use `pluginManager:enablePlugin(id)` to re-enable it.

#### Initialization

- `init(config)`: Called when the plugin is initialized. `config.options` contains the options passed to `createPlugin`, and `config.logger` / `config.observer` are always available.
- `getConfig()`: Returns the plugin configuration (type, icon, tab name, actions). Sent to the desktop app on connect.

#### Data Push (every cycle)

- `handleRequest(request, feather)`: Called on each push cycle at the configured `sampleRate`. Return data to be sent to the desktop, or `nil` to skip. The return value should include `type` (content type), `data`, and optionally `loading` and `persist`.

#### Action Handling (from desktop UI)

- `handleActionRequest(request, feather)`: Called when a button action is triggered from the desktop. `request.params.action` contains the action key. Returns a `(data, err)` tuple — errors are sent back to the desktop as toast notifications.
- `handleActionCancel(request, feather)`: Called when the user cancels an in-flight action from the desktop (e.g. stopping a GIF recording mid-way).
- `handleParamsUpdate(request, feather)`: Called when the user changes an input or checkbox value in the desktop UI. `request.params` contains the updated key-value pairs.

#### Update

- `update(dt, feather)`: Called every frame, error-isolated via `pcall`. Use for ongoing work like batch encoding, timers, or frame capture.

#### Error Handling

- `onerror(msg, feather)`: Called when a game-level error occurs (not plugin errors). Use to capture state or clean up.

#### Finish

- `finish(feather)`: Called when the game disconnects or shuts down.

## Registering a plugin

To register a plugin, you need to create an instance of it and pass it to the FeatherPluginManager. The FeatherPluginManager will handle the lifecycle of the plugin and call the appropriate functions.

```lua
local MyPlugin = require("my-plugin")

local plugin = FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", {
  -- Plugin options
})
```

## Plugin options

The plugin options are passed to the plugin's constructor. Here's an example of a plugin with options:

```lua
local MyPlugin = require("my-plugin")

local plugin = FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", {
  option1 = "value1",
  option2 = "value2",
})
```

### Feather Options

By default, every plugin has the following properties available:

- `self.logger`: A logger that logs messages to the Feather logger.
- `self.observer`: A logger that logs messages to the Feather observer.

## Plugin configuration

Plugins return configuration via `getConfig()` that drives the desktop UI. This uses a **server-driven UI** pattern — the Lua side declares what controls are needed, and the desktop renders them as native components.

### Config fields

| Field     | Type     | Description                                                |
| --------- | -------- | ---------------------------------------------------------- |
| `type`    | `string` | Unique plugin type identifier.                             |
| `color`   | `string` | Hex color for the plugin's sidebar icon.                   |
| `icon`    | `string` | [Lucide](https://lucide.dev/icons) icon name.              |
| `tabName` | `string` | Display name shown in the sidebar navigation.              |
| `actions` | `table`  | Array of action definitions (buttons, inputs, checkboxes). |

### Action types

Actions define the interactive controls rendered in the plugin page header:

```lua
actions = {
  -- Button: triggers handleActionRequest with params.action = "screenshot"
  { label = "Capture", key = "screenshot", icon = "camera", type = "button" },

  -- Input: sends value via handleParamsUpdate when changed
  { label = "FPS", key = "fps", icon = "gauge", type = "input", value = 30,
    props = { type = "number", min = 5, max = 60 } },

  -- Checkbox: sends "true"/"false" via handleParamsUpdate when toggled
  { label = "Persist", key = "persist", icon = "save", type = "checkbox", value = true },
}
```

- **`type = "button"`** — Clicking sends `cmd:plugin:action` with the action `key`. The plugin's `handleActionRequest` receives it in `request.params.action`.
- **`type = "input"`** — Value changes send `cmd:plugin:params`. The plugin's `handleParamsUpdate` receives the key-value pair.
- **`type = "checkbox"`** — Toggle sends `cmd:plugin:params` with `"true"` or `"false"` as the value.

## Using Plugin Actions

Plugins can be triggered from game code at runtime using `debugger:action()`:

```lua
local debugger = FeatherDebugger({
  debug = true,
  plugins = {
    FeatherPluginManager.createPlugin(ScreenshotPlugin, "screenshots", {
      screenshotDirectory = "screenshots",
      fps = 30,
      gifDuration = 5,
    }),
  },
})

function love.keypressed(key)
  if key == "f1" then
    debugger:action("screenshots", "screenshot", {})
  elseif key == "f2" then
    debugger:action("screenshots", "gif", { duration = 3, fps = 30 })
  end
end
```

Actions can also be triggered from the desktop UI — button actions in `getConfig()` send `cmd:plugin:action` messages over WebSocket, and the response (success/error) is shown as a toast notification in the desktop app.

## Plugin examples

Here are some examples of Feather plugins:

- [Hump's Signal Plugin](../src-lua/plugins/hump/signal/README.md)
- [Lua State Machine Plugin](../src-lua/plugins/lua-state-machine/README.md)
- [Screenshot Plugin](../src-lua/plugins/screenshots/README.md)

## Plugin documentation

Each plugin should have a README file that explains how to use it and provides examples.
