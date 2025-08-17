# HumpSignalPlugin

`HumpSignalPlugin` is a [Feather](https://github.com/Kyonru/feather) plugin that
integrates with\
[HUMP Signal](https://hump.readthedocs.io/en/latest/signal.html) to
automatically log when signals are **registered, emitted, or removed**.

This makes it easier to debug event-driven code without manually
wrapping each signal call.

------------------------------------------------------------------------

## Setup

Register the plugin through `FeatherPluginManager`:

``` lua
local Signal = require("hump.signal")
local HumpSignalPlugin = require("feather.plugins.hump-signal")

local plugin = FeatherPluginManager.createPlugin(HumpSignalPlugin, "hump.signal", {
  signal = Signal,
  register = {
    "emit",
    "register",
    "remove",
    "emitPattern",
    "registerPattern",
    "removePattern",
    "clearPattern",
  },
})

-- Add the plugin to Feather on initialization
```

------------------------------------------------------------------------

## Options

| Option     | Type       | Description                                                                                       |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `signal`   | `table`    | A reference to your HUMP Signal instance.                                                         |
| `register` | `string[]` | A list of method names from the signal object to wrap with logging (`"register"`, `"emit"`, `"remove"`,`"emitPattern"`, `"registerPattern"`, `"removePattern"`, `"clearPattern"`). |

If `signal` or `register` is missing or invalid, the plugin will skip
initialization.

------------------------------------------------------------------------

## How It Works

- Each listed method is wrapped using Feather's logger.
- On call, a log entry is created with:
  - **Type**: `"Hump.Signal:<method>"`
  - **Arguments** passed into the call
- The original signal method still executes normally.

------------------------------------------------------------------------

## Example

``` lua
-- Register a listener
Signal:register("damage", function(dmg) print("Player damaged:", dmg) end)

-- Emit a signal
Signal:emit("damage", 25)
```

### Logged Output

```log
[Hump.Signal:register] damage, function: 0x6000045

[Hump.Signal:emit] damage, 25
Player damaged: 25
```

------------------------------------------------------------------------

## Notes

- Only methods listed in `register` are wrapped.
- The plugin is **non-invasive**: it does not alter HUMP Signal's
    behavior, only logs calls.
- Useful for debugging complex event systems in games.
