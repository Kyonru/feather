# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Feather is a debug/inspect tool for [LÖVE (love2d)](https://love2d.org) games. It has two halves:

- **`src-lua/`** — Lua library that runs inside the game. Connects to the desktop app via WebSocket, writes `.featherlog` files, and exposes a plugin system.
- **`src/` + `src-tauri/`** — Tauri v2 desktop app (React + Rust) that runs a WebSocket server, receives push-based data from the game, and displays it.

## Commands

```bash
# Run the desktop app in dev mode (Vite + watch Lua with love)
npm run dev

# Run only the Vite/React frontend (no Lua)
npm run web

# Run only the Lua side (love2d with file watcher via entr)
npm run lua

# Build the Tauri desktop app (debug build)
npm run native

# Type-check TypeScript
npm run typecheck:web

# Type-check Lua (requires luacheck)
npm run typecheck:lua

# Lint TypeScript
npm run lint

# Build for production
npm run build

# Run Lua with WS test harness (no GUI needed)
/Applications/love.app/Contents/MacOS/love src-lua --test-ws
```

`npm run dev` requires `/Applications/love.app` and `entr` installed (`brew install entr`). The Lua watcher runs the demo at `src-lua/` with love2d.

The Vite dev server runs on port **1420** (fixed, required by Tauri).

## Architecture

### Data flow (WebSocket — push-based)

```
Feather desktop (Tauri + Axum WS server, port 4004)
────────────────────────────────────────────────────
       ▲ WS connect            │ Tauri events
       │                       ▼ ("feather://message")
Love2D game (Lua WS client)   React frontend
────────────────────────       ──────────────
lib/ws.lua connects to         useWsConnection() listens,
  desktop on port 4004         routes to React Query cache
Pushes: feather:hello,         Sends commands back via
  performance, observe,          send_command (Tauri invoke)
  plugin, logs
Receives: cmd:config,
  cmd:plugin:action,
  req:performance, etc.
```

The desktop app is the **server** (Axum WS on port 4004); the game is the **client** that connects and pushes data. The Rust layer assigns a UUID session ID to each WS connection and injects `_session` into every message via string splice (no JSON parse).

### Lua library (`src-lua/feather/`)

- **`init.lua`** — Main `Feather` class. Creates a WS client (`lib/ws.lua`), pushes data at `sampleRate` interval, routes incoming commands via `__handleCommand`. `Feather:update(dt)` must be called every frame — it drives the WS I/O and plugin updates.
- **`lib/ws.lua`** — Minimal non-blocking WebSocket client over LuaSocket. Event-driven: `onopen`, `onmessage`, `onclose`, `onerror`. Handles frame encoding/decoding, ping/pong, auto-reconnect.
- **`lib/base64.lua`** — Optimized base64 encoder with pre-computed lookup table (4-char chunks per iteration). Used for screenshot/GIF frame encoding.
- **`plugins/logger.lua`** — Wraps `print()`, writes JSON-per-line to `.featherlog` via `lib/log.lua` (`io.open` append). Deduplicates consecutive identical messages. Supports optional screenshot capture per log.
- **`plugins/performance.lua`**, **`plugins/observer.lua`** — Thin plugins; return data on push cycle.
- **`plugin_manager.lua`** — Manages plugin lifecycle: `init → getConfig → update → handleRequest / handleActionRequest / handleActionCancel / handleParamsUpdate → onerror → finish`. Features error isolation (per-plugin `pcall` in `update()`), auto-disable after 10 consecutive errors, and `enablePlugin()` for recovery. Supports `disablePlugin()`, `togglePlugin()`, and reports `disabled` state in `getConfig()`.
- **`error_handler.lua`** — Replaces `love.errorhandler` when `autoRegisterErrorHandler = true`.
- **`auto.lua`** — Zero-config entry point. `require("feather.auto")` auto-discovers and registers all built-in plugins with sensible defaults. Supports `exclude`, `include`, and `pluginOptions` config. Creates a global `DEBUGGER` instance. Two opt-out levels: `optIn = true` (e.g. console) means the plugin is not registered at all unless explicitly in `config.include`; `disabled = true` (e.g. entity-inspector, physics-debug) means the plugin is registered and visible in the UI but starts inactive — users can enable from the desktop. `config.include` force-includes optIn plugins and force-enables disabled ones.

**`mode` config option:** `"socket"` (default) connects via WebSocket; `"disk"` skips WS entirely and only writes log files — useful for Android/iOS or when LuaSocket is unavailable.

### Built-in plugins (`src-lua/plugins/`)

- **`screenshots/`** — Capture screenshots and record GIFs. Gallery content type with download. Incremental push to avoid re-sending.
- **`console/`** — Remote REPL. Execute Lua code in the game context. Sandbox mode available. Opt-in only (excluded from auto.lua by default).
- **`profiler/`** — Function-level CPU profiling with start/stop actions.
- **`input-replay/`** — Record and replay input sequences (keyboard, mouse, touch).
- **`entity-inspector/`** — ECS entity browser. Register entity sources, browse and inspect live.
- **`config-tweaker/`** — Live game config editing. Register config tables, edit values from desktop.
- **`bookmark/`** — Mark and navigate to points of interest in game state.
- **`network-inspector/`** — HTTP/WS traffic monitor. Wraps `socket.http` to intercept requests.
- **`memory-snapshot/`** — Heap snapshots via `collectgarbage("count")`, table size tracking, diff between snapshots for leak detection.
- **`physics-debug/`** — Auto-renders `love.physics` World debug overlay (bodies, joints, contacts, AABBs). Color-coded by body type. `addWorld(name, getter)` to register worlds, `hookDraw()` for automatic overlay.
- **`particle-editor/`** — Live ParticleSystem editor. `addSystem(name, getter, imageRef)` to register systems. Edits all 30+ properties in real-time from the desktop. Export to Lua code via save dialog.
- **`audio-debug/`** — Inspect `love.audio` state. Auto-hooks `love.audio.newSource` to track all sources. Shows source table (status, volume, pitch, looping, channels), listener position, master volume, distance model, effects support.
- **`coroutine-monitor/`** — Track active coroutines. Auto-hooks `coroutine.create`, `coroutine.wrap`, `coroutine.resume` to discover and monitor all coroutines. Shows status (running/suspended/dead), yield counts per frame, lifetime stats.
- **`collision-debug/`** — Visualize bump.lua AABB collision worlds. Draws bounding boxes for all items, optional cell grid, per-item colors/labels via callbacks. `addWorld(name, getter, colorFn, labelFn)` to register worlds. `logCollision()` to track collision events.
- **`animation-inspector/`** — Inspect anim8 sprite animation states. Register animations via `addAnimation(name, getter)`. Shows current frame, timer, per-frame duration, flip state, dimensions. Pause/resume/reset all from desktop.
- **`hump/`** — [HUMP signal](https://hump.readthedocs.io/en/latest/signal.html) integration.
- **`lua-state-machine/`** — [lua-state-machine](https://github.com/kyleconroy/lua-state-machine) integration.

### Message types

**Game → Desktop (push):**

- `feather:hello` — config payload on connect (plugins, sampleRate, sysInfo, deviceId, sessionName)
- `feather:bye` — graceful disconnect
- `performance` — FPS, memory, dt stats
- `observe` — key-value observer data
- `plugin` — plugin-specific data (gallery, etc.)
- `plugin:action:response` — success/error result of a plugin action
- `logs` — log entries (when pushed over WS)

**Desktop → Game (commands):**

- `cmd:config` — update sampleRate, updateInterval, etc.
- `cmd:log` — toggle screenshots
- `cmd:plugin:action` — trigger a plugin action (screenshot, GIF, etc.)
- `cmd:plugin:action:cancel` — cancel an in-flight action
- `cmd:plugin:params` — update plugin parameters
- `cmd:plugin:toggle` — enable/disable a plugin at runtime
- `req:config`, `req:performance`, `req:observers`, `req:plugins` — request-response style pulls

### Desktop app (`src/`)

- **State** — Three Zustand stores:
  - `store/settings.ts` — persisted to `localStorage`: host, port, apiKey, theme, textEditorPath, pausedLogs.
  - `store/config.ts` — not persisted: game config received from `feather:hello` (`outfile`, `sampleRate`, plugins, etc.) plus `overrideConfig` for manually-opened log files.
  - `store/session.ts` — persisted (excluding `file:` sessions): tracks active session ID, session metadata (deviceId, name, connected state). Deduplicates by `deviceId`.

- **Data flow** — React Query as reactive cache, driven by `use-ws-connection.ts`:
  - `useWsConnection()` — listens to `feather://message` Tauri events, routes by `msg.type` to session-scoped query cache keys (`[sessionId, 'logs']`, `[sessionId, 'performance']`, etc.).
  - `use-logs.ts` — subscribes to `sessionQueryKey.logs(sessionId)` via `useQuery({ enabled: false })`. For file sessions, an incremental file reader pushes parsed logs into the same cache.
  - `use-performance.ts`, `use-observability.ts` — same `useQuery({ enabled: false })` pattern; data pushed by WS handler.
  - `use-plugin.ts` — `usePlugin(url)` reads plugin cache, `usePluginAction(url)` sends `cmd:plugin:action` / `cmd:plugin:action:cancel` / `cmd:plugin:params` commands.

- **Session management**: Multiple games can connect simultaneously. Each gets a UUID session. The site header shows a session switcher. File-based sessions (`file:<path>` IDs) are created when opening `.featherlog` files manually and are excluded from localStorage persistence.

- **Plugin pages** (`pages/plugins/`) — server-driven UI. The Lua plugin declares actions (buttons, inputs, checkboxes) in `getConfig()` and the desktop renders them generically. Plugin content types: `gallery` (image grid with download), `table`, `tree`, `timeline`. Action types: `button`, `input`, `checkbox`, `select`, `file`. Plugins can be enabled/disabled from the desktop. Action responses show error toasts via sonner.

- **Providers** (`providers.tsx`) — `QueryClientProvider` with 1-hour in-memory `gcTime`. No persistence to localStorage (avoids `QuotaExceededError` from large screenshot/GIF data).

### Tauri backend (`src-tauri/`)

- **`ws_server.rs`** — Axum WebSocket server on port 4004. Manages session lifecycle (UUID assignment, `HashMap<String, WsSender>`). Injects `_session` into game messages via string splice. 64MB `max_message_size` for large GIF payloads. Exposes `send_command` Tauri command for desktop → game messaging.
- **`lib.rs`** — Registers Tauri plugins (`fs`, `dialog`, `opener`, `shell`) and starts the WS server during setup. Exposes `get_local_ips` Tauri command for mobile connection discovery (uses `if-addrs` crate to list non-loopback IPv4 network interfaces).

### Screenshots plugin (`src-lua/plugins/screenshots/`)

The built-in screenshots plugin demonstrates the full plugin lifecycle:

- **Capture screenshot** — `love.graphics.captureScreenshot` callback → base64 encode → store in `self.images`.
- **GIF recording** — File-based frame capture during recording (fast C-side I/O via `love.graphics.captureScreenshot(path)`). After recording stops, batch-encodes frames to base64 across multiple `update()` ticks (3 frames/tick) to avoid freezing the game.
- **Incremental push** — `_lastSentIndex` tracks which images have been sent. Only new items are pushed each cycle, avoiding re-sending large GIF payloads. Desktop uses `unionBy` with `persist` flag to merge.
- **Cancel support** — `handleActionCancel()` stops GIF recording and cleans up temp files/encoding state.

## Plugin system

Plugins extend Feather on both sides:

**Lua side** — extend `FeatherPlugin` (base class in `plugins/base.lua`), implement lifecycle methods, register with `FeatherPluginManager.createPlugin(MyPlugin, "id", opts)`.

Key lifecycle methods: `init(config)`, `update(dt, feather)`, `handleRequest(request, feather)` (GET/push), `handleActionRequest(request, feather)` (POST — returns data/err tuple), `handleActionCancel(request, feather)` (cancel in-flight action), `handleParamsUpdate(request, feather)` (PUT), `onerror(msg, feather)`, `finish(feather)`, `getConfig()`.

Inside a plugin, `self.logger` and `self.observer` are always available.

Error isolation: each plugin's `update()` is wrapped in `pcall`. After 10 consecutive errors, the plugin is auto-disabled. Use `pluginManager:enablePlugin(id)` to re-enable.

**Desktop side** — plugin data appears in `pages/plugins/` via the generic plugin page; no per-plugin TypeScript code is required for basic data display. The Lua `getConfig()` return defines the UI:

```lua
-- Server-driven UI: actions rendered as buttons/inputs/checkboxes on desktop
getConfig() → {
  type = "screenshots",
  icon = "camera",
  tabName = "Screenshots",
  actions = {
    { label = "Capture GIF", key = "gif", icon = "film", type = "button" },
    { label = "Duration", key = "duration", icon = "clock", type = "input", value = 5, props = { type = "number", min = 1, max = 60 } },
    { label = "Persist", key = "persist", icon = "save", type = "checkbox", value = true },
  },
}
```

## Key conventions

- `@/` alias maps to `src/` (configured in `vite.config.ts`).
- UI components are shadcn/ui (Radix primitives + Tailwind). New components go in `src/components/ui/`.
- Toast notifications via `sonner` (imported from `'sonner'`).
- Log entries are newline-delimited JSON (`{id, type, str, time, count, trace, screenshot?}`). `type` must be one of the `LogType` enum values.
- The Lua library uses [HUMP Class](https://github.com/vrld/hump) for OOP (`lib/class.lua`).
- LuaLS type annotations (`---@class`, `---@field`, `---@param`) are used throughout the Lua source.
- React Query keys are session-scoped: `sessionQueryKey.logs(sessionId)`, `sessionQueryKey.plugin(sessionId, pluginId)`, etc. (defined in `use-ws-connection.ts`).
- Data hooks use `useQuery({ enabled: false, queryFn: () => [] })` — data is pushed into the cache externally, not fetched.
- Plugin IDs are normalized: strip `/plugins/` prefix when sending commands, add it when routing on Lua side.

### Mobile connection

The Settings modal includes a "Mobile Connection" section (`src/components/mobile-connection.tsx`) that auto-detects local network IPs via the `get_local_ips` Tauri command and displays a copyable `ws://<ip>:<port>` connection string plus a ready-to-paste Lua snippet. For web-only mode (no Tauri), falls back to manual IP input.

### Install script

`scripts/install-feather.sh` — curl-pipe-sh installer for the Lua library. Downloads core files + plugins from GitHub. Bash 3 compatible (macOS default). Configurable via env vars: `FEATHER_DIR`, `FEATHER_BRANCH`, `FEATHER_PLUGINS`, `FEATHER_SKIP_PLUGINS`.

### Version mismatch

Per-session version mismatch is shown as a warning icon (yellow triangle) on individual session tabs in the header, with a tooltip. Each session's cached config is compared against the desktop app version. This replaces the previous global sidebar warning.
