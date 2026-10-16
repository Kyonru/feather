# Tauri And Protocol

## Tauri layer overview

The desktop app has three layers:

```
React (apps/inspector/src/)  ←→  Tauri bridge  ←→  Rust (apps/inspector/src-tauri/)
                                          ↕
                                    WebSocket server
                                          ↕
                                    Lua runtime (game)
```

Rust source lives in `apps/inspector/src-tauri/src/`:

- `ws_server.rs` — axum WebSocket server, auth handshake, session lifecycle, message relay.
- `lib.rs` — Tauri commands exposed to React; starts the WS server on app init.
- `cli_status.rs` — Tauri commands for detecting CLI version and project status.
- `main.rs` — binary entry point.

## Tauri events (Rust → React)

The WS server emits Tauri events after auth succeeds:

| Event | Payload | When |
|---|---|---|
| `feather://session-start` | `session_id: String` | Game connected and auth passed |
| `feather://session-end` | `session_id: String` | Game disconnected |
| `feather://message` | JSON string | Text message from game |
| `feather://binary` | `{ _session, bytes }` | Binary message from game |

React listens via `@tauri-apps/api/event` `listen()` inside `apps/inspector/src/hooks/use-ws-connection.ts`. Do not add new event names without a matching listener.

## Tauri commands (React → Rust)

Called via `invoke()` from `@tauri-apps/api/core`:

| Command | Purpose |
|---|---|
| `send_command` | Push a JSON command from desktop → game |
| `set_app_id` | Update the expected appId the server validates against |
| `get_active_sessions` | Return list of active session IDs |
| `get_local_ips` | Return LAN IPv4 addresses for mobile pairing |
| `get_cli_status` | Detect installed CLI path and version |
| `get_cli_project_status` | Detect project init state |
| `open_source_location` | Open a file path in VS Code |

## Auth handshake

The Rust server performs auth before emitting `session-start`. No game data reaches React until auth succeeds. `__DANGEROUS_INSECURE_CONNECTION__` bypasses the appId check and is an explicit escape hatch; the Rust server gates on an empty appId string.

This is a hard invariant: do not emit `feather://session-start`, `feather://message`, or `feather://binary` before the nonce/appId handshake has passed.

## Relay pattern

Keep Rust as the native/session relay unless the task genuinely needs native capability:

- Rust owns the WebSocket server, auth, session registry, binary/text forwarding, and small native commands.
- React owns UI state, command construction, rendering, and user workflows.
- Lua owns runtime data collection, plugin lifecycle, and game-side command handling.

Use the existing `WsEventSink` testing seam for WebSocket server behavior. Add Rust tests for auth, lifecycle, binary forwarding, and session cleanup when touching `ws_server.rs`.

## When to touch the Rust layer

Most game protocol changes only need Lua runtime + React changes — the Rust layer is a transparent relay. Touch `apps/inspector/src-tauri/` when:

- A new Tauri command is needed (new React → Rust → native capability).
- A new Tauri event name is needed (new Rust → React push path).
- Auth or session lifecycle behavior needs to change.
- WS server port, binary/text framing, or session management changes.

After changing Rust code, `pnpm run inspector:tauri` rebuilds automatically. For production, `pnpm run tauri build` produces the full desktop app.

## Adding a protocol feature

- Define the Lua payload shape, React consumer, and any Rust relay behavior together so session and auth assumptions stay coherent.
- Keep Rust as a relay unless the feature needs native access or changes auth/session lifecycle.
- Do not emit new game data before WebSocket auth succeeds.
- Add listener handling in `apps/inspector/src/hooks/use-ws-connection.ts` for any new Tauri event names.
- Add Rust tests for auth, lifecycle, binary forwarding, or session cleanup when touching `ws_server.rs`.
- Add Lua e2e plus desktop Playwright coverage when the protocol change affects a visible workflow.
- Update protocol/config docs and `CHANGELOG.md` for user-visible payload, auth, or compatibility changes.

## Showcase app

`apps/showcase/` is a standalone browser-only build (no Tauri, no WS) of Feather Studio. It has no page code: `apps/showcase/src/main.tsx` imports Studio's web mount from `apps/studio/src/showcase/`. Its Vite and Playwright configs live in `apps/showcase/`.

Showcase-relevant e2e tests live in `apps/showcase/e2e/showcase.spec.ts`. Run with `pnpm run test:showcase:e2e`.

Do not add Tauri API calls or WS-dependent code to showcase components.
