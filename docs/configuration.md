# Configuration

## Options

`Feather:init(config)` accepts the following options:

| Option                     | Type                  | Default             | Description                                                                                                                                       |
| -------------------------- | --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`                    | `boolean`             | `false`             | Enable or disable Feather entirely.                                                                                                               |
| `host`                     | `string`              | `"127.0.0.1"`       | Desktop IP or hostname the game connects to.                                                                                                      |
| `port`                     | `number`              | `4004`              | Feather desktop WS server port.                                                                                                                   |
| `mode`                     | `string`              | `"socket"`          | `"socket"` for live WS, `"disk"` for log-file-only (no network).                                                                                  |
| `baseDir`                  | `string`              | `""`                | Base directory path for file references and VS Code deeplinking.                                                                                  |
| `wrapPrint`                | `boolean`             | `false`             | Wrap `print()` calls to send to Feather's log viewer.                                                                                             |
| `maxTempLogs`              | `number`              | `200`               | Max temporary logs stored before rotation.                                                                                                        |
| `sampleRate`               | `number`              | `1`                 | Seconds between push cycles (performance, observers, plugins).                                                                                    |
| `updateInterval`           | `number`              | `0.1`               | Interval between sending updates to clients.                                                                                                      |
| `defaultObservers`         | `boolean`             | `false`             | Register built-in variable watchers.                                                                                                              |
| `errorWait`                | `number`              | `3`                 | Seconds to wait for error delivery before showing LÖVE's handler.                                                                                 |
| `autoRegisterErrorHandler` | `boolean`             | `false`             | Replace LÖVE's `errorhandler` to capture errors.                                                                                                  |
| `errorHandler`             | `function`            | `love.errorhandler` | Custom error handler to use.                                                                                                                      |
| `plugins`                  | `table`               | `{}`                | List of plugin modules to load.                                                                                                                   |
| `captureScreenshot`        | `boolean`             | `false`             | Capture screenshots on error.                                                                                                                     |
| `sessionName`              | `string`              | `""`                | Custom display name shown in desktop session tabs (e.g. `"My RPG"`).                                                                              |
| `deviceId`                 | `string`              | auto-generated      | Persistent device ID. Auto-generated and saved to disk if not set.                                                                                |
| `writeToDisk`              | `boolean`             | `true`              | Whether to write logs to `.featherlog` files.                                                                                                     |
| `outputDir`                | `string`              | `"logs"`            | Folder name (relative to the love save directory) where `.featherlog` files and log screenshots are written.                                      |
| `capabilities`             | `string[]` or `"all"` | `"all"`             | Allowed plugin capability tokens. Plugins requesting undeclared capabilities log a warning at load time. Pass `"all"` to skip checking.           |
| `retryInterval`            | `number`              | `5`                 | Seconds between WebSocket reconnection attempts.                                                                                                  |
| `connectTimeout`           | `number`              | `2`                 | Seconds to wait for initial WS connection.                                                                                                        |
| `apiKey`                   | `string`              | `""`                | API key for authenticated connections.                                                                                                            |
| `debugger`                 | `boolean` or `table`  | `false`             | Enable the step debugger, or pass debugger options such as `debugger.hotReload`.                                                                  |
| `assetPreview`             | `boolean`             | `true`              | Enable the core Assets tab tracking and previews. Set to `false` to avoid hooking asset loaders and `love.draw`.                                  |
| `binaryTextThreshold`      | `number`              | `4096`              | Observer, time-travel, debugger, and console text values longer than this many bytes are sent through the hybrid binary protocol instead of JSON. |

---

> [!WARNING]
> `captureScreenshot` can affect performance because it captures the current frame when errors are handled. Enable it only when you need visual error context.

## Hot Reload

Hot reload is configured under `debugger.hotReload`, but the command handler only exists when the opt-in `hot-reload` plugin is installed and included:

```lua
return {
  include = { "hot-reload" },

  debugger = {
    enabled = true,
    hotReload = {
      enabled = true,
      allow = { "game.player", "game.systems.*" },
      deny = { "main", "conf", "feather.*" },
      persistToDisk = false,
      clearOnBoot = false,
      requireLocalNetwork = true,
    },
  },
}
```

See [Hot Reload](hot-reload.md) for the full workflow.

> [!WARNING]
> Hot reload is remote code execution for development. Leave the `hot-reload` plugin excluded unless you are actively using it.

> [!CAUTION]
> Broad allowlists such as `allow = { "game.*" }` let Feather replace many modules at runtime. Start with exact module names and keep `persistToDisk = false` unless you explicitly need persistent mobile patches.

## Connecting

Feather uses a **push-based WebSocket architecture**. The desktop app runs a WebSocket server (port 4004 by default), and your game connects to it as a client.

1. Start the Feather desktop app from the [releases page](https://github.com/Kyonru/feather/releases).
2. Run your game with Feather enabled — you'll see:

```
[Feather] WS client created — connecting to 127.0.0.1:4004
[Feather] Connected to 127.0.0.1:4004
```

The game automatically reconnects if the desktop app is restarted.

---

## Mobile & Remote Devices

### Android (USB via ADB reverse)

Forward the device's `localhost:4004` to your computer:

```bash
adb reverse tcp:4004 tcp:4004
```

Then use the default config — the game connects to `127.0.0.1:4004`, which ADB routes to your computer:

```lua
local debugger = FeatherDebugger({ debug = true })
```

### Android / iOS (Wi-Fi)

Point `host` to your computer's local IP:

```lua
local debugger = FeatherDebugger({
  debug = true,
  host = "192.168.1.42",
})
```

> [!TIP]
> Open Feather → **Settings** → **Mobile Connection**. Your local IP is auto-detected with a copyable `ws://` connection string and ready-to-paste Lua snippet.

### Offline / disk mode

Skip WebSocket entirely and write only log files — useful when there's no shared network:

```lua
local debugger = FeatherDebugger({
  debug = true,
  mode = "disk",
})
```

Transfer the `.featherlog` file from the device and open it in the Feather app via **Open Log File**.
