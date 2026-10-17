# Session

The **Session** page is the best first stop when a game does not look connected, a plugin is unavailable, or Feather appears to be doing more runtime work than expected.

## What It Shows

Session summarizes the active game connection:

- connection state, session id, runtime version, and API version;
- project roots, game path, and configured host/port;
- auth status, desktop App ID, Console API-key status, and insecure-mode warnings;
- enabled, disabled, incompatible, or missing plugins;
- debugger, Hot Reload, package lockfile, and recent performance signals.

The **Recommended Next Actions** panel points to the next useful place to go, such as Settings for security/API-key issues, Debugger for paused breakpoints, Performance for frame hitches, or package guidance when no lockfile is available.

## Connection Health

Use CLI-managed runs for the most reliable connection lifecycle:

```bash
feather init path/to/my-game
feather run path/to/my-game
```

The game connects to the desktop WebSocket server, completes the App ID challenge, then sends session/config data. If the game restarts, Feather should replace the old live session with the new one and clear stale **Connecting game** entries.

If a session stays stuck connecting:

- confirm the desktop app is open and listening on the configured port;
- check `appId` in `feather.config.lua` against **Settings -> Security -> Desktop App ID**;
- check the game log for `auth:fail`, config errors, or plugin capability warnings;
- open **Session** and use the refresh/reconnect actions before changing game code.

## Suspend And Resume

Use the pause button beside the active session tab to temporarily suspend Feather runtime work inside the connected game. The socket stays open so the desktop can resume the runtime without forcing a game restart.

While suspended, Feather stops normal sampling, plugin payload pushes, asset work, observer serialization, and most preview sync. Explicit clear/hide actions remain available for active creative previews, and opt-in overlays that are designed to run while suspended may continue using their last payload.

Resume the session when you need fresh data, live preview sync, debugger updates, or active profiler captures.

## Session Switching

When multiple games are connected, each one gets a session tab. Switching sessions changes the active data source for Logs, Performance, Debugger, Assets, Observability, Console, plugins, and creative tools.

If a page looks stale after switching, open the relevant page again or use its refresh action. Feather sends runtime interest for the active panel so expensive payloads wake up only when the page needs fresh data.

