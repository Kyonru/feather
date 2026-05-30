# Configuration

## Options

`Feather:init(config)` accepts the following options:

| Option                              | Type                  | Default             | Description                                                                                                                                                                             |
| ----------------------------------- | --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`                             | `boolean`             | `false`             | Enable or disable Feather entirely.                                                                                                                                                     |
| `host`                              | `string`              | `"127.0.0.1"`       | Desktop IP or hostname the game connects to.                                                                                                                                            |
| `port`                              | `number`              | `4004`              | Feather desktop WS server port.                                                                                                                                                         |
| `mode`                              | `string`              | `"socket"`          | `"socket"` for live WS, `"disk"` for log-file-only (no network).                                                                                                                        |
| `baseDir`                           | `string`              | `""`                | Base directory path for file references and VS Code deeplinking.                                                                                                                        |
| `wrapPrint`                         | `boolean`             | `false`             | Wrap `print()` calls to send to Feather's log viewer.                                                                                                                                   |
| `maxTempLogs`                       | `number`              | `200`               | Max temporary logs stored before rotation.                                                                                                                                              |
| `sampleRate`                        | `number`              | `1`                 | Seconds between push cycles (performance, observers, plugins).                                                                                                                          |
| `updateInterval`                    | `number`              | `0.1`               | Interval between sending updates to clients.                                                                                                                                            |
| `defaultObservers`                  | `boolean`             | `false`             | Register built-in variable watchers.                                                                                                                                                    |
| `errorWait`                         | `number`              | `3`                 | Seconds to wait for error delivery before showing LÖVE's handler.                                                                                                                       |
| `autoRegisterErrorHandler`          | `boolean`             | `false`             | Replace LÖVE's `errorhandler` to capture errors.                                                                                                                                        |
| `errorHandler`                      | `function`            | `love.errorhandler` | Custom error handler to use.                                                                                                                                                            |
| `continueOnGameError`               | `boolean`             | `false`             | When `false`, errors from wrapped game callbacks are delivered to Feather and then rethrown so the game crashes normally. Set `true` to log the error and keep the game loop running.    |
| `gameErrorToast`                    | `boolean`             | `true`              | Show an in-game crash toast when `continueOnGameError = true`.                                                                                                                          |
| `plugins`                           | `table`               | `{}`                | List of plugin modules to load.                                                                                                                                                         |
| `captureScreenshot`                 | `boolean`             | `false`             | Capture screenshots on error.                                                                                                                                                           |
| `sessionName`                       | `string`              | `""`                | Custom display name shown in desktop session tabs (e.g. `"My RPG"`).                                                                                                                    |
| `deviceId`                          | `string`              | auto-generated      | Persistent device ID. Auto-generated and saved to disk if not set.                                                                                                                      |
| `writeToDisk`                       | `boolean`             | `true`              | Whether to write logs to `.featherlog` files.                                                                                                                                           |
| `outputDir`                         | `string`              | `"logs"`            | Folder name (relative to the love save directory) where `.featherlog` files and log screenshots are written.                                                                            |
| `capabilities`                      | `string[]` or `"all"` | `"all"`             | Allowed plugin capability tokens. Plugins requesting undeclared capabilities log a warning at load time. Pass `"all"` to skip checking.                                                 |
| `retryInterval`                     | `number`              | `2`                 | Seconds between WebSocket reconnection attempts.                                                                                                                                        |
| `connectTimeout`                    | `number`              | `2`                 | Seconds to wait for initial WS connection.                                                                                                                                              |
| `appId`                             | `string`              | `""`                | Desktop App ID that is allowed to send commands to this game. Copy from **Feather → Settings → Security → Desktop App ID**. Required unless `__DANGEROUS_INSECURE_CONNECTION__` is set. |
| `__DANGEROUS_INSECURE_CONNECTION__` | `boolean`             | `false`             | Explicit opt-in to skip the appId check and accept commands from any Feather desktop. Must be set to acknowledge the security risk (e.g. in a LAN jam build without a fixed App ID).    |
| `debugger`                          | `boolean` or `table`  | `false`             | Enable the step debugger, or pass debugger options such as `debugger.pauseOnError` and `debugger.hotReload`.                                                                            |
| `debugOverlay`                      | `table` or `false`    | enabled in debug    | Small in-game “Feather debugger enabled” badge. Use `enabled`, `visible`, `hideKey`, `touchToggle`, and `corner` to customize it. Press `F12` or double-tap the top-right corner to hide/show by default. |
| `assetPreview`                      | `boolean`             | `true`              | Enable the core Assets tab tracking and previews. Set to `false` to avoid hooking asset loaders and `love.draw`.                                                                        |
| `binaryTextThreshold`               | `number`              | `4096`              | Observer, time-travel, debugger, and console text values longer than this many bytes are sent through the hybrid binary protocol instead of JSON.                                       |

---

> [!WARNING]
> `captureScreenshot` can affect performance because it captures the current frame when errors are handled. Enable it only when you need visual error context.

> [!TIP]
> `continueOnGameError = true` is useful for exploratory debugging because Feather keeps reporting repeated callback crashes and shows an in-game toast. Leave it off when you want normal LÖVE crash behavior.
> You can also toggle this for the current run from **Session → Keep Running After Callback Crashes**.

## Generated CLI Config

`feather init` defaults to CLI-managed mode. In that mode Feather creates `feather.config.lua` without patching game code, and `feather run` injects the runtime when you launch the game.

The generated CLI config includes:

```lua
return {
  managed = "cli",
  debug = true,
  autoRegisterErrorHandler = true,
  include = { "particle-system-playground", "shader-graph" },
  capabilities = { "draw", "filesystem" },
}
```

Those default plugins are normal bundled plugins, not special cases. Other plugins are enabled by adding their IDs to `include`, either manually or with the CLI:

```bash
feather config plugins --include input-replay
feather config plugins --exclude shader-graph
```

Plugins marked `optIn = true` or `disabled = true` in their `manifest.lua` only become active when included. This is how development-only tools such as Console and Hot Reload stay off unless you ask for them.

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

The CLI can write the same shape for you:

```bash
feather init path/to/my-game --plugins hot-reload --hot-reload-allow game.player,game.systems.combat --yes
feather config hot-reload --allow game.player,game.systems.combat --dir path/to/my-game
```

See [Hot Reload](hot-reload.md) for the full workflow.

> [!WARNING]
> Hot reload is remote code execution for development. Leave the `hot-reload` plugin excluded unless you are actively using it.

> [!CAUTION]
> Broad allowlists such as `allow = { "game.*" }` let Feather replace many modules at runtime. Start with exact module names and keep `persistToDisk = false` unless you explicitly need persistent mobile patches.

## Security

Feather uses a **nonce-based challenge-response handshake** to authenticate each connection before any game data is exchanged.

The CLI can audit these settings:

```bash
feather doctor path/to/my-game --production
feather doctor path/to/my-game --security --json
```

`--production` fails on unsafe release settings. `--security --json` emits a machine-readable security report and redacts sensitive values such as `apiKey`.

### How it works

1. When the game connects, the desktop immediately sends a one-time challenge nonce.
2. The game responds with its configured `appId` and the nonce.
3. The desktop validates both. On success it sends `auth:ok` and the game begins pushing data. On failure it sends `auth:fail` and closes the connection.

No game data (`feather:hello`, observers, logs, etc.) is sent until the handshake completes.

### Setting up appId

Copy your App ID from **Feather → Settings → Security → Desktop App ID** and add it to your config:

```lua
return {
  appId = "your-app-id-here",
}
```

The same `appId` must be set in both the desktop settings and your game config. If they don't match, the connection is rejected and the game logs:

```
[Feather] Auth failed. Check that appId in feather.config.lua matches your Feather desktop App ID.
```

### Insecure mode

For quick local prototyping or LAN jam builds where you don't want to manage a fixed App ID:

```lua
return {
  __DANGEROUS_INSECURE_CONNECTION__ = true,
}
```

The desktop will accept the connection and show an insecure badge on the session tab. The field name is intentionally verbose — it must be set explicitly to acknowledge the risk.

> [!CAUTION]
> Insecure mode allows **any** Feather desktop on the network to send commands to your game, including triggering the console plugin if installed. Do not ship production builds with insecure mode enabled.

### Console API key

The Console plugin can evaluate Lua inside the running game. If `console` is included, configure a strong `apiKey` and match it in Feather desktop Settings:

```lua
return {
  include = { "console" },
  apiKey = "a-long-random-per-session-secret",
}
```

Doctor reports whether the key is configured or weak, but does not print the key value.

---

## Connecting

Feather uses a **push-based WebSocket architecture**. The desktop app runs a WebSocket server (port 4004 by default), and your game connects to it as a client.

1. Start the Feather desktop app from the [releases page](https://github.com/Kyonru/feather/releases).
2. Run your game with Feather enabled — you'll see:

```
[Feather] WS client created — connecting to 127.0.0.1:4004
[Feather] Connected — handshake complete
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
