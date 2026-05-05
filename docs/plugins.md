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
local FeatherPlugin = require(FEATHER_PATH .. ".plugins.base")

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

| Field     | Type     | Description                                                      |
| --------- | -------- | ---------------------------------------------------------------- |
| `type`    | `string` | Unique plugin type identifier.                                   |
| `color`   | `string` | Hex color for the plugin's sidebar icon.                         |
| `icon`    | `string` | [Lucide](https://lucide.dev/icons) icon name.                    |
| `tabName` | `string` | Display name shown in the sidebar navigation.                    |
| `actions` | `table`  | Array of action definitions (see [Action types](#action-types)). |

### Action types

Actions define the interactive controls rendered in the plugin page. Each action requires `label`, `key`, `icon`, and `type`. Some types support an optional `value` (default/initial value) and `props` (extra configuration).

| Field   | Type     | Required | Description                                                                   |
| ------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `label` | `string` | Yes      | Display text for the control.                                                 |
| `key`   | `string` | Yes      | Unique identifier. Sent as the action/param key.                              |
| `icon`  | `string` | Yes      | [Lucide](https://lucide.dev/icons) icon name.                                 |
| `type`  | `string` | Yes      | One of: `button`, `input`, `checkbox`, `select`, `vector`, `file`.            |
| `value` | `any`    | No       | Default value (string, number, or boolean).                                   |
| `props` | `table`  | No       | Extra configuration — varies by type (see below).                             |
| `group` | `string` | No       | Group name for card layout (see [Grouped card layout](#grouped-card-layout)). |

#### `type = "button"`

Renders a button. Clicking sends `cmd:plugin:action` with `params.action` set to the action `key`. The plugin's `handleActionRequest` receives it.

```lua
{ label = "Capture", key = "screenshot", icon = "camera", type = "button" }
```

#### `type = "input"`

Renders a text input field. Value changes send `cmd:plugin:params`. The plugin's `handleParamsUpdate` receives the key-value pair.

```lua
{ label = "FPS", key = "fps", icon = "gauge", type = "input", value = 30,
  props = { type = "number", min = 5, max = 60, step = 1 } }
```

**Supported `props`:**

| Prop          | Type      | Description                                                                                |
| ------------- | --------- | ------------------------------------------------------------------------------------------ |
| `type`        | `string`  | HTML input type (`"number"`, `"text"`, etc.). Use `"number"` to restrict to numeric entry. |
| `min`         | `number`  | Minimum value (for `type = "number"`).                                                     |
| `max`         | `number`  | Maximum value (for `type = "number"`).                                                     |
| `step`        | `number`  | Step increment (for `type = "number"`).                                                    |
| `placeholder` | `string`  | Placeholder text.                                                                          |
| `disabled`    | `boolean` | Disable the input.                                                                         |
| `readOnly`    | `boolean` | Make the input read-only.                                                                  |

#### `type = "checkbox"`

Renders a checkbox. Toggle sends `cmd:plugin:params` with `"true"` or `"false"` as the value.

```lua
{ label = "Persist", key = "persist", icon = "save", type = "checkbox", value = true }
```

#### `type = "select"`

Renders a dropdown select menu. Value changes send `cmd:plugin:params`.

```lua
{ label = "Mode", key = "mode", icon = "settings", type = "select", value = "normal",
  props = { options = { "normal", "additive", "multiply" } } }
```

**Supported `props`:**

| Prop      | Type    | Description                            |
| --------- | ------- | -------------------------------------- |
| `options` | `table` | Array of string values to choose from. |

#### `type = "vector"`

Renders a multi-field input for comma-separated values (e.g. coordinates, colors). Each value gets its own labeled input field. Value changes send the joined comma-separated string via `cmd:plugin:params`.

```lua
-- 3 labeled fields: Start, Mid, End
{ label = "Sizes", key = "sizes", icon = "ruler", type = "vector",
  value = "1.0, 0.5, 0.0",
  props = { labels = { "Start", "Mid", "End" }, type = "number", min = 0, max = 10, step = 0.01 } }

-- Repeating labels cycle through the array (e.g. RGBA groups)
{ label = "Colors", key = "colors", icon = "palette", type = "vector",
  value = "1, 0.5, 0, 1, 0, 0.2, 0.8, 0",
  props = { labels = { "R", "G", "B", "A" }, repeating = true, type = "number", min = 0, max = 1, step = 0.01 } }
```

**Supported `props`:**

| Prop        | Type      | Description                                                                                                     |
| ----------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `labels`    | `table`   | Array of labels for each field (e.g. `{"X", "Y"}`, `{"R", "G", "B", "A"}`).                                     |
| `repeating` | `boolean` | When `true`, labels cycle through the array. Groups values into rows of `#labels` size (e.g. RGBA → rows of 4). |
| `type`      | `string`  | HTML input type for each field (default: `"number"`).                                                           |
| `min`       | `number`  | Minimum value per field.                                                                                        |
| `max`       | `number`  | Maximum value per field.                                                                                        |
| `step`      | `number`  | Step increment per field.                                                                                       |

#### `type = "file"`

Renders a button that opens a native file picker dialog. The selected file's contents are sent to `handleActionRequest`.

```lua
{ label = "Import", key = "import", icon = "upload", type = "file",
  props = { filters = { { name = "Lua files", extensions = { "lua" } } } } }
```

**Supported `props`:**

| Prop      | Type    | Description                                                          |
| --------- | ------- | -------------------------------------------------------------------- |
| `filters` | `table` | Array of file filters: `{ name = "Label", extensions = { "ext" } }`. |

### Grouped card layout

By default, actions render in a horizontal toolbar at the top of the plugin page. For plugins with many controls, you can organize actions into **named groups** using the `group` field. Grouped actions render in a responsive card grid below the toolbar.

```lua
actions = {
  -- These appear in the toolbar (no group)
  { label = "Export", key = "export", icon = "download", type = "button" },
  { label = "Reset", key = "reset", icon = "rotate-ccw", type = "button" },

  -- These appear in a "Speed" card
  { label = "Min Speed", key = "speedMin", icon = "gauge", type = "input", value = 100,
    props = { type = "number", min = 0, max = 1000 }, group = "Speed" },
  { label = "Max Speed", key = "speedMax", icon = "gauge", type = "input", value = 500,
    props = { type = "number", min = 0, max = 1000 }, group = "Speed" },

  -- These appear in a "Visual" card
  { label = "Sizes", key = "sizes", icon = "ruler", type = "vector", value = "1, 0.5, 0",
    props = { labels = { "Start", "Mid", "End" }, type = "number" }, group = "Visual" },
  { label = "Colors", key = "colors", icon = "palette", type = "vector",
    value = "1, 0, 0, 1",
    props = { labels = { "R", "G", "B", "A" }, repeating = true, type = "number" }, group = "Visual" },
}
```

**Layout behavior:**

- Actions **without** `group` render in the toolbar (top row, horizontal).
- Actions **with** `group` render in a responsive card grid below the toolbar.
- Cards are ordered by the first appearance of each group name.
- The grid is responsive: 1 column on small screens, up to 4 on wide screens.
- All action types (`button`, `input`, `checkbox`, `select`, `vector`, `file`) work inside cards. Buttons and selects expand to full width within a card.

### Action response types

When a plugin's `handleActionRequest` returns data, the desktop app handles it based on the response shape:

#### Error response

Return an error string as the second value of the `(data, err)` tuple. The error is shown as a toast notification.

```lua
function MyPlugin:handleActionRequest(request, feather)
  return nil, "Something went wrong"
end
```

#### Download response

Return a `download` table to trigger a native save-file dialog on the desktop.

```lua
function MyPlugin:handleActionRequest(request, feather)
  return {
    download = {
      filename = "export.lua",   -- suggested filename
      content = "-- exported",   -- file content (string)
      extension = "lua",         -- file extension for the filter
    },
  }
end
```

#### Clipboard response

Return a `clipboard` string to copy text to the user's clipboard with a success toast.

```lua
function MyPlugin:handleActionRequest(request, feather)
  return {
    clipboard = "local ps = love.graphics.newParticleSystem(image, 100)",
  }
end
```

### Content types

The `handleRequest` method returns data that the desktop renders below the actions. The `type` field determines the layout:

| Type       | Description                                                                    |
| ---------- | ------------------------------------------------------------------------------ |
| `gallery`  | Image grid with download buttons. Supports PNG screenshots and GIF animations. |
| `table`    | Data table with sortable columns.                                              |
| `tree`     | Collapsible tree view with properties on each node.                            |
| `timeline` | Chronological event timeline with categories and optional screenshots.         |

#### `gallery`

```lua
return {
  type = "gallery",
  data = {
    { type = "image", name = "shot1", downloadable = true, metadata = { type = "png", src = base64data, width = 800, height = 600 } },
  },
  loading = false,
  persist = true,  -- merge with previous data instead of replacing
}
```

#### `table`

```lua
return {
  type = "table",
  columns = {
    { key = "name", label = "Name" },
    { key = "value", label = "Value" },
  },
  data = {
    { name = "FPS", value = "60" },
    { name = "Memory", value = "12.5 MB" },
  },
  loading = false,
}
```

#### `tree`

```lua
return {
  type = "tree",
  nodes = {
    {
      name = "Player",
      properties = { { key = "health", value = "100" }, { key = "x", value = "320" } },
      children = {
        { name = "Inventory", properties = { { key = "items", value = "5" } } },
      },
    },
  },
  sources = { "ECS", "Scene" },    -- data source names for the source selector
  selectedSource = 0,               -- currently selected source index
  searchFilter = "",                 -- current search filter text
  loading = false,
}
```

#### `timeline`

```lua
return {
  type = "timeline",
  items = {
    { id = 1, label = "Game started", category = "lifecycle", time = 0, gameTime = "0:00" },
    { id = 2, label = "Level loaded", category = "lifecycle", color = "#4ade80", time = 1.5, gameTime = "0:01" },
  },
  categories = { "lifecycle", "error" },
  loading = false,
}
```

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
- [Particle Editor Plugin](../src-lua/plugins/particle-editor/README.md)
- [Audio Debug Plugin](../src-lua/plugins/audio-debug/README.md)
- [Coroutine Monitor Plugin](../src-lua/plugins/coroutine-monitor/README.md)
- [Collision Debug Plugin](../src-lua/plugins/collision-debug/README.md)
- [Animation Inspector Plugin](../src-lua/plugins/animation-inspector/README.md)
- [Timer Inspector Plugin](../src-lua/plugins/timer-inspector/README.md)

## Plugin documentation

Each plugin should have a README file that explains how to use it and provides examples.
