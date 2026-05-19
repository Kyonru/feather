# Plugin UI

Lua plugins can describe UI declaratively with `feather.ui`, and Feather renders that UI in the desktop app.

The important boundary is:

```txt
Lua plugin -> Feather UI tree -> Feather protocol -> React renderer
```

Plugins do not import React, call JavaScript, or manipulate desktop components directly. They return stable, serializable UI nodes. Feather owns the rendering, layout, events, and future compatibility.

## Why declarative UI?

Declarative plugin UI keeps plugins portable and safe:

- Plugins stay Lua-only.
- React remains an implementation detail.
- UI trees can be versioned by the Feather protocol.
- Plugin crashes stay isolated from the desktop renderer.
- The same UI description can later be rendered in other clients.

## Basic Example

Return `feather.ui.render()` from `handleRequest()`.

```lua
function MyPlugin:handleRequest(request, feather)
  local ui = feather.ui

  return ui.render(ui.panel({
    title = "Player Stats",

    ui.row({
      ui.badge({ value = "HP" }),
      ui.text({ value = tostring(player.health) }),
    }),

    ui.button({
      label = "Kill Player",
      action = "kill-player",
    }),
  }))
end
```

Buttons send their `action` key through the existing plugin action path:

```lua
function MyPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "kill-player" then
    player.health = 0
    return true
  end
end
```

You can also use `onClick = "kill-player"` as an alias for `action = "kill-player"`. Function callbacks are intentionally ignored because plugin UI must be serializable.

## Node Shape

Every UI primitive becomes a table like this:

```lua
{
  type = "panel",
  title = "Player Stats",
  children = {
    { type = "text", value = "HP: 100" },
  },
}
```

You usually do not write this shape by hand. Use the helpers:

```lua
local ui = feather.ui

ui.panel({
  title = "Tools",
  ui.button({ label = "Reset", action = "reset" }),
})
```

Numeric array entries become `children`. Named properties become fields on the node.

## Supported Nodes

| Node        | Purpose                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `panel`     | Framed section with an optional title.                                   |
| `row`       | Horizontal layout with wrapping.                                         |
| `column`    | Vertical layout.                                                         |
| `tabs`      | Tab container. Children should usually be `tab` nodes.                   |
| `tab`       | Tab panel with `id`, `title`, and children.                              |
| `text`      | Small text block. Uses `value` or `label`.                               |
| `badge`     | Compact status label. Uses `value` or `label`.                           |
| `button`    | Action button. Uses `label` and `action`.                                |
| `input`     | Single-line text input. Uses `name`, `value`, and `placeholder`.         |
| `textarea`  | Multi-line text input. Uses `name`, `value`, and `placeholder`.          |
| `checkbox`  | Boolean field. Uses `name`, `checked`, `label`, and `description`.       |
| `switch`    | Boolean toggle. Uses `name`, `checked`, `label`, and `description`.      |
| `select`    | Select menu. Uses `name`, `value`, `options`, and `placeholder`.         |
| `stat`      | Large metric display. Uses `label`, `value`, and optional `description`. |
| `progress`  | Progress bar. Uses `value`, `min`, `max`, and optional `label`.          |
| `alert`     | Inline message. Uses `title`, `value`, `variant`, and children.          |
| `list`      | Bulleted list of child nodes.                                            |
| `link`      | External link. Uses `href` and `label`.                                  |
| `separator` | Horizontal divider.                                                      |
| `image`     | Image preview. Uses `src` and optional `alt`.                            |
| `code`      | Monospace code block. Uses `value`.                                      |
| `table`     | Data table. Uses `columns` and `data`.                                   |
| `timeline`  | Timeline view. Uses `items` and optional `categories`.                   |
| `inspector` | Tree inspector. Uses `nodes`.                                            |

## Common Properties

| Property             | Used By                        | Description                                                                 |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `id`                 | `tab`, any node                | Stable identity for tabs and renderer keys.                                 |
| `name`               | form nodes                     | Parameter key sent to `handleParamsUpdate()`.                               |
| `title`              | `panel`, `tab`, `image`        | Display title.                                                              |
| `label`              | `button`, `text`, `badge`      | Display text.                                                               |
| `value`              | `text`, `badge`, `code`        | Scalar display value.                                                       |
| `description`        | form nodes, `stat`, `progress` | Supporting text.                                                            |
| `placeholder`        | `input`, `textarea`, `select`  | Empty-state prompt.                                                         |
| `checked`            | `checkbox`, `switch`           | Boolean checked state.                                                      |
| `disabled`           | controls                       | Disables interaction.                                                       |
| `min`, `max`, `step` | `progress`, numeric controls   | Numeric range metadata.                                                     |
| `action`             | `button`                       | Action key sent to `handleActionRequest()`.                                 |
| `variant`            | `button`, `badge`              | Visual variant such as `default`, `secondary`, `outline`, or `destructive`. |
| `src`                | `image`                        | Image URL, data URL, blob URL, or resolved binary placeholder.              |
| `href`               | `link`                         | External URL.                                                               |
| `options`            | `select`                       | Array of `{ label, value }` options.                                        |
| `children`           | layout nodes                   | Child UI nodes. Usually supplied as numeric entries.                        |

## Forms

Form-like nodes send parameter updates through `handleParamsUpdate()`. Use `name` for the parameter key. If `name` is omitted, Feather falls back to `id` and then `action`.

```lua
function MyPlugin:handleRequest(request, feather)
  local ui = feather.ui

  return ui.render(ui.panel({
    title = "Settings",

    ui.input({
      name = "filter",
      label = "Filter",
      value = self.filter,
      placeholder = "player, enemy, projectile",
    }),

    ui.switch({
      name = "enabled",
      label = "Enabled",
      checked = self.enabled,
      description = "Pause expensive sampling when disabled.",
    }),

    ui.select({
      name = "sampleRate",
      label = "Sample rate",
      value = tostring(self.sampleRate),
      options = {
        { label = "Slow", value = "0.5" },
        { label = "Normal", value = "1" },
        { label = "Fast", value = "2" },
      },
    }),
  }))
end

function MyPlugin:handleParamsUpdate(request)
  local params = request.params or {}

  if params.filter then
    self.filter = params.filter
  end
  if params.enabled then
    self.enabled = params.enabled == "true"
  end
  if params.sampleRate then
    self.sampleRate = tonumber(params.sampleRate) or self.sampleRate
  end
end
```

## Metrics

Use `stat` and `progress` for dashboard-style summaries:

```lua
ui.row({
  ui.stat({
    label = "Memory",
    value = string.format("%.1f MB", collectgarbage("count") / 1024),
    description = "Lua heap",
  }),
  ui.progress({
    label = "Load",
    value = 42,
    min = 0,
    max = 100,
  }),
})
```

## Tables

Tables use the same shape as normal plugin table content:

```lua
ui.table({
  columns = {
    { key = "name", label = "Name" },
    { key = "value", label = "Value" },
  },
  data = {
    { name = "FPS", value = tostring(love.timer.getFPS()) },
    { name = "Memory", value = string.format("%.1f KB", collectgarbage("count")) },
  },
})
```

## Tabs

Use stable `id` values for tabs so the desktop can preserve intent as the UI refreshes.

```lua
ui.tabs({
  ui.tab({
    id = "overview",
    title = "Overview",
    ui.text({ value = "Runtime summary" }),
  }),
  ui.tab({
    id = "details",
    title = "Details",
    ui.code({ value = "return true" }),
  }),
})
```

## Images And Binary Data

For small previews, `image.src` can be a data URL:

```lua
ui.image({
  src = "data:image/png;base64,...",
  alt = "Preview",
})
```

For large images, screenshots, dumps, or replay chunks, use the hybrid binary protocol:

```lua
local preview = feather:attachBinary("image/png", pngBytes)

return feather.ui.render(feather.ui.image({
  src = preview.src,
  binary = preview.binary,
  alt = "Preview",
}))
```

The desktop resolves `feather-binary:<id>` placeholders into local blob URLs automatically.

## Complete Example

This is a compact dashboard-style plugin:

```lua
local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

local Dashboard = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.uptime = 0
    self.peakMemory = 0
  end,
})

function Dashboard:update(dt)
  self.uptime = self.uptime + dt
end

function Dashboard:handleRequest(request, feather)
  local ui = feather.ui
  local fps = love.timer.getFPS()
  local memory = collectgarbage("count")

  if memory > self.peakMemory then
    self.peakMemory = memory
  end

  return ui.render(ui.panel({
    title = "Runtime Dashboard",

    ui.row({
      ui.badge({ value = "FPS " .. tostring(fps) }),
      ui.badge({ value = string.format("%.1f KB", memory) }),
      ui.badge({ value = feather.wsConnected and "connected" or "offline" }),
    }),

    ui.row({
      ui.button({ label = "Collect garbage", action = "collect-garbage" }),
      ui.button({ label = "Reset peak", action = "reset-peak" }),
    }),

    ui.table({
      columns = {
        { key = "metric", label = "Metric" },
        { key = "value", label = "Value" },
      },
      data = {
        { metric = "Uptime", value = string.format("%.1fs", self.uptime) },
        { metric = "Peak memory", value = string.format("%.1f KB", self.peakMemory) },
      },
    }),
  }))
end

function Dashboard:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "collect-garbage" then
    collectgarbage("collect")
    return true
  end

  if action == "reset-peak" then
    self.peakMemory = collectgarbage("count")
    return true
  end
end

function Dashboard:getConfig()
  return {
    type = "dashboard",
    icon = "activity",
    tabName = "Dashboard",
    actions = {},
  }
end

return Dashboard
```

See the built-in Runtime Snapshot plugin for a fuller example: [`runtime-snapshot`](https://github.com/Kyonru/feather/tree/main/src-lua/plugins/runtime-snapshot).

## Guidelines

- Prefer stable `id` values for tabs and repeated nodes.
- Keep action names small and explicit, such as `reset`, `pause`, or `export-state`.
- Send data, not behavior. Lua functions are not serialized into the UI tree.
- Use `table`, `timeline`, and `inspector` nodes for larger structured data instead of manually building huge text blocks.
- Use binary attachments for large payloads instead of base64 JSON.
- Avoid resending enormous UI trees every frame. Keep high-frequency data compact.
