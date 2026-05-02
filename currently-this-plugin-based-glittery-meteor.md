# Feather: WebSocket Architecture Redesign

## Context

Currently the game (Lua) hosts an HTTP server and the desktop app polls it. This blocks Android/iOS (can't reach inbound ports on a mobile device), adds polling latency, and requires LuaSocket server-side binding.

Flipping the model: the **Feather desktop app hosts a WebSocket server**; each game opens a WS client connection to it. The game pushes data as events happen. The desktop receives and routes messages. This natively supports Android (game connects *out* over WiFi), enables multiple simultaneous sessions, and removes all polling.

This is a clean-break major version change. Disk mode (`mode = "disk"`) is unaffected — it never uses the network.

---

## Message Protocol

All messages are UTF-8 JSON text frames. Every message has a `type` field and a `session` UUID (assigned by the game on connect, echoed in all messages so the desktop can multiplex sessions).

### Game → Desktop (push)

```jsonc
// Session start — replaces GET /config (sent immediately after WS handshake)
{ "type": "feather:hello", "session": "uuid", "data": {
    "plugins": { "<id>": <getConfig()> },
    "root_path": "...", "version": "0.5.1", "API": 3,
    "sampleRate": 1, "language": "lua",
    "outfile": "/path/to/file.featherlog",
    "captureScreenshot": false, "location": "/path/to/savedir"
}}

// Log entry — replaces file polling (sent immediately on each log() call)
{ "type": "log", "session": "uuid", "data": {
    "id": "1", "type": "output", "str": "...",
    "time": 1234567890, "count": 1, "trace": "...", "screenshot": "path?"
}}

// Performance tick — sent at updateInterval throttle (not every frame)
{ "type": "performance", "session": "uuid", "data": {
    "fps": 60, "memory": 128.5, "frameTime": 0.016,
    "vsyncEnabled": true, "time": 1234567890,
    "stats": { "drawcalls": 10, ... },
    "sysInfo": { "os": "OS X", "arch": "x86_64", "cpuCount": 8 },
    "supported": { ... }
}}

// Observer values — sent at updateInterval throttle
{ "type": "observe", "session": "uuid", "data": [
    { "key": "player.hp", "value": "100", "type": "number" }
]}

// Plugin data — sent by plugin when its data changes
{ "type": "plugin", "session": "uuid", "plugin": "screenshots", "data": {
    "type": "gallery", "data": [...], "loading": false, "persist": true
}}

// Session end
{ "type": "feather:bye", "session": "uuid" }
```

### Desktop → Game (commands)

```jsonc
// Update game config — replaces PUT /config
{ "type": "cmd:config", "data": { "sampleRate": 2 } }

// Toggle screenshots — replaces POST /logs?action=toggle-screenshots
{ "type": "cmd:log", "action": "toggle-screenshots" }

// Plugin action — replaces POST /plugins/<id>
{ "type": "cmd:plugin:action", "plugin": "screenshots", "action": "gif",
  "params": { "duration": 5, "fps": 30 } }

// Plugin params update — replaces PUT /plugins/<id>
{ "type": "cmd:plugin:params", "plugin": "screenshots",
  "params": { "persist": true } }
```

---

## Phase 1 — Tauri Rust WS Server

**`src-tauri/Cargo.toml`** — add dependencies:
```toml
axum = { version = "0.8", features = ["ws"] }
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**New file: `src-tauri/src/ws_server.rs`**

- Spawn `tokio::spawn` with an `axum` router on `0.0.0.0:<port>` (default 4004, configurable)
- Single WS route: `GET /` upgraded to WebSocket
- On each new connection: assign session UUID, start a read loop
- On each inbound message: `app_handle.emit("feather://message", payload)` where payload is the raw JSON string — the TypeScript side handles all parsing/routing
- On connection close: `app_handle.emit("feather://session-end", session_id)`
- Keep a `Arc<Mutex<HashMap<session_id, WsSender>>>` to send commands back to specific games
- Expose a Tauri command `send_command(session_id, message)` that the frontend calls to push commands to the game

**`src-tauri/src/lib.rs`** — register the WS server:
```rust
pub fn run() {
    let app = tauri::Builder::default()
        // existing plugins ...
        .setup(|app| {
            let handle = app.handle().clone();
            ws_server::start(handle);  // spawns tokio runtime + axum
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ws_server::send_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## Phase 2 — TypeScript Frontend

### New hook: `src/hooks/use-ws-connection.ts`

- Call `listen("feather://message", handler)` and `listen("feather://session-end", handler)` from `@tauri-apps/api/event` on mount
- Parse each message's `type` field and call `queryClient.setQueryData(key, updater)` for the right cache key:
  - `feather:hello` → `setQueryData([sessionId, 'config'], data)` + `setDisconnected(false)` + set `sessionId` in a new store
  - `log` → append to `getQueryData([sessionId, 'logs', clearTime])` 
  - `performance` → append to `getQueryData([sessionId, 'performance'])`
  - `observe` → `setQueryData([sessionId, 'observers'], data)`
  - `plugin` → `setQueryData([sessionId, 'plugin', message.plugin], data)`
  - `feather:bye` → `setDisconnected(true)`, clear session
- Mount in `router.tsx` `<Modals>` (currently where `useLogs()` is called — line 19)

### New store: `src/store/session.ts`

Small Zustand store (not persisted):
```ts
{ sessionId: string | null, setSession, clearSession }
```
The `sessionId` replaces `serverUrl` as the primary React Query key namespace.

### `src/store/settings.ts`

- Rename `host`/`port` from "game server address" to "Feather server port" (desktop's WS port)
- Remove `remoteLogs` — no longer needed (WS works for remote by default)
- Keep `apiKey` — sent by game in the `feather:hello` message, validated by the desktop

### Updated hooks (all become cache-readers only)

**`src/hooks/use-logs.ts`**
- Remove `readTextFileLines`, `refetchInterval`, `lineOffsetRef`, remote fetch logic
- Replace `useQuery` with `useQueryClient().getQueryData([sessionId, 'logs', clearTime])`
- Keep `clear()` (sets `clearTime`) and `onScreenshotChange()` (calls `invoke("send_command", ...)`)
- Keep override file path logic — `overrideLogFile` still works for manually opened `.featherlog` files (disk mode workflow unchanged)

**`src/hooks/use-performance.ts`**, **`src/hooks/use-observability.ts`**, **`src/hooks/use-plugin.ts`**
- Remove `refetchInterval` and `fetch()` calls
- Read from cache via `useQuery({ queryKey, queryFn: () => queryClient.getQueryData(key) })`
- Mutations (plugin actions, config updates) call `invoke("send_command", { sessionId, message })`

**`src/hooks/use-config.ts`**
- Remove `fetch()` poll; config arrives via `feather:hello` WS message
- `updateSampleRate` mutation calls `invoke("send_command", { type: "cmd:config", ... })`

---

## Phase 3 — Lua Client

**New file: `src-lua/feather/lib/ws.lua`** (~120 lines, no external dependency)

Implements a minimal WS client on top of LuaSocket:
- `ws.connect(host, port)` — TCP connect + HTTP upgrade handshake
  - Generates random 16-byte key, base64-encodes it (include ~20-line base64 encoder)
  - Sends `GET / HTTP/1.1 ... Upgrade: websocket ...`
  - Reads until `\r\n\r\n`, validates `101 Switching Protocols`
  - Returns connection object with `send(msg)` and `receive()` methods
- `conn:send(msg)` — encodes as masked text frame (WS spec requires client masking)
  - Header: `0x81` (FIN+text), `0x80 | len` (mask bit + length), 4-byte mask, masked payload
  - Uses `bit` library (LuaJIT, available in Love2D) for XOR masking
- `conn:receive()` — non-blocking (`settimeout(0)`), reads and unframes one text message or returns nil
  - Handles fragmentation buffer for messages split across reads
- `conn:close()` — sends close frame (opcode `0x8`), closes socket

**`src-lua/feather/init.lua`** changes:

- Replace `socket = require("socket")` lazy-load + `socket.bind()` with `ws.connect(self.host, self.port)`
- Add `self.sessionId = generateUUID()` (simple random hex string, not RFC UUID required)
- Add `self.lastPushTime = 0` and `self.updateInterval` throttle for performance/observe messages
- Send `feather:hello` immediately after connect (calls `self:__getConfig()`)
- In `Feather:update(dt)`:
  ```lua
  -- 1. Receive and dispatch commands from desktop
  local raw = self.wsClient:receive()
  if raw then self:__handleCommand(json.decode(raw)) end
  
  -- 2. Update logger (screenshots) and plugins
  self.featherLogger:update()
  self.pluginManager:update(dt, self)
  
  -- 3. Throttled push: performance + observers
  local now = love.timer.getTime()
  if now - self.lastPushTime >= self.updateInterval then
    self.lastPushTime = now
    self:__pushPerformance(dt)
    self:__pushObservers()
  end
  ```
- `__handleCommand(msg)`:
  - `cmd:config` → `self:__setConfig(msg.data)`
  - `cmd:log` → `self:toggleScreenshots(...)`
  - `cmd:plugin:action` → `self.pluginManager:action(...)`
  - `cmd:plugin:params` → `self.pluginManager:handleParamsUpdate(...)`
- `__pushPerformance(dt)` / `__pushObservers()` — helper methods that encode and send the respective messages

**`src-lua/feather/plugins/logger.lua`** changes:

- In `FeatherLogger:log(line)` — after writing to file, call `self.feather.wsClient:send(json.encode({ type="log", session=..., data=line }))` if connected
- Log file writing remains (disk mode, offline record, override-file workflow)

**`src-lua/feather/plugin_manager.lua`** changes:

- Add `FeatherPluginManager:pushPluginData(feather, pluginId)` — calls plugin's `handleRequest` and sends result as `plugin` message
- Call from `update()` when plugin has new data (each plugin can decide cadence via `update()`)

---

## Phase 4 — Plugin System Adaptation

Plugin interface is **unchanged** from the developer's perspective. The internal dispatch changes:

| Old | New |
|-----|-----|
| `handleRequest(request, feather)` called on GET | called when desktop sends `cmd:plugin:get` OR on cadence in `update()` |
| `handleActionRequest(request, feather)` called on POST | called when desktop sends `cmd:plugin:action` |
| `handleParamsUpdate(request, feather)` called on PUT | called when desktop sends `cmd:plugin:params` |

The `request` object passed to plugins gets a shim:
```lua
-- Construct a fake request from WS command message
local request = {
  method = "GET",
  path = "/plugins/" .. pluginId,
  params = msg.params or {},
  headers = {}
}
```

This means existing plugins need **zero changes** to work with the WS architecture.

---

## Critical Files

| File | Action |
|------|--------|
| `src-tauri/Cargo.toml` | Add axum, tokio, uuid |
| `src-tauri/src/ws_server.rs` | **Create** — axum WS server, session management, Tauri event emission |
| `src-tauri/src/lib.rs` | Register WS server in setup, add invoke handler |
| `src-lua/feather/lib/ws.lua` | **Create** — minimal WS client (connect, send, receive, close) |
| `src-lua/feather/init.lua` | Replace socket.bind with ws.connect, add command dispatch, throttled push |
| `src-lua/feather/plugins/logger.lua` | Push log messages over WS after writing to file |
| `src-lua/feather/plugin_manager.lua` | Add pushPluginData, build request shim for cmd messages |
| `src/hooks/use-ws-connection.ts` | **Create** — Tauri event listener, routes messages to React Query cache |
| `src/store/session.ts` | **Create** — sessionId Zustand store |
| `src/store/settings.ts` | Rename host/port semantics, remove remoteLogs |
| `src/hooks/use-logs.ts` | Remove file reading and polling; read from cache; mutations via invoke |
| `src/hooks/use-performance.ts` | Remove fetch/polling; read from cache |
| `src/hooks/use-observability.ts` | Remove fetch/polling; read from cache |
| `src/hooks/use-config.ts` | Remove fetch; config from cache; mutations via invoke |
| `src/hooks/use-plugin.ts` | Remove fetch/polling; read from cache; mutations via invoke |
| `src/router.tsx` | Replace `useLogs()` call with `useWsConnection()` in Modals |

---

## Verification

1. **Rust WS server starts:** Launch `npm run native`, check that port 4004 is listening (`lsof -i :4004`)
2. **Game connects:** Run the demo (`npm run lua`), confirm `feather:hello` message logged in Tauri and "Server connected" toast appears in UI
3. **Logs stream:** `print("hello")` in demo game → log entry appears in Feather UI without polling delay
4. **Performance page:** Opens and shows live FPS chart updating at the configured rate
5. **Android path:** ADB-connect an Android device, set `host = "<desktop-ip>"` in game config, confirm logs appear in real-time without port-forward
6. **Plugin actions:** Screenshots plugin — press capture button in UI → game captures screenshot → plugin data pushed back → image appears in UI
7. **Disk mode unaffected:** `mode = "disk"` game still writes `.featherlog`, file can be opened via file picker; no WS connection attempted
8. **Multiple sessions:** Run two love2d instances simultaneously → both appear as separate sessions in the UI (foundation for v0.7.0 multi-connect)
