# Feather 🪶 — Debug & Inspect Tool for LÖVE (love2d)

Feather is a real-time debugging and inspection tool for [LÖVE](https://love2d.org) games — like Flipper or React DevTools, but for your game. Inspired by [LoveBird](https://github.com/rxi/lovebird).

**[📖 Documentation](https://kyonru.github.io/feather)** · [Releases](https://github.com/Kyonru/feather/releases) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

---

## Features

- 📜 **Live log viewer** — See `print()` output instantly in the app.
- 🔍 **Variable inspection** — Watch values update in real-time.
- 🚨 **Error capturing** — Automatically catch and display errors.
- 📸 **Screenshots & GIF capture** — Capture and record via the built-in plugin.
- 🔌 **Plugin system** — +18 built-in plugins + custom ones. Server-driven UI: plugins define their actions in Lua, the desktop renders them automatically.
- 📱 **Multi-session support** — Connect multiple games simultaneously.
- 📲 **Mobile debugging** — Auto-detected local IP in Settings with copyable connection string.
- 💻 **Console / REPL** — Execute Lua code in the running game (opt-in, requires `apiKey`).
- 🐛 **Step Debugger** — Breakpoints, step over/into/out, call stack, local variable inspection.
- 📁 **Log file viewer** — Open `.featherlog` files for offline inspection.
- 🖥️ **CLI-first setup** — `feather init`, `feather run`, and `feather remove` manage the debugger lifecycle.
- ⚡ **Guarded in-game setup** — Generated imports load only when `USE_DEBUGGER` is enabled.

---

![log tab](docs/images/logs.png)
![performance tab](docs/images/performance.png)
![observability tab](docs/images/observable.png)

---

## Quick Start

Install the CLI, initialize your game, then run with `USE_DEBUGGER=1` when you want Feather loaded:

```sh
npm install -g feather-cli
feather init --mode cli
feather run path/to/my-game
```

For games running in an external device (iOS, Android, SteamDeck, etc), you need to include feather in the source code. Checkout the documentation for good practices and worfklow recommendations.

```sh
feather init path/to/my-game
USE_DEBUGGER=1 love path/to/my-game
```

`feather init` creates a `feather.config.lua` file for project settings:

```lua
return {
  sessionName = "My Game",
  -- For phones, tablets, Steam Deck, or another computer, set this to
  -- the desktop app machine's LAN IP.
  -- host = "192.168.1.50",
  -- include = { "console" },
  -- exclude = { "hump.signal", "lua-state-machine" },
}
```

Generated code always uses `DEBUGGER` safely:

```lua
function love.update(dt)
  if DEBUGGER then
    DEBUGGER:update(dt)
  end
end
```

For production cleanup:

```bash
feather remove --dry-run
feather remove --yes
```

Then download the desktop app from the [releases page](https://github.com/Kyonru/feather/releases).

---

## Documentation

- [Installation](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Usage](docs/usage.md) — observers, logging, console, step debugger
- [Plugins](docs/plugins.md)
- [Recommendations](docs/recommendations.md) — security, performance, release builds

---

## Built-in Lua Dependencies

- [Hump Class](https://github.com/vrld/hump/blob/master/class.lua)
- [Inspect](https://github.com/kikito/inspect.lua)
- [json.lua](https://github.com/rxi/json.lua)
- [log.lua](https://github.com/rxi/log.lua)
- [ws.lua](https://github.com/flaribbit/love2d-lua-websocket)

---

## Credits

- [LoveBird](https://github.com/rxi/lovebird) by rxi — original inspiration
- [Love-Dialogue](https://github.com/Miisan-png/Love-Dialogue) by Miisan-png — plugin system reference
- [Flipper](https://github.com/facebook/flipper) by Facebook — UI/tooling patterns
- [HUMP](https://github.com/vrld/hump), [anim8](https://github.com/kikito/anim8), [flux](https://github.com/rxi/flux), [bump.lua](https://github.com/kikito/bump.lua), [lua-state-machine](https://github.com/kyleconroy/lua-state-machine)

---

## License

DISCLAIMER: The license only applies to products that directly replicate the logic/purpose of this tool. It does not apply to games created using it as a dev tool.

See [LICENSE.md](LICENSE.md).

## AI Usage

The architecture and planing of this tool has been made by me. Once i had the plugin system in places, using AI for autocompletion has allowed for fast plugin development. Code is curated and carefully revised by me. While I don't think there is need to explain this, i understand some people might not feel comfortable with AI in any form. I respect that.
