# Runtime Snapshot

Runtime Snapshot is a small live dashboard for the current Feather session. It is also a reference plugin for the declarative `feather.ui` renderer.

Runtime Snapshot is opt-in and disabled by default because its dashboard is diagnostic rather than required for normal debugging. When enabled, its automatic live refresh is capped to a low-frequency push interval so the plugin does not add a steady one-second hitch to connected games. Manual refresh requests still return a fresh snapshot immediately.

It shows:

- FPS, uptime, frame count, and memory usage
- WebSocket, debugger, and asset preview status
- Registered plugins and their current enabled/disabled state
- Basic runtime environment details

The plugin uses `feather.ui.render()` and UI primitives such as `panel`, `row`, `badge`, `button`, `tabs`, and `table`.
