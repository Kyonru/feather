# Config And Protocol

## Runtime config

`feather.config.lua` is the project-level runtime config. CLI-managed defaults include:

```lua
return {
  managed = "cli",
  debug = true,
  autoRegisterErrorHandler = true,
  include = { "particle-system-playground", "shader-graph" },
  capabilities = { "draw", "filesystem" },
}
```

Important fields:

- `debug`, `host`, `port`, `mode`
- `sessionName`, `deviceId`, `baseDir`
- `wrapPrint`, `defaultObservers`, `autoRegisterErrorHandler`
- `plugins`, `include`, `exclude`, `pluginOptions`
- `capabilities`
- `appId`, `__DANGEROUS_INSECURE_CONNECTION__`
- `apiKey` for Console
- `debugger` and `debugger.hotReload`
- `assetPreview`, `binaryTextThreshold`

CLI parsing/writing lives in `cli/src/lib/config.ts`. Lua consumption lives in `src-lua/feather/auto.lua` and runtime setup code.

## Transport modes

- `socket`: live WebSocket connection to the Feather desktop app.
- `disk`: log-file-oriented mode for offline or no-network workflows.

Socket mode is push-based: the game connects to the desktop app server, authenticates, and then sends session/log/observer/plugin/debugger data.

## Auth boundary

- The desktop sends a one-time challenge nonce.
- The game responds with configured `appId` and nonce.
- No game data should be sent until the desktop sends auth success.
- `__DANGEROUS_INSECURE_CONNECTION__` is an explicit local-prototyping escape hatch and should remain noisy.

This boundary spans Lua, Rust, and React. The Rust WebSocket server should not emit a session-start event or relay game payloads to React before auth succeeds.

## Binary side-channel

Large strings, screenshots, assets, replay chunks, and other bulky payloads should use JSON-safe references plus binary frames:

- Lua creates `feather-binary:<id>` placeholders via `attachBinary()` or `__maybeAttachText()`.
- The JSON payload includes `binary` metadata and the placeholder string.
- The Lua runtime sends the binary bytes after the JSON message.
- React queues binary refs from the JSON payload and replaces placeholders when `feather://binary` arrives.

Do not base64 large payloads into JSON if the binary side-channel can represent them.

## Security surfaces

- Console evaluates Lua inside the running game and requires explicit opt-in plus `apiKey`.
- Hot Reload can replace Lua modules and should require exact allowlists for serious work.
- Filesystem and network plugin capabilities should remain visible in manifests and config.
