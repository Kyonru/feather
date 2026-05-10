# Feather CLI

The Feather CLI lets you run and debug Love2D games **without modifying your game code**. Running a game through the CLI injects Feather automatically at the process level — no `require("feather.auto")` needed.

```bash
feather run path/to/my-game
```

---

## Installation

```bash
npm install -g feather-cli
```

Requires **Node.js 18+** and **love2d** installed on your system.

---

## How injection works

`feather run` creates a temporary shim directory and passes it to love2d as the game source:

```
/tmp/feather-{uuid}/
  conf.lua     ← delegates to your game's conf.lua (window title, modules, etc.)
  main.lua     ← loads feather.auto, then runs your game's main.lua
  feather/     ← symlink to the bundled feather library
  plugins/     ← symlink to the bundled plugins
```

Your game's directory is:

1. Added to Lua's `package.path` so all `require()` calls resolve correctly.
2. Mounted into `love.filesystem` so assets (images, audio, data files) are accessible.
3. Loaded via `loadfile()` to avoid a conflict with the shim's own `main.lua`.

Your game code runs exactly as normal — it just has Feather already active.

---

## Commands

### `feather run <game-path>`

Inject Feather into a Love2D game and run it.

```bash
feather run .                              # run game in current directory
feather run path/to/my-game               # run from an explicit path
feather run . --session-name "RPG"        # custom name in the desktop session tab
feather run . --no-plugins                # feather core only, no plugins
feather run . --love /usr/bin/love        # override love2d binary
feather run . --plugins-dir ./my-plugins  # use a custom plugins directory
feather run . -- --level dev              # pass args through to the game
```

**Options:**

| Option                  | Description                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `--love <path>`         | Path to the love2d binary. Defaults to auto-detect (see [Binary detection](#binary-detection)). |
| `--session-name <name>` | Custom session name shown in the Feather desktop app.                                           |
| `--no-plugins`          | Load feather core only — no plugins registered.                                                 |
| `--config <path>`       | Explicit path to a `feather.config.lua` file.                                                   |
| `--feather-path <path>` | Use a local feather install instead of the CLI's bundled copy.                                  |
| `--plugins-dir <path>`  | Use a custom plugins directory instead of the CLI's bundled plugins.                            |

Use `--` to separate Feather CLI options from arguments intended for the LÖVE game. Everything after `--` is passed to `love` after the generated shim path.

**Project config file:**

If a `feather.config.lua` exists in the game directory, it is read automatically and merged into the feather setup. See [feather.config.lua](#featherconfiglua).

---

### `feather init [dir]`

Initialize Feather in a Love2D project. Downloads the feather library and plugins from GitHub.

```bash
feather init                         # initialize in current directory
feather init path/to/my-game        # initialize in a specific directory
feather init --no-plugins           # install core only, skip plugins
feather init --plugins screenshots,profiler  # install specific plugins only
feather init --mode cli             # create config only; use feather run
feather init --mode auto            # install and patch main.lua with feather.auto
feather init --mode manual          # install but leave main.lua untouched
feather init --branch v0.7.0        # download a specific release
feather init --install-dir lib/feather  # install like FEATHER_DIR=lib/feather
```

**What it does:**

By default, `feather init` opens an interactive terminal picker powered by Ink:

| Mode     | Behavior                                                                      |
| -------- | ----------------------------------------------------------------------------- |
| `cli`    | Creates `feather.config.lua` only. Run with `feather run .`.                  |
| `auto`   | Downloads core/plugins and patches `main.lua` with `require("feather.auto")`. |
| `manual` | Downloads core/plugins and leaves `main.lua` untouched for custom setup.      |

Auto and manual mode use the same project layout as `scripts/install-feather.sh`:

```
my-game/
  feather/init.lua
  feather/plugins/screenshots/init.lua
  feather/plugins/hump/signal/init.lua
  main.lua
```

If you choose `lib/feather` as the install directory, the Lua module becomes `lib.feather`, so auto mode patches `main.lua` with:

```lua
require("lib.feather.auto")
```

The interactive flow asks for:

- session name
- install directory, matching `FEATHER_DIR`
- Git branch or tag, matching `FEATHER_BRANCH`
- whether to install built-in plugins, matching `FEATHER_PLUGINS`
- optional plugins to force-enable, such as Console, Physics Debug, and Timer Inspector
- plugins to skip/exclude, matching `FEATHER_SKIP_PLUGINS`; Console, HUMP Signal, and Lua State Machine start preselected like the shell installer defaults
- advanced connection/runtime options from `feather.config.lua`, including host/port, socket vs disk mode, observers, logging, debugger, asset previews, capabilities, and binary threshold
- a strong API key when Console is included

If the terminal is non-interactive, or `--yes` is used, Feather defaults to `auto`.

All modes create a `feather.config.lua` template if one doesn't exist.

Manual mode prints an integration snippet that matches the selected install directory and plugin list. For example, when installing into `lib/feather` with `screenshots` and `runtime-snapshot`:

```lua
local FeatherDebugger = require("lib.feather")
local FeatherPluginManager = require("lib.feather.plugin_manager")
local ScreenshotsPlugin = require("lib.feather.plugins.screenshots")
local RuntimeSnapshotPlugin = require("lib.feather.plugins.runtime-snapshot")

DEBUGGER = FeatherDebugger({
  debug = true,
  sessionName = "My Game",
  plugins = {
    FeatherPluginManager.createPlugin(ScreenshotsPlugin, "screenshots", {}),
    FeatherPluginManager.createPlugin(RuntimeSnapshotPlugin, "runtime-snapshot", {}),
  },
})

function love.update(dt)
  if DEBUGGER then DEBUGGER:update(dt) end
end
```

**Options:**

| Option              | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `--branch <branch>` | GitHub branch or tag to download from (default: `main`).      |
| `--install-dir <path>` | Install directory for auto/manual modes (default: `feather`). |
| `--no-plugins`      | Skip plugin installation.                                     |
| `--plugins <ids>`   | Comma-separated list of plugin IDs to install (default: all). |
| `--mode <mode>`     | Setup mode: `cli`, `auto`, or `manual`.                       |
| `-y, --yes`         | Skip confirmation prompts.                                    |

---

### `feather doctor [dir]`

Check the environment and project health.

```bash
feather doctor        # check current directory
feather doctor path/to/my-game
```

**Example output:**

```
Feather environment check

  ✔ Node.js >= 18  v22.0.0
  ✔ love2d found  /Applications/love.app/Contents/MacOS/love  (11.5)
  ✔ love2d project (main.lua)  /path/to/my-game
  ✔ feather library installed  /path/to/my-game/feather
  ✔ plugins directory  /path/to/my-game/plugins
  ✔ feather.config.lua
  ✔ Feather desktop app (port 4004)  connected
```

---

### `feather update [dir]`

Update the Feather core library in a project.

```bash
feather update                       # update in current directory
feather update path/to/my-game
feather update --branch v0.7.1      # update to a specific version
```

This re-downloads all `core:` files listed in `manifest.txt`. Plugin files are not touched — use `feather plugin update` for those.

---

### `feather plugin`

Manage Feather plugins in a project.

#### `feather plugin list [dir]`

List installed plugins.

```bash
feather plugin list
```

```
Installed plugins (12)

  screenshots              1.0.0    Capture screenshots and record GIFs
  profiler                 1.0.0    Function-level CPU profiling
  entity-inspector         1.0.0    ECS entity browser
  ...
```

#### `feather plugin install <id>`

Download and install a plugin.

```bash
feather plugin install console
feather plugin install time-travel --branch main
feather plugin install console --install-dir lib/feather
```

#### `feather plugin remove <id>`

Remove an installed plugin.

```bash
feather plugin remove hump.signal
```

#### `feather plugin update [id]`

Update a plugin, or all installed plugins if no ID is given.

```bash
feather plugin update              # update all installed plugins
feather plugin update profiler     # update a specific plugin
```

Use `--install-dir <path>` with plugin commands when the project was initialized outside the default `feather/` directory.

---

## feather.config.lua

Place a `feather.config.lua` in your game directory to configure the Feather injection without touching command-line flags. `feather run` reads it automatically.

```lua
-- feather.config.lua
return {
  sessionName = "My RPG",

  -- Force-enable opt-in plugins (e.g. the REPL console)
  include = { "console" },

  -- Remove plugins you don't need
  exclude = { "hump.signal", "lua-state-machine" },

  -- Per-plugin option overrides
  pluginOptions = {
    screenshots = { fps = 60, gifDuration = 10 },
    ["memory-snapshot"] = { autoInterval = 5 },
  },

  -- Connect to a remote desktop app (e.g. on another machine)
  -- host = "192.168.1.42",
}
```

All `feather.auto.setup()` options are supported. Command-line flags (`--session-name`, etc.) take precedence over the config file.

---

## Binary detection

`feather run` finds the love2d binary in this order:

1. `--love <path>` flag
2. `LOVE_BIN` environment variable
3. Platform defaults:
   - **macOS:** `/Applications/love.app/Contents/MacOS/love`
   - **Windows:** `%PROGRAMFILES%\LOVE\love.exe`, `%LOCALAPPDATA%\LOVE\love.exe`
   - **Linux:** `love` or `love2d` from PATH

---

## Examples

### Run any game with zero setup

```bash
# Clone any love2d game and run it with Feather
git clone https://github.com/some/game.git
feather run game/
```

The Feather desktop app will show a new session as soon as the game connects.

### Use the bundled feather vs a local install

By default, `feather run` uses the feather library and plugins bundled inside the CLI package. If your project has feather installed locally (via `feather init`), the CLI prefers that:

```
my-game/
  feather/init.lua   ← detected → local install is used
  feather/plugins/
  main.lua
```

To point at a different feather build or plugins directory:

```bash
feather run . --feather-path ../feather-dev
feather run . --plugins-dir ../my-custom-plugins
```

`--plugins-dir` takes precedence over the bundled plugins and any game-local `plugins/` directory.

### CI / headless mode

`feather run` exits with love2d's exit code, making it suitable for CI workflows:

```yaml
- name: Run game smoke test
  run: feather run . --no-plugins
  env:
    LOVE_BIN: /usr/bin/love
```

### Alias for fast iteration

Add a shell alias so `fr` runs from any game directory:

```bash
alias fr='feather run .'
```

---

## Comparison with manual setup

|                      | `feather run` | Manual (`require("feather.auto")`) |
| -------------------- | ------------- | ---------------------------------- |
| Game code changes    | None          | Add require + update call          |
| Works on any game    | Yes           | Only games you've modified         |
| `feather.config.lua` | Supported     | Supported                          |
| Plugin management    | Via CLI       | Manual download                    |

<!-- | Hot reload | love2d restarts via CLI | Native | -->

Both approaches are compatible — a game that already has `require("feather.auto")` can still be launched with `feather run` (Feather checks the `DEBUGGER` global and skips double-initialization).
