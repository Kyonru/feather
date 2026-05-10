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
local FeatherPlugin = require(FEATHER_PATH .. ".core.base")

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

### manifest.lua

Every plugin that should be auto-discovered by `feather.auto` needs a `manifest.lua` at the root of its directory. Without it the directory is silently skipped.

```lua
-- plugins/my-plugin/manifest.lua
return {
  id          = "my-plugin",          -- must match the directory name and createPlugin id
  name        = "My Plugin",          -- display name (for tooling / future UI)
  description = "What this plugin does",
  version     = "1.0.0",
  capabilities = { "filesystem" },     -- tokens this plugin requires (see Capabilities)
  opts        = { speed = 1.0 },      -- default options merged with user pluginOptions
  optIn       = false,                -- true = not registered unless in config.include
  disabled    = true,                 -- true = registered but inactive by default
}
```

| Field          | Type       | Description                                                                                                                               |
| -------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `string`   | Unique plugin identifier. Must match the directory name and the `id` passed to `createPlugin`.                                            |
| `name`         | `string`   | Human-readable display name.                                                                                                              |
| `description`  | `string`   | Short description shown in tooling.                                                                                                       |
| `version`      | `string`   | Semver string.                                                                                                                            |
| `capabilities` | `string[]` | Capability tokens this plugin needs (e.g. `"filesystem"`, `"network"`). Checked against the user's `config.capabilities` at load time.    |
| `opts`         | `table`    | Default plugin options. Merged with (and overridden by) the user's `config.pluginOptions[id]`.                                            |
| `optIn`        | `boolean`  | If `true`, the plugin is not registered at all unless its ID appears in `config.include`.                                                 |
| `disabled`     | `boolean`  | If `true`, the plugin registers and appears in the UI but starts inactive. Users can enable it from the desktop, or via `config.include`. |

### Love-event hooks

Instead of patching `love.*` callbacks inside `init()`, override the corresponding `on*` method. `FeatherPluginManager` patches each love callback once and dispatches to all enabled plugins — this prevents conflicts when multiple plugins hook the same callback.

```lua
function MyPlugin:onDraw()
  -- Runs after love.draw(); use love.graphics here
end

function MyPlugin:onKeypressed(key, scancode, isrepeat)
  if key == "f5" then self:doSomething() end
end

function MyPlugin:onKeyreleased(key, scancode) end
function MyPlugin:onMousepressed(x, y, button, istouch, presses) end
function MyPlugin:onMousereleased(x, y, button, istouch, presses) end
function MyPlugin:onTouchpressed(id, x, y, dx, dy, pressure) end
function MyPlugin:onTouchreleased(id, x, y, dx, dy, pressure) end
function MyPlugin:onJoystickpressed(joystick, button) end
function MyPlugin:onJoystickreleased(joystick, button) end
```

Only override the methods you need — unused ones default to no-ops in the base class.

> [!NOTE]
> `input-replay` keeps its own hook system because it simulates love events during replay. Routing those through the central dispatcher would cause recursion.

### Capabilities

Declare the system access your plugin needs in `manifest.lua`. At load time, `FeatherPluginManager` checks these against the user's `config.capabilities` allowlist and logs a warning for any undeclared capability. Loading is not blocked — warnings are informational.

Available capability tokens:

| Token          | Meaning                                      |
| -------------- | -------------------------------------------- |
| `"filesystem"` | Reads or writes via `love.filesystem`        |
| `"network"`    | Uses LuaSocket / HTTP                        |
| `"audio"`      | Accesses `love.audio`                        |
| `"physics"`    | Accesses `love.physics`                      |
| `"input"`      | Hooks input callbacks (`onKeypressed`, etc.) |
| `"draw"`       | Hooks `onDraw` to render overlays            |

Users can restrict which capabilities are allowed:

```lua
require("feather.auto").setup({
  -- Only allow filesystem and draw; plugins requesting anything else get a warning
  capabilities = { "filesystem", "draw" },
})
```

Pass `"all"` (the default) to skip capability checking entirely.

### API Compatibility

Feather has a plugin UI/protocol API number. Plugins can declare which desktop API versions they support in `manifest.lua`; the runtime forwards that metadata to the desktop and disables incompatible plugins instead of letting them fail later.

The current Lua runtime exposes the number as `require("feather").API`.

```lua
-- plugins/my-plugin/manifest.lua
return {
  id = "my-plugin",
  name = "My Plugin",
  version = "1.0.0",

  -- Exact API
  api = 5,

  -- Or a range
  -- minApi = 5,
  -- maxApi = 6,
}
```

For manually registered plugins, pass the same metadata through `createPlugin`:

```lua
local plugin = FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", {}, false, {}, {
  minApi = 5,
  maxApi = 6,
  name = "My Plugin",
  version = "1.0.0",
})
```

> [!IMPORTANT]
> Declare an API range when your plugin depends on specific Feather UI nodes, binary attachments, action semantics, or table/gallery formats. Incompatible plugins are shown in the desktop app with an API mismatch message and cannot be enabled.

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
| `ui`       | Declarative Feather UI tree rendered by the desktop.                           |
| `gallery`  | Image grid with download buttons. Supports PNG screenshots and GIF animations. |
| `table`    | Data table with sortable columns.                                              |
| `tree`     | Collapsible tree view with properties on each node.                            |
| `timeline` | Chronological event timeline with categories and optional screenshots.         |

#### `ui`

Lua plugins can describe UI declaratively with `feather.ui` primitives. React is only the renderer; plugins should send stable Feather UI nodes and action keys, not raw React components or JavaScript.

For the full schema, supported nodes, and complete examples, see [Plugin UI](plugin-ui.md).

```lua
function MyPlugin:handleRequest(request, feather)
  return feather.ui.render(
    feather.ui.panel({
      title = "Player Stats",

      feather.ui.row({
        feather.ui.badge({ value = "HP" }),
        feather.ui.text({ value = tostring(player.health) }),
      }),

      feather.ui.button({
        label = "Kill Player",
        action = "kill-player",
      }),
    })
  )
end

function MyPlugin:handleActionRequest(request)
  if request.params.action == "kill-player" then
    player.health = 0
  end
end
```

Supported node types in the first schema pass: `panel`, `row`, `column`, `tabs`, `tab`, `text`, `button`, `input`, `textarea`, `checkbox`, `switch`, `select`, `badge`, `stat`, `progress`, `alert`, `list`, `link`, `separator`, `image`, `code`, `table`, `timeline`, and `inspector`.

Buttons use `action = "some-key"` (or `onClick = "some-key"`) and are routed through the existing `handleActionRequest()` path. Function callbacks are intentionally not serialized.

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

For large images or binary payloads, prefer Feather's hybrid protocol instead of embedding base64 in JSON. Call `feather:attachBinary(mime, bytes)` and place the returned `src` and `binary` fields in your normal plugin data. Feather sends the JSON first, then streams the bytes on a binary WebSocket frame; the desktop swaps `feather-binary:<id>` into a local blob URL automatically.

```lua
function MyPlugin:handleRequest(request, feather)
  local pngBytes = self:getLatestPreviewPng()
  local preview = feather:attachBinary("image/png", pngBytes)

  return {
    type = "gallery",
    data = {
      {
        type = "image",
        name = "preview.png",
        downloadable = true,
        metadata = {
          type = "png",
          src = preview.src,
          binary = preview.binary,
          width = 800,
          height = 600,
        },
      },
    },
    loading = false,
  }
end
```

For GIF-style frame lists, put the placeholder URLs in `src` and the matching binary refs in `binary` using the same order:

```lua
metadata = {
  type = "gif",
  src = { frame1.src, frame2.src },
  binary = { frame1.binary, frame2.binary },
  width = 800,
  height = 600,
  fps = 30,
}
```

The same works in table rows. The desktop resolves `src` to a blob URL and renders it as a download/open control when that column is visible; the `binary` field can stay hidden metadata if you do not add a matching column.

```lua
function MyPlugin:handleRequest(request, feather)
  local file = feather:attachBinary("application/octet-stream", bytes)

  return {
    type = "table",
    columns = {
      { key = "name", label = "Name" },
      { key = "size", label = "Size" },
      { key = "src", label = "File" },
    },
    data = {
      { name = "dump.bin", size = tostring(#bytes), src = file.src, binary = file.binary },
    },
    loading = false,
  }
end
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

## Adding plugins to `feather.auto`

`feather.auto` registers all built-in plugins for you. You can extend it with your own plugins through the `plugins` key in `setup()`, without giving up the zero-config defaults.

### Append a custom plugin

Pass additional plugins via `config.plugins`. They are appended after all built-in plugins:

```lua
local FeatherPluginManager = require("feather.plugin_manager")
local MyPlugin = require("my-plugin")

require("feather.auto").setup({
  plugins = {
    FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", {
      option1 = "value1",
    }),
  },
})
```

`DEBUGGER` is created as usual, and your plugin appears in the sidebar alongside the built-in ones.

### Start a custom plugin disabled

Pass `true` as the fourth argument to `createPlugin`. The plugin is registered and visible in the desktop UI, but starts inactive — users can enable it from the desktop without restarting.

```lua
FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", { option1 = "value1" }, true)
```

### Force-enable a built-in plugin

Built-in plugins that are `optIn` (like `console`) or start `disabled` are not active by default. Add their IDs to `config.include` to force-enable them:

```lua
require("feather.auto").setup({
  include = { "console", "physics-debug" },
})
```

`include` both registers `optIn` plugins (which would otherwise be skipped entirely) and activates `disabled` ones.

### Exclude a built-in plugin

Remove a built-in plugin entirely with `config.exclude`. It won't be registered at all:

```lua
require("feather.auto").setup({
  exclude = { "network-inspector", "memory-snapshot" },
})
```

### Override built-in plugin options

Pass per-plugin option overrides via `config.pluginOptions`, keyed by plugin ID. Options are merged over the built-in defaults:

```lua
require("feather.auto").setup({
  pluginOptions = {
    screenshots = { fps = 60, gifDuration = 10 },
    ["memory-snapshot"] = { autoInterval = 5 },
  },
})
```

### Full example

```lua
local FeatherPluginManager = require("feather.plugin_manager")
local MyPlugin = require("my-plugin")
local AnotherPlugin = require("another-plugin")

require("feather.auto").setup({
  sessionName = "My Game",
  -- Force-enable built-in opt-in plugins
  include = { "console" },
  -- Remove plugins you don't need
  exclude = { "hump.signal", "lua-state-machine" },
  -- Override options for specific built-in plugins
  pluginOptions = {
    screenshots = { fps = 60 },
  },
  -- Append your own plugins
  plugins = {
    FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", { debug = true }),
    FeatherPluginManager.createPlugin(AnotherPlugin, "another-plugin", {}, true), -- starts disabled
  },
})
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
