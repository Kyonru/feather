# ScreenshotPlugin

The `ScreenshotPlugin` is a plugin for the [Feather
Debugger](https://github.com/Kyonru/feather) that allows you to capture
**screenshots** and **GIF recordings** directly from your LOVE project and from the Feather app.
It helps with debugging rendering issues, documenting game states, and
quickly sharing visual output without leaving your development
environment.

## 📦 Installation

Place `screenshot.lua` in your `feather/plugins/` directory (or wherever
you keep your Feather plugins).
Adjust the require path as needed:

``` lua
local ScreenshotPlugin = require("feather.plugins.screenshot")
```

## ⚙️ Configuration

Register the plugin using the `FeatherPluginManager.createPlugin`
function:

``` lua
FeatherPluginManager.createPlugin(ScreenshotPlugin, "screenshots", {
  screenshotDirectory = "screenshots", -- output folder for captures
  fps = 60,                            -- frames per second for GIFs
  gifDuration = 5,                     -- default duration of GIFs in seconds
})
```

## Options

- `screenshotDirectory` (string, default `"screenshots"`)
    Directory where screenshots and GIF recordings are stored.

- `fps` (number, default `30`)
    Target frames per second for GIF captures.

- `gifDuration` (number, default `5`)
    Duration in seconds for each GIF capture.

- `persist` (boolean, default `true`)
    If `true`, keeps previously captured screenshots and GIFs in the
    gallery view between requests.
    If `false`, only the latest captures are kept.

## 🔍 How It Works

### Screenshot Capture

- Captures the current LOVE framebuffer as a PNG.
- The image is stored as Base64 data in memory and listed in the
    Feather gallery.
- A file is also created under `screenshotDirectory`.

### GIF Recording

- Records frames at the configured FPS until `gifDuration` is
    reached.
- Frames are stored as Base64-encoded PNGs.
- At the end of recording, the plugin creates a `gif` entry with
    metadata (name, type, fps, dimensions).
- Encoding to an actual `.gif` file is left to tools like **ffmpeg**
    or **gifski** (the plugin logs a reminder), Feather app automatically converts the array of PNGs to a GIF.

### Debugger Metadata (`getConfig`)

- Type: `screenshots`
- Color: `#003366`
- Icon: `camera`

## 🎮 Actions

The plugin adds interactive actions to the Feather UI:

- **Capture GIF** → starts a GIF recording.
- **Capture Screenshot** → captures a single screenshot.
- **Duration** (input, number) → set GIF duration in seconds (1--60).
- **FPS** (input, number) → set GIF recording framerate (5--60).
- **Persist** (checkbox) → toggle whether images persist between
    reloads of the Feather app.

## 📊 Example

``` lua
local ScreenshotPlugin = require("feather.plugins.screenshot")

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
    debugger:action("screenshots", "gif", { duration = 3, fps = 60 })
  end
end
```
