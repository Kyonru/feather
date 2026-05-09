# Assets

The **Assets** tab is a core Feather feature for inspecting images, fonts, and audio sources loaded by your LÖVE game at runtime. It is not a plugin and does not require any plugin registration.

Feather tracks calls to:

- `love.graphics.newImage`
- `love.graphics.newFont`
- `love.audio.newSource`

Assets appear in the desktop app after they are loaded by the game.

---

## Setup

No extra setup is required beyond running Feather in debug mode:

```lua
require("feather.auto")

function love.update(dt)
  DEBUGGER:update(dt)
end
```

Or with manual setup:

```lua
local FeatherDebugger = require("feather")

local debugger = FeatherDebugger({
  debug = true,
})

function love.update(dt)
  debugger:update(dt)
end
```

Open the **Assets** tab in the desktop app to view the tracked catalog.

### Disabling asset previews

Asset tracking is enabled by default. To disable it for a session:

```lua
require("feather.auto").setup({
  assetPreview = false,
})
```

Or with manual setup:

```lua
local debugger = FeatherDebugger({
  debug = true,
  assetPreview = false,
})
```

When disabled, Feather does not hook `love.graphics.newImage`, `love.graphics.newFont`, `love.audio.newSource`, or `love.draw` for asset previews.

You can also toggle asset previews for the active session from the **Assets** tab. Turning it off clears the current asset catalog in the desktop app. Turning it back on starts tracking assets loaded after the toggle; assets loaded while previewing was disabled are not backfilled.

---

## Asset Lists

The Assets tab has three views:

| View | Tracks | Details shown |
| --- | --- | --- |
| Textures | `love.graphics.newImage` | dimensions, format, mipmaps, source path |
| Fonts | `love.graphics.newFont` | font height, ascent, descent, source path when available |
| Audio | `love.audio.newSource` | source type, channel count, duration, source path |

Use the filter input to search by filename or source path.

!!! note
    Feather only sees assets loaded after Feather has initialized. If an asset is loaded before Feather starts, reload the game with Feather enabled earlier in startup.

---

## Previewing Textures And Fonts

Click **View** on a texture or font row to load a preview.

### File-backed textures

When an image was loaded from a file path:

```lua
local player = love.graphics.newImage("assets/player.png")
```

Feather sends the original Lua path to the desktop. The desktop resolves that path against the session's **Game Root** folder and reads the image directly from disk.

This avoids sending large image data over the WebSocket and keeps previews fast for normal project assets.

### Procedural textures

When an image was created from runtime data:

```lua
local imageData = love.image.newImageData(16, 16)
local texture = love.graphics.newImage(imageData)
```

There is no file path to read from disk. Feather renders the texture to a canvas in the game and sends a base64 PNG preview to the desktop.

### Fonts

Fonts are previewed by rendering sample text in the game and sending a PNG preview to the desktop.

---

## Game Root

The **Game Root** folder is the desktop-side root directory used to resolve asset paths and debugger source files.

Feather automatically reports the source directory when the LÖVE version supports it. If the game runs somewhere the desktop cannot read directly, such as a mobile device, remote machine, or bundled runtime, click **Select Folder** and choose the local copy of the game's root folder.

The selected folder is stored per session and is shared by:

- **Assets** — resolves image paths for file-backed previews
- **Debugger** — reads `.lua` source files for the file tree and source view

Click **Auto** to remove the manual folder and return to Feather's detected root.

### Path resolution

If Lua reports:

```lua
assets/player.png
```

and the selected Game Root is:

```text
/Users/me/projects/my-game
```

the desktop reads:

```text
/Users/me/projects/my-game/assets/player.png
```

For absolute paths reported by the game, a manually selected Game Root still wins. Feather strips the absolute prefix and resolves the path inside the selected folder so remote/mobile paths can map to a local project copy.

---

## Preview Controls

The preview panel supports:

| Control | Description |
| --- | --- |
| Zoom in | Increase zoom by 1.5x |
| Zoom out | Decrease zoom by 1.5x |
| Fit | Reset zoom to 100% and clear pan |
| Drag | Pan the canvas when zoomed above 100% |

When zoom is above 100%, Feather draws a pixel grid over the preview. This is useful for inspecting sprites, tiles, and procedural images at the pixel level.

---

## Troubleshooting

### The texture list is empty

Make sure the game loads images after Feather starts. If assets are loaded before `require("feather.auto")` or before creating `FeatherDebugger`, Feather cannot track those calls.

### Preview says the file is not available

The desktop could not read the image from the resolved path. Select the correct **Game Root** folder in the Assets tab.

This often happens when:

- the game is running on another machine
- the game is running on mobile
- the LÖVE source directory cannot be detected
- the game reports a path from a bundled/runtime environment

### Procedural previews do not update immediately

Procedural texture and font previews are rendered during `love.draw`. Make sure your game continues drawing while connected to Feather.
