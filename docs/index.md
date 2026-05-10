# Feather 🪶

**Real-time debug & inspect tool for [LÖVE (love2d)](https://love2d.org) games.**

Like Flipper or React DevTools, but for your game. Inspect logs, variables, performance metrics, and errors in real-time over a WebSocket connection — with a built-in plugin system, step debugger, and zero-config setup.

---

## Features

- 📜 **Live log viewer** — See `print()` output instantly in the app.
- 🔍 **Variable inspection** — Watch values update in real-time.
- 🚨 **Error capturing** — Catch and display errors automatically.
- 📸 **Screenshots & GIF capture** — Capture screenshots and record GIFs via the built-in plugin.
- 🔌 **Plugin system** — +18 built-in plugins + custom ones. Server-driven UI: plugins define their actions in Lua, the desktop renders them automatically.
- 📱 **Multi-session support** — Connect multiple games simultaneously, each gets its own session tab.
- 📲 **Mobile debugging** — Auto-detected local IP in Settings with copyable connection string.
- 💻 **Console / REPL** — Execute Lua code in the running game (opt-in, requires `apiKey`).
- 🐛 **Step Debugger** — Breakpoints, step over/into/out, call stack, and local variable inspection.
- 🖼️ **Asset inspector** — Browse loaded textures, fonts, and audio sources with previews, zoom, pan, and pixel grid.
- 📁 **Log file viewer** — Open `.featherlog` files for offline inspection.
- 🖥️ **CLI-first workflow** — `feather init`, `feather run`, and `feather remove` manage setup and cleanup.
- ⚡ **Guarded in-game setup** — Generated imports load only when `USE_DEBUGGER` is enabled.
- 📦 **Config file support** — `feather.config.lua` keeps project settings outside game code.

---

## Quick Start

> [!IMPORTANT]
> For quick local desktop iteration, you can also use `feather run path/to/my-game` without changing game code. For mobile, handhelds, and remote devices like Android, iOS, or Steam Deck, use the embedded library from `feather init --mode auto` so the game carries Feather with it on the device.

### Option A — CLI injection (no game-side changes)

```bash
npm install -g feather-cli
feather init path/to/my-game
feather run path/to/my-game
```

Feather is injected automatically. No `require` needed in the game. See [CLI](cli.md).

> [!NOTE]
> This is best for local desktop development where the CLI launches LÖVE directly.

### Option B — Managed in-game setup

```bash
npm install -g feather-cli
feather init path/to/my-game --mode auto
USE_DEBUGGER=1 love path/to/my-game
```

> [!IMPORTANT]
> Use this for mobile, handheld, and remote devices such as Android, iOS, Steam Deck, or a second computer. Those builds need the embedded Feather library because the CLI is not launching the game process on that device.

`feather init` creates `feather.config.lua`:

```lua
return {
  sessionName = "My RPG",
  -- Set to the desktop app machine's LAN IP for remote devices.
  host = "192.168.1.50",
  exclude = { "network-inspector" },
}
```

> [!TIP]
> The generated `main.lua` integration is guarded by `USE_DEBUGGER`, so Feather is not imported unless you opt in for a dev run.

When you access `DEBUGGER` in your own code, guard it:

```lua
function love.update(dt)
  if DEBUGGER then
    DEBUGGER:update(dt)
  end
end
```

Before shipping a production build:

```bash
feather remove --dry-run
feather remove --yes
```

---

## Documentation

- [CLI](cli.md) — Run games without touching their code, `feather run`, `feather init`, `feather doctor`
- [Installation](installation.md) — Download, install script, LuaRocks, custom paths
- [Configuration](configuration.md) — All config options, connecting, mobile debugging
- [Usage](usage.md) — Observers, logging, console / REPL, step debugger
- [Assets](assets.md) — Inspect loaded textures, fonts, audio, and configure the game root
- [Plugins](plugins.md) — Built-in plugins, plugin system, custom plugins
- [Recommendations](recommendations.md) — Security, performance, release builds

---

## Screenshots

![log tab](images/logs.png)
![performance tab](images/performance.png)
![observability tab](images/observable.png)
