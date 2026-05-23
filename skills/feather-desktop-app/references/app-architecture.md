# App Architecture

## Entry points

- `src/main.tsx`: React entry.
- `src/providers.tsx`: app providers.
- `src/router.tsx`: route definitions.
- `src/showcase/main.tsx`: showcase entry.

## Pages

Pages live under `src/pages/` and map to desktop app workflows:

- session and session tabs
- logs
- observability
- performance
- assets
- console
- debugger
- plugins
- time travel
- session replay
- particle system playground
- shader graph
- settings
- about

Prefer page-specific code inside the page folder, shared UI in `src/components/`, and protocol/data behavior in hooks or stores.

## State and data flow

- Hooks in `src/hooks/` read app/session/protocol state and expose page-friendly data.
- Stores in `src/store/` hold cross-page state such as sessions, settings, debugger state, shader graph state, and config.
- `src/lib/send-command.ts` is the normal command path back to a connected game.
- Constants in `src/constants/` define protocol/server values.
- `src/hooks/use-ws-connection.ts` is the central event router from Tauri events into React Query caches and stores.

## WebSocket model

The desktop app runs the server that games connect to. The game authenticates, then pushes logs, observers, plugin data, performance, assets, debugger events, and replay data.

Keep connection/auth/session concerns out of leaf UI components where practical. Leaf components should usually receive already-shaped data and callbacks.

Binary payloads are resolved centrally: JSON messages register `feather-binary:<id>` placeholders, and later `feather://binary` events replace those placeholders with object URLs or decoded text. Pages should not implement their own binary queue.

## Adding a desktop feature

- Start from the nearest existing page, hook, store, or component with the same workflow shape.
- Keep protocol/session data in hooks, stores, or the WebSocket event router; pass shaped data into leaf components.
- Use `src/lib/send-command.ts` for game commands instead of ad hoc WebSocket calls from UI components.
- Keep browser/showcase compatibility in shared components by routing desktop-only behavior through Tauri utility wrappers.
- Add empty, loading, disconnected, error, and permission-denied states where the workflow can encounter them.
- Add Playwright app e2e coverage for desktop workflows and showcase e2e coverage for browser-only creative tools.
- Update the canonical docs source for the workflow and expose it through `docs/` by symlink when practical.
- Update `CHANGELOG.md` for user-visible UI, settings, protocol, Tauri, or e2e coverage changes.

## Tauri boundary

Use existing utility wrappers for:

- opening URLs and paths
- file dialogs
- filesystem reads/writes
- platform checks

This keeps browser/showcase behavior and desktop-only behavior easier to separate.

The showcase app must stay browser-only. Avoid direct Tauri calls or WebSocket assumptions in shared components used by `src/showcase/`.
