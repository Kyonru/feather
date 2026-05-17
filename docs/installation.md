# Installation

## CLI (Recommended — no game changes needed)

Install the Feather desktop app, install the `@kyonru/feather` npm package globally, then use the CLI for desktop, web, mobile, and packaged desktop workflows:

```bash
npm install -g @kyonru/feather
feather init path/to/my-game
feather run path/to/my-game
```

A new session tab appears in the Feather desktop app automatically. No `require` calls, no `DEBUGGER:update(dt)` — the CLI handles runtime injection and setup.

> [!NOTE]
> Use plain `feather run` for local desktop iteration where the CLI launches LÖVE directly. Use `feather run --target web|android|ios` when you want the CLI to build, serve, install, or launch a configured platform target.

### Vendors and Platform Runs

Add local LÖVE runtimes/templates once per project, then run or build those targets:

```bash
feather build vendor add web --dir path/to/my-game
feather run path/to/my-game --target web

feather build vendor add android --dir path/to/my-game
feather run path/to/my-game --target android

feather build vendor add ios --dir path/to/my-game
feather run path/to/my-game --target ios

feather build vendor add all --dir path/to/my-game
```

`feather build vendor add all` also installs desktop runtime vendors for Windows, macOS, Linux, and SteamOS packaging. Vendor fetching does not install Android SDK, JDK, Xcode, NSIS, or signing assets.

Check all platform readiness in one pass:

```bash
feather doctor path/to/my-game --build-target all
```

Common run and build commands:

```bash
feather run path/to/my-game --target web
feather run path/to/my-game --target android
feather run path/to/my-game --target ios

feather build love --dir path/to/my-game
feather build android --dir path/to/my-game --release
feather build ios --dir path/to/my-game --release
feather build windows --dir path/to/my-game
feather build macos --dir path/to/my-game
feather build linux --dir path/to/my-game
feather build steamos --dir path/to/my-game
```

Release builds do not auto-embed Feather's debugger runtime. If you used a managed init mode while experimenting, Feather can clean up its own generated blocks/files before packaging:

```bash
feather remove path/to/my-game --dry-run
feather remove path/to/my-game --yes
```

See [CLI](cli.md) for all commands, flags, and `feather.config.lua` options.

For CI or release scripts that need a security-only JSON report:

```bash
feather doctor path/to/my-game --security --json
```

---

## Advanced: Install Script

The install script is an advanced/manual path. Prefer the CLI above unless you intentionally want to vendor the Lua runtime yourself.

Download the core library and all plugins with a single command:

```bash
curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh | bash
```

This creates a `feather/` directory (core library) and a `plugins/` directory (all built-in plugins) in your current folder.

**Customize with environment variables:**

```bash
# Install into a custom directory
FEATHER_DIR=lib/feather bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Download from a specific branch or tag
FEATHER_BRANCH=v0.6.0 bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Skip certain plugins
FEATHER_SKIP_PLUGINS="network-inspector,memory-snapshot" bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Skip all plugins (core only)
FEATHER_PLUGINS=0 bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Include console (opt-in, excluded by default)
FEATHER_INCLUDE_CONSOLE=1 bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Include hot reload (opt-in, development-only remote code execution)
FEATHER_INCLUDE_HOT_RELOAD=1 bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"
```

## Advanced: Direct Download

1. Go to the [releases page](https://github.com/Kyonru/feather/releases) and download `feather-x.x.x.zip`.
2. Unzip and copy the `feather/` folder into your project, e.g. `lib/feather/`.
3. Require it by path:

```lua
local Feather = require "lib.feather"
```

## Advanced: LuaRocks

```bash
luarocks install feather
```

Then at the top of `main.lua`, before any `require` calls:

```lua
require("luarocks.loader")
local Feather = require("feather")
```

Or install into a local tree:

```bash
luarocks install feather --tree ./lua_modules
```

```lua
package.path = package.path .. ";./lua_modules/share/lua/5.1/?.lua"
local Feather = require("feather")
```

---

## Updating

### Using the CLI

If you installed via `@kyonru/feather`, run:

```bash
feather update
```

This re-downloads the feather core files from GitHub into your project. To update a specific plugin:

```bash
feather plugin update screenshots
```

### Using the install script

Re-run the script with the target version tag — it overwrites existing files in place:

```bash
# Update to a specific release
FEATHER_BRANCH=v0.7.0 bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"

# Update to the latest commit on main
bash -c "$(curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-feather.sh)"
```

> [!NOTE]
> `FEATHER_BRANCH` accepts any Git ref: a tag (`v0.7.0`), branch (`main`, `next`), or a full commit SHA.

### Manual update

1. Download the zip from the [releases page](https://github.com/Kyonru/feather/releases).
2. Unzip and copy the `feather/` folder over your existing one.
3. Check [CHANGELOG.md](https://github.com/Kyonru/feather/blob/main/CHANGELOG.md) for breaking changes.

---

## Custom Paths

### `FEATHER_PATH`

Feather uses the global `FEATHER_PATH` to resolve its internal `require` calls. It is set automatically when you `require "feather"`. You only need to set it manually if the `feather/` folder is outside Lua's `package.path`:

```lua
FEATHER_PATH = "lib.feather"
local Feather = require "lib.feather"
```

### `FEATHER_PLUGIN_PATH`

Tells `feather.auto` where to find built-in plugins. By default it mirrors `FEATHER_PATH`. Set it when the `plugins/` folder is installed somewhere separate from the core:

```lua
FEATHER_PATH        = "lib.feather."
FEATHER_PLUGIN_PATH = "lib.feather-plugins."
require("lib.feather.auto")
```

Both variables must end with a `.` when set manually and must be set **before** calling `require("feather.auto")`.

---

## Installing individual plugins

Add plugins to an existing installation without re-running the full installer:

```bash
# Install one plugin
bash install-plugin.sh screenshots

# Install several at once
bash install-plugin.sh screenshots profiler console

# Pipe directly from GitHub
curl -sSf https://raw.githubusercontent.com/Kyonru/feather/main/scripts/install-plugin.sh | bash -s -- screenshots profiler
```

Run without arguments to see the full list of available plugins:

```bash
bash install-plugin.sh
```

After installing, register the plugins in your manual setup:

```lua
require("feather.auto").setup({
  include = { "screenshots", "profiler" },
})
```
