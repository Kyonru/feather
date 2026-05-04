# BookmarkPlugin

The `BookmarkPlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **tag specific moments during gameplay** with labels and categories. Bookmarks are saved with timestamps and displayed on a timeline in the Feather desktop app.

Use it to mark bugs, lag spikes, interesting events, or anything you want to revisit later — either via an in-game hotkey or from the desktop controls.

## Installation

The plugin lives in `plugins/bookmark/`. Require it from your project:

```lua
local BookmarkPlugin = require("plugins.bookmark")
```

## Configuration

Register the plugin using `FeatherPluginManager.createPlugin`:

```lua
FeatherPluginManager.createPlugin(BookmarkPlugin, "bookmark", {
  hotkey = "f3",              -- key to add a quick bookmark in-game
  defaultCategory = "general", -- default category for new bookmarks
  categories = { "general", "bug", "lag", "note", "important" },
  maxBookmarks = 500,          -- max stored bookmarks (oldest trimmed)
})
```

## Options

| Option              | Type     | Default                                          | Description                               |
| ------------------- | -------- | ------------------------------------------------ | ----------------------------------------- |
| `hotkey`            | string   | `"f3"`                                           | Love2D key to add a quick bookmark.       |
| `defaultCategory`   | string   | `"general"`                                      | Default category for new bookmarks.       |
| `categories`        | string[] | `{"general", "bug", "lag", "note", "important"}` | Available category options on desktop.    |
| `captureScreenshot` | boolean  | `true`                                           | Capture a screenshot with each bookmark.  |
| `maxBookmarks`      | number   | `500`                                            | Maximum bookmarks stored (FIFO overflow). |

## How It Works

1. **In-game hotkey** — Press the configured hotkey (default `F3`) to add a "Quick bookmark" at the current moment.
2. **Desktop controls** — Type a label, select a category, and click "Add Bookmark" from the Feather desktop app.
3. **Timeline view** — Bookmarks appear as a vertical timeline on the desktop, newest first, with color-coded category badges.
4. **Timestamps** — Each bookmark stores both wall-clock time (`os.time()`) and game time (`love.timer.getTime()`), making it easy to correlate with performance data.

## Usage Examples

### Programmatic bookmarks from game code

```lua
local bookmarkPlugin = DEBUGGER.pluginManager:getPlugin("bookmark")
if bookmarkPlugin then
  bookmarkPlugin.instance:add("Player died", "bug")
  bookmarkPlugin.instance:add("Boss fight started", "important")
  bookmarkPlugin.instance:add("Frame drop detected", "lag")
end
```

### Quick bookmark via hotkey

Press `F3` (or your configured hotkey) during gameplay to instantly add a bookmark.

## Actions

| Action | Description                                                                        |
| ------ | ---------------------------------------------------------------------------------- |
| Add    | Add a bookmark with the current label/category                                     |
| Clear  | Remove all bookmarks                                                               |
| Export | Save bookmarks to a JSON file via `love.filesystem`                                |
| Import | Load bookmarks from the most recent exported file (or a specific `path` in params) |

## Desktop UI

The timeline displays bookmarks with:

- **Label** — The bookmark text
- **Category badge** — Color-coded tag (bug=red, lag=orange, note=green, important=purple, general=blue)
- **Relative time** — How long ago the bookmark was created
- **Game time** — Seconds since game start
- **Screenshot** — Thumbnail of the game at the moment the bookmark was created (toggle via the Screenshot checkbox)
