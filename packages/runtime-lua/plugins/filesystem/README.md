# Filesystem Plugin

Browse and inspect files your game has written — save data, configuration, logs, and any other files in the `love.filesystem` root. Navigate directories, preview text file contents, and delete files directly from the Feather desktop.

## Features

- **Directory browser** — lists files and folders with type, size, and last-modified date
- **Navigation** — navigate into subdirectories or jump to any path; go up to the parent with one click
- **File preview** — read text files directly to the clipboard (up to 50 KB; larger files are truncated with a note)
- **Delete files** — remove individual files or empty directories from the desktop
- **Save directory display** — shows the absolute OS path to the game's save directory so you know exactly where files live on disk

## Installation

The plugin is included with Feather. If using `auto.lua`, it's registered automatically.

### With auto.lua (zero-config)

```lua
require("feather.auto")
```

The plugin starts disabled. Enable it from the Feather desktop or force-enable on startup:

```lua
require("feather.auto").setup({
  include = { "filesystem" },
})
```

### Manual registration

```lua
local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local FilesystemPlugin = require("plugins.filesystem")

local debugger = FeatherDebugger({
  plugins = {
    FeatherPluginManager.createPlugin(FilesystemPlugin, "filesystem", {}),
  },
})
```

## Desktop UI

**Toolbar:**

| Control | Description |
| ------- | ----------- |
| **Up** | Navigate to the parent directory |
| **Refresh** | Re-read the current directory |
| **Path** input | Shows the current directory path; edit it and click **Go** to jump to any location |
| **Go** | Navigate to the path typed in the Path input |
| **Item** input | Type a file or folder name to operate on |
| **Open / Read** | Directories: navigate into. Files: read content to clipboard |
| **Delete** | Delete the file or empty directory named in the Item input |

**Table columns:**

| Column | Description |
| ------ | ----------- |
| Name | File or directory name (📁 for directories, 📄 for files) |
| Type | `Dir` or `File` |
| Size | File size formatted as B / KB / MB (directories show `—`) |
| Modified | Last-modified timestamp |

## How it works

### Filesystem root

The plugin browses `love.filesystem`, which mounts two locations:

- **Save directory** — the writable directory where your game stores persistent data (`love.filesystem.getSaveDirectory()`). This is where files written with `love.filesystem.write`, `love.filesystem.newFile`, etc. end up.
- **Source directory** — the game's source folder or `.love` archive (read-only). Items from both are visible together at the root.

The absolute OS path of the save directory is shown in the plugin metadata so you can find files on disk.

### Navigation

The path is relative to the `love.filesystem` root. The empty path (`""`) represents the root. Navigate by:

1. Typing a folder name in the **Item** input and clicking **Open / Read**
2. Typing a full path in the **Path** input and clicking **Go**
3. Clicking **Up** to go to the parent directory

### Reading files

Click **Open / Read** with a filename in the **Item** input. The file content is sent to your clipboard. Files larger than 50 KB are truncated — a note at the end indicates the total size.

This works best for text formats: JSON, plain text, Lua files, `.featherlog` files, INI-style configs, etc. Binary files (images, audio) will show garbled content.

### Deleting files

`love.filesystem.remove` can only delete **empty directories** and **files**. To delete a directory with contents, delete its children first.

## Common use cases

### Inspect save data

Navigate to your save directory root and open your save file:

```
Item: save.json   →   Open / Read
```

The JSON is copied to clipboard — paste it into any editor for inspection.

### Find unexpected files

Sometimes games accumulate temporary or crash files. Browse the root to spot unexpected entries, then delete them.

### Verify a fresh install

Clear save state by deleting individual files or the contents of a directory without leaving the desktop.

### Debug `.featherlog` files

Open `.featherlog` files (newline-delimited JSON) to inspect log entries written in disk mode.
