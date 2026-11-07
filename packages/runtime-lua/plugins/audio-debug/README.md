# Audio Debug Plugin

`love.audio` is a black box — this plugin makes it transparent. It automatically tracks all audio sources, shows their playback state, and surfaces the global audio configuration so you can instantly diagnose "why isn't my sound playing?"

## Features

- **Auto-tracks sources** — hooks `love.audio.newSource` to capture every source automatically
- **Source table** — live view of all tracked sources with status, volume, pitch, looping, channels, position, and duration
- **Global stats** — active source count, listener position, distance model, doppler scale
- **Effects info** — whether effects are supported, max scene/source effects
- **Master volume control** — adjust master volume from the desktop
- **Stop/Pause all** — bulk audio controls

## Installation

The plugin is included with Feather. If using `auto.lua`, it's registered automatically.

### With auto.lua (zero-config)

```lua
require("feather.auto")
```

### Manual registration

```lua
local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local AudioDebugPlugin = require("plugins.audio-debug")

local debugger = FeatherDebugger({
  plugins = {
    FeatherPluginManager.createPlugin(AudioDebugPlugin, "audio-debug", {}),
  },
})
```

## Configuration

| Option        | Type      | Default | Description                                         |
| ------------- | --------- | ------- | --------------------------------------------------- |
| `autoHook`    | `boolean` | `true`  | Automatically hook `love.audio.newSource` to track sources. |
| `showStopped` | `boolean` | `true`  | Show stopped/finished sources in the table.         |

## How it works

### Source tracking

On initialization, the plugin hooks `love.audio.newSource` to intercept every source creation. Each source is stored with a label (the filename or argument passed to `newSource`) and a creation timestamp. Released/destroyed sources are automatically pruned from the list.

You can also manually register sources:

```lua
local source = love.audio.newSource("music.ogg", "stream")  -- auto-tracked via hook
-- or manually:
audioDebugPlugin:addSource(source, "Background Music")
```

### Desktop UI

The plugin page shows:

**Toolbar:**
- **Stop All** — calls `love.audio.stop()` to stop all playing sources
- **Pause All** — calls `love.audio.pause()` to pause all playing sources
- **Show Stopped** — toggle whether stopped sources appear in the table

**Cards:**
- **Listener** — current listener position (x, y, z)
- **Stats** — active source count, tracked source count, distance model, doppler scale
- **Settings** — editable master volume (0–1)
- **Effects** — whether audio effects are supported, max scene/source effects

**Table columns:**

| Column   | Description                                      |
| -------- | ------------------------------------------------ |
| Name     | Filename or label of the source                  |
| Status   | `playing` or `stopped`                           |
| Type     | `static`, `stream`, or `queue`                   |
| Vol      | Source volume (0–1)                               |
| Pitch    | Source pitch (1.0 = normal)                       |
| Loop     | Whether the source loops                          |
| Ch       | `mono` or `stereo` (positional audio needs mono) |
| Pos      | Current playback position in seconds              |
| Dur      | Total duration (or `?` if unknown)                |

## Common debugging scenarios

### "Why isn't my sound playing?"

Check the table for your source:
- **Not in the list?** — The source may not have been created yet, or was garbage collected
- **Status: stopped** — The source finished playing or was never started. Check if `looping` is off
- **Volume: 0.00** — The source volume is zero
- **Master Volume: 0.00** — Check the Settings card; global volume is muted
- **Ch: stereo** — Positional audio only works with mono sources. If using `setPosition`, switch to mono

### "I'm hitting the source limit"

LÖVE supports up to 64 simultaneous playing sources (platform-dependent). Check the **Active Sources** stat — if it's near 64, you're running out. Stop unused sources or use `source:clone()` to reuse static sources.

### "My positional audio isn't working"

- Check the **Listener** card for position — is it at `0, 0, 0`?
- Check the **Distance Model** — `none` disables distance attenuation
- Ensure the source is **mono** (Ch column). Stereo sources ignore positional effects
