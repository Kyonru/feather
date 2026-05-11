# Hot Reload

Feather Hot Reload lets the desktop app send Lua source for a specific module over the existing WebSocket connection, then replace that module in the running game.

> [!WARNING]
> Hot reload is controlled remote code execution. Keep it disabled by default, use a narrow allowlist, and never enable it in production builds.

> [!CAUTION]
> Do not copy the example config into a real project without changing the allowlist. Every allowed module can be replaced by whoever can send commands to that Feather session.

## Before Enabling

Only enable hot reload when all of this is true:

- You are running a trusted development build.
- The Feather desktop app and game are on a trusted local machine or trusted LAN.
- `allow` names only the modules you intend to edit.
- `persistToDisk` is off unless you deliberately want patches written into the LÖVE save directory.
- You have explicitly installed and included the opt-in `hot-reload` plugin.
- You have a clear release path where the `hot-reload` plugin is excluded or the Feather integration is removed.

## Enable It

Configure it from `feather.config.lua`:

```lua
return {
  debug = true,

  -- Hot reload is an opt-in plugin. Without this include, Feather ignores
  -- cmd:hot_reload messages even if debugger.hotReload is configured.
  include = { "hot-reload" },

  debugger = {
    enabled = true,
    hotReload = {
      -- Development-only remote code execution. Keep this false unless you
      -- understand that Feather can replace allowlisted Lua modules at runtime.
      enabled = true,

      -- Prefer exact modules. Avoid broad patterns unless you really mean it.
      allow = {
        "game.player",
        "game.enemy",
        "game.systems.*",
      },

      deny = {
        "main",
        "conf",
        "feather.*",
      },

      persistToDisk = false,
      clearOnBoot = false,
      requireLocalNetwork = true,
      showOverlay = true,
      toastDuration = 2.5,
    },
  },
}
```

For manual plugin registration, require and register the plugin explicitly:

```lua
local FeatherPluginManager = require("feather.plugin_manager")
local HotReloadPlugin = require("plugins.hot-reload")

DEBUGGER = FeatherDebugger({
  debug = true,
  debugger = { enabled = true },
  plugins = {
    FeatherPluginManager.createPlugin(HotReloadPlugin, "hot-reload", {
      enabled = true,
      allow = { "game.player" },
      deny = { "main", "conf", "feather.*" },
    }),
  },
})
```

> [!IMPORTANT]
> Installing Feather core alone does not enable hot reload. The `hot-reload` plugin must be installed and registered, which keeps the remote-code-loading path out of normal sessions.

| Field                 | Default | Description                                                                 |
| --------------------- | ------- | --------------------------------------------------------------------------- |
| `enabled`             | `false` | Enables hot reload commands for the session.                                |
| `allow`               | `{}`    | Module allowlist. Supports exact names and `prefix.*` patterns.             |
| `deny`                | `{}`    | Explicit denylist. `main`, `conf`, and `feather.*` are always denied.        |
| `persistToDisk`       | `false` | Writes hot patches to `.feather/hot/<module>.lua` in LÖVE's save directory. |
| `clearOnBoot`         | `false` | Clears persisted hot patches when Feather starts.                           |
| `requireLocalNetwork` | `true`  | Accepts reload commands only when the configured Feather host is local/LAN.  |
| `showOverlay`         | `true`  | Draws a temporary in-game toast when hot reload succeeds, fails, or restores. |
| `toastDuration`       | `2.5`   | Seconds the in-game hot reload toast remains visible.                       |

> [!IMPORTANT]
> `allow = { "game.*" }` is convenient, but a smaller list is safer. Prefer only the modules you are actively editing.

> [!WARNING]
> `persistToDisk = true` writes patched Lua source into `.feather/hot` in the save directory. That is useful for mobile development, but it also means a patch can survive an app restart until restored or cleared.

## Use It

1. Start the game with Feather enabled.
2. Open **Debugger**.
3. Open the game source folder if Feather cannot auto-detect it.
4. Select a `.lua` file from the file tree.
5. Press **Reload**.

The **Watch** toggle polls the selected file and reloads it when the source changes. It intentionally watches only the selected module so changes are explicit and easy to reason about.

> [!TIP]
> A file path like `game/player.lua` maps to the Lua module `game.player`. A folder entry like `game/systems/init.lua` maps to `game.systems`.

## Example

From the repository root:

```bash
love src-lua --hot-reload
```

Then open **Debugger**, select `example/hot_reload/gameplay.lua`, edit the file, and press **Reload**. You can also enable **Watch** to reload the selected module whenever the file changes.

> [!NOTE]
> The example allowlist contains exactly one module: `example.hot_reload.gameplay`. That narrow shape is intentional.

## Rollback

Before replacing a module, Feather keeps the original `package.loaded[module]` value. Press **Restore** in the Debugger toolbar to restore all modules replaced by hot reload and clear persisted patches.

If a new module has a syntax error, runtime error, or failing migration hook, Feather restores the previous module immediately and reports the error in the app.

## Migration Hook

Reloaded modules can expose `__feather_reload`:

```lua
local Player = {}

function Player.__feather_reload(newModule, oldModule)
  newModule.instances = oldModule and oldModule.instances or {}
end

return Player
```

Use this for state migration, metatable updates, cache rebuilds, or system rebinding.

## Mobile And Remote Devices

Hot reload works on mobile and handheld devices because Feather sends source code through WebSocket. When `persistToDisk = true`, patched modules are written to LÖVE's save directory using `love.filesystem.write`.

> [!NOTE]
> This does not modify the application bundle. Persisted patches live under `.feather/hot` in the save directory and are meant for development sessions only.

> [!IMPORTANT]
> For mobile, Steam Deck, or second-computer workflows, only use hot reload on a trusted private network. Do not expose Feather's WebSocket port to public or shared networks.

## Limits

Hot reload does not support native libraries, arbitrary filesystem writes, unrestricted Lua execution, reloading Feather internals, or replacing `main.lua` / `conf.lua`.
