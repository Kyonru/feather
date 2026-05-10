# Runtime Snapshot

Runtime Snapshot is a small live dashboard for the current Feather session. It is also a reference plugin for the declarative `feather.ui` renderer.

It shows:

- FPS, uptime, frame count, and memory usage
- WebSocket, debugger, and asset preview status
- Registered plugins and their current enabled/disabled state
- Basic runtime environment details

The plugin uses `feather.ui.render()` and UI primitives such as `panel`, `row`, `badge`, `button`, `tabs`, and `table`.
