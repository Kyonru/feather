# Feather: Three Core Improvements

## Context

Feather is a Love2D debugger with a Lua socket server (`src-lua/`) and a React/Tauri desktop app (`src/`). Three issues need fixing before new features can be added:

1. **Android logging** — logs live in `/data/data/<app>/files/` (inaccessible from desktop); currently requires manual ADB transfer
2. **Performance** — on every poll, `use-logs.ts` re-reads and re-parses the *entire* log file from line 0, then runs `unionBy()` across all entries
3. **Friction** — always calls `socket.bind()` even when only disk logging is needed; blocks use in minimal Love2D distributions without LuaSocket

---

## Implementation

### 1. Disk mode (reduces friction, enables Android)

**File:** `src-lua/feather/init.lua`

- Remove `local socket = require("socket")` from the top of the file; declare `local socket` instead
- Add `mode` to `FeatherConfig` annotation: `---@field mode? "socket" | "disk"`
- In `Feather:init`, after `self.plugins = conf.plugins or {}`, add:
  ```lua
  self.mode = conf.mode or "socket"
  ```
- Restructure the debug setup block: if `mode == "disk"`, initialize logger/observer/plugins and `return` early — skip `socket.bind()` entirely; if `mode == "socket"` (default), `require("socket")` and do existing setup
- In `Feather:update`, add early branch:
  ```lua
  if self.mode == "disk" then
    self.featherLogger:update()
    self.pluginManager:update(dt, self)
    return
  end
  ```

Disk mode result: `debugger:update(dt)` still works; logger writes `.featherlog` to disk; no socket dependency.

---

### 2. GET /logs endpoint (enables Android remote access)

**File:** `src-lua/feather/server_utils.lua`

- Add `server.buildTextResponse(body)` helper returning `text/plain` HTTP response with CORS headers (same pattern as existing `server.createResponse`)
- Inside `server.handleRequest`, inside the `if request and canProcess then` block, add an early-return handler **before** the method dispatch:
  ```lua
  if request.method == "GET" and request.path == "/logs" then
    local fp = io.open(feather.featherLogger.outfile, "r")
    local content = fp and fp:read("*a") or ""
    if fp then fp:close() end
    client:send(server.buildTextResponse(content))
    client:close()
    return
  end
  ```
  This must return before line 225 (`client:send(server.createResponse(...))`) so it doesn't double-send.

---

### 3. Incremental log reading + remote fetch (performance + Android)

**File:** `src/hooks/use-logs.ts`

- Add `useRef` to the React import
- Declare `const lineOffsetRef = useRef<number>(0)` inside `useLogs`
- In the `queryFn`:
  - Get `existing` first: `const existing = queryClient.getQueryData<Log[]>(queryKey) ?? []`
  - Reset offset when cache is empty (key change = new file or clearTime): `if (existing.length === 0) lineOffsetRef.current = 0`
  - Replace the local-file read branch with an incremental loop that skips lines `< lineOffsetRef.current` and advances `lineOffsetRef.current` to total line count after the loop
  - Replace `unionBy(existing, dataLogs, ...)` with `[...existing, ...newLines]` (incremental reads produce no duplicates by construction)

**File:** `src/store/settings.ts`

- Add `remoteLogs: boolean` to `SettingsStoreState`
- Add `setRemoteLogs: (remoteLogs: boolean) => void` to `SettingsStoreActions`
- Add `remoteLogs: false` to `defaultSettings`
- Add `setRemoteLogs: (remoteLogs) => set({ remoteLogs })` in the store factory

**File:** `src/hooks/use-logs.ts` (remote branch)

- Read `const isRemote = useSettingsStore((state) => state.remoteLogs)`
- Add a remote fetch branch before `isWeb()` check: when `isRemote`, fetch `${serverUrl}/logs` (with `x-api-key` header), split response text by `\n`, apply same incremental offset logic
- Add `ServerRoute.LOG = '/logs'` to `src/constants/server.ts` if not already defined (or use the string directly)

**File:** `src/pages/settings/index.tsx`

- Add a `Remote Logs` toggle (on/off) using the existing `ToggleGroup` pattern from the file
- Bind to `useSettingsStore` `remoteLogs` / `setRemoteLogs`
- Place it near the connection settings section with a short label: "Remote Logs — fetch logs from device over network (for Android/iOS)"

---

## Critical Files

| File | Change |
|---|---|
| `src-lua/feather/init.lua` | `mode` config, deferred socket require, disk-mode guard in `init` and `update` |
| `src-lua/feather/server_utils.lua` | `buildTextResponse`, `GET /logs` early-return handler |
| `src/hooks/use-logs.ts` | `lineOffsetRef`, incremental read, remote fetch branch, concat instead of `unionBy` |
| `src/store/settings.ts` | `remoteLogs` state + action |
| `src/pages/settings/index.tsx` | Remote logs toggle UI |
| `src/constants/server.ts` | Add `LOG = '/logs'` route constant if missing |

---

## Verification

**Disk mode:**
1. Init Feather with `{ debug = true, mode = "disk" }` — confirm no socket error, `.featherlog` is written
2. Init with no `mode` key — confirm existing socket behavior unchanged

**GET /logs:**
1. `curl http://localhost:4004/logs` against a running game — confirm `text/plain` response with raw log lines
2. Toggle `remoteLogs` on in settings → Logs page populates without touching local filesystem

**Incremental reading:**
1. Open a 46k-line log; on second and subsequent polls, confirm `newLines` count is low (only new lines) — add a dev `console.log` during testing
2. Press Clear — confirm offset resets to 0, log view clears
3. Load a different file — confirm offset resets to 0, new file read from start
