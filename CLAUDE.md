# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Feather is a debug/inspect tool for [LÖVE (love2d)](https://love2d.org) games. It has two halves:

- **`src-lua/`** — Lua library that runs inside the game. Hosts an HTTP server (via LuaSocket), writes `.featherlog` files, and exposes a plugin system.
- **`src/` + `src-tauri/`** — Tauri v2 desktop app (React + Rust) that connects to the game's server, reads log files, and displays data.

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
```

`npm run dev` requires `/Applications/love.app` and `entr` installed (`brew install entr`). The Lua watcher runs the demo at `src-lua/` with love2d.

The Vite dev server runs on port **1420** (fixed, required by Tauri).

## Architecture

### Data flow (current — HTTP polling)

```
Love2D game (Lua)                     Feather desktop app (Tauri)
─────────────────                     ───────────────────────────
socket.bind(host, port)  ←── GET /config, GET /logs, GET /performance
featherLogger writes                  readTextFileLines(outfile) 
  .featherlog to disk    ────────────► (polls at sampleRate interval)
```

The game is the **server**; the desktop app is the **client** that polls REST endpoints.

### Lua library (`src-lua/feather/`)

- **`init.lua`** — Main `Feather` class. Owns the socket server, wires logger/observer/plugin manager. `Feather:update(dt)` must be called every frame — it accepts one socket connection per frame (non-blocking) and routes the request.
- **`server_utils.lua`** — HTTP/1.1 request parsing and response building over raw TCP. Routes GET/POST/PUT to the appropriate handler. `buildHttpResponse(contentType, body)` is the shared response builder.
- **`plugins/logger.lua`** — Wraps `print()`, writes JSON-per-line to `.featherlog` via `lib/log.lua` (`io.open` append). Deduplicates consecutive identical messages. Manages screenshot circular buffer.
- **`plugins/performance.lua`**, **`plugins/observer.lua`** — Thin plugins; return data on GET request.
- **`plugin_manager.lua`** — Manages plugin lifecycle: `init → getConfig → update → handleRequest / handleActionRequest / handleParamsUpdate → onerror → finish`.
- **`error_handler.lua`** — Replaces `love.errorhandler` when `autoRegisterErrorHandler = true`.

**`mode` config option:** `"socket"` (default) starts the HTTP server; `"disk"` skips `socket.bind` entirely and only writes log files — useful for Android/iOS or when LuaSocket is unavailable.

### Desktop app (`src/`)

- **State** — Two Zustand stores:
  - `store/settings.ts` — persisted to `localStorage`: host, port, apiKey, theme, textEditorPath, pausedLogs, remoteLogs.
  - `store/config.ts` — not persisted: game config received from `GET /config` (`outfile`, `sampleRate`, plugins, etc.) plus `overrideConfig` for manually-opened log files.

- **Data fetching** — React Query hooks in `hooks/`:
  - `use-config.ts` — fetches `GET /config` once on mount; sets `disconnected` state on failure.
  - `use-logs.ts` — reads the `.featherlog` file **incrementally** (tracks `lineOffsetRef` to skip already-parsed lines). When `remoteLogs` is on, fetches `GET /logs` from the server instead of reading a local file. Query is disabled when `logFilePathname` is empty.
  - `use-performance.ts`, `use-observability.ts` — poll at `sampleRate * 1000` ms interval.

- **Log file path resolution** (`use-logs.ts`): `overrideConfig.outfile` (manually opened file) takes precedence over `config.outfile` (from live server).

- **Plugin pages** (`pages/plugins/`) — generic; each plugin registers its own config/UI type via `getConfig()` on the Lua side.

### Tauri backend (`src-tauri/`)

Minimal Rust — only registers the four Tauri plugins: `fs`, `dialog`, `opener`, `shell`. No custom Rust commands beyond the placeholder `greet`.

## Plugin system

Plugins extend Feather on both sides:

**Lua side** — extend `FeatherPlugin` (base class in `plugins/base.lua`), implement lifecycle methods, register with `FeatherPluginManager.createPlugin(MyPlugin, "id", opts)`.

Key lifecycle methods: `init(config)`, `update(dt, feather)`, `handleRequest(request, feather)` (GET), `handleActionRequest` (POST), `handleParamsUpdate` (PUT), `onerror(msg, feather)`, `finish(feather)`, `getConfig()`.

Inside a plugin, `self.logger` and `self.observer` are always available.

**Desktop side** — plugin data appears in `pages/plugins/` via the generic plugin page; no per-plugin TypeScript code is required for basic data display.

## Key conventions

- `@/` alias maps to `src/` (configured in `vite.config.ts`).
- UI components are shadcn/ui (Radix primitives + Tailwind). New components go in `src/components/ui/`.
- Log entries are newline-delimited JSON (`{id, type, str, time, count, trace, screenshot?}`). `type` must be one of the `LogType` enum values.
- The Lua library uses [HUMP Class](https://github.com/vrld/hump) for OOP (`lib/class.lua`).
- LuaLS type annotations (`---@class`, `---@field`, `---@param`) are used throughout the Lua source.
