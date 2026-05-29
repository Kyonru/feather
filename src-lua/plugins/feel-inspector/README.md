# Feel Inspector Plugin

Inspect [feel.lua](https://github.com/Kyonru/feel.lua) sequences, active runners, target values, emitted events, and `feel.love` adapter state from Feather.

V1 is a runtime inspector. It does not edit sequence source or generate Lua code. Games explicitly attach the `feel` module and any LOVE adapter instances they want Feather to inspect.

## Setup

Install feel.lua with Feather:

```sh
feather package install feel
```

Enable the plugin:

```lua
require("feather.auto").setup({
  include = { "feel-inspector" },
})
```

Attach your feel module:

```lua
local feel = require("lib.feel")

local plugin = DEBUGGER.pluginManager:getPlugin("feel-inspector")
if plugin then
  plugin.instance:attachFeel("main", feel)
end
```

Attach a LOVE adapter and replay targets when you use them:

```lua
local feelLove = require("lib.feel.love")
local feelFx = feelLove.new()
local button = feel.target({ values = { scale = 1, y = 0 } })

local plugin = DEBUGGER.pluginManager:getPlugin("feel-inspector")
if plugin then
  plugin.instance:attachFeel("main", feel)
  plugin.instance:attachAdapter("love", function()
    return feelFx
  end)
  plugin.instance:addTarget("button", function()
    return button
  end)
end
```

## What Feather Shows

- **Overview**: attached modules/adapters, sequence count, active context count, registered targets, and event history size.
- **Sequences**: named sequences defined after `attachFeel(...)`, step counts, and replay buttons for registered targets.
- **Active**: active `feel.play(...)` contexts, trigger, target, runner status, current step kind, and runner index.
- **Targets**: registered target labels and live `target.values`.
- **Events**: recent emit, audio, and log callbacks captured while preserving the game's original handlers.
- **LOVE Adapter**: camera, shake, flash, fade, registered sounds, particles, shaders, and post-processing effect values.

## API

### `attachFeel(label, feelModule)`

Wraps `define`, `play`, `update`, and `clear` on the provided module so Feather can observe new definitions and active runs. Definitions created before attaching are not discoverable unless they are defined again or later played by name.

### `attachAdapter(label, adapterOrGetter)`

Registers a `feel.love` adapter or getter function. Getter functions are preferred when the adapter can be recreated.

### `addTarget(label, targetOrGetter)`

Registers a target for display and sequence replay actions.

## Actions

- **Replay sequence**: plays a named sequence against a registered target with `restart = true`.
- **Clear target**: calls `feel.clear(target)` for each attached module.
- **Clear all feel state**: calls `feel.clear()` for each attached module.
- **Clear events**: clears Feather's bounded event history only.

## Notes

This plugin does not require filesystem, draw, input, audio, or network capabilities. It only observes objects that the game explicitly registers and invokes explicit user-triggered feel actions.
