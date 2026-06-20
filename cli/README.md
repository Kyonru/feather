# Feather CLI

The Feather CLI lets you run and debug LÖVE games **without modifying your game code**. Running a game through the CLI injects Feather automatically at the process level — no `require("feather.auto")` needed.

- Package: [`@kyonru/feather`](https://www.npmjs.com/package/@kyonru/feather)
- Command: `feather`
- Repo: [github.com/Kyonru/feather](https://github.com/Kyonru/feather)
- Documentation: [kyonru.github.io/feather](https://kyonru.github.io/feather/)

> [!NOTE]
> The npm package is scoped as `@kyonru/feather`, but the executable command is `feather`. npm creates that command from the package `bin` field.

```bash
feather run
feather run path/to/my-game
feather run path/to/my-game --target web
feather run path/to/my-game --target android
feather run path/to/my-game --target ios
```

> [!IMPORTANT]
> `feather run` launches desktop games directly. For web dev loops it builds and serves a local love.js artifact. For Android and iOS dev loops it builds the configured native template, installs the artifact, and launches it on a connected device or simulator.

---

## Installation

```bash
npm install -g @kyonru/feather
```

Requires **Node.js 18+** and **LÖVE** installed on your system.

For local development inside this repository:

```bash
npm install
npm run cli:build
npm run feather -- --help
```

`npm install` links the workspace package into `node_modules/@kyonru/feather` and exposes `node_modules/.bin/feather` for local CLI testing.

### Desktop CLI Backend

The Feather desktop app uses the CLI as its project backend for setup-oriented workflows. In packaged desktop builds, Feather ships a same-version `feather` CLI sidecar. Settings resolves the CLI in this order:

1. CLI path override from Settings.
2. Bundled desktop sidecar.
3. `feather` on `PATH`.
4. Common npm bin locations.

React does not import CLI TypeScript directly and the desktop does not expose a generic terminal. Settings → CLI & Project Actions sends typed requests to Tauri, Rust maps each action to fixed CLI argv, and mutating actions run a `--dry-run --json` preview before requiring confirmation.

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

### `feather create <project-name>`

Create a new Love2D project from a supported template and configure it for Feather CLI-managed development.

```bash
feather create awesome
feather create awesome --yes
feather create awesome --main --yes
feather create awesome --ref 0.1.2 --plugins screenshots,console
feather create awesome --packages anim8,bump --vendor-targets web,android
```

V1 supports only `Oval-Tutu/bootstrap-love2d-project`. By default, Feather resolves the template's latest GitHub release tag, clones that release, removes the sample game content, initializes a fresh git repo, configures Feather in CLI mode, and prints next steps.

Generated projects use a root `Makefile` as the main command surface:

```bash
make run
make doctor
make plugins
make packages
make vendor-list
```

The generated project keeps the template's build automation, workflows, tools, resources, and docs, while replacing the sample `game/main.lua`, removing `game/eyes`, rewriting `game/product.env`, adding Feather VS Code extension recommendations, and creating `game/feather.config.lua`.

**Options:**

| Option                       | Description                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `--template <owner/repo>`    | Template repository. V1 supports only `Oval-Tutu/bootstrap-love2d-project`.                      |
| `--ref <tag-or-branch>`      | Clone a specific template ref.                                                                   |
| `--main`                     | Clone the template `main` branch instead of resolving the latest release.                        |
| `-y, --yes`                  | Skip prompts and use defaults.                                                                   |
| `--plugins <ids>`            | Comma-separated extra Feather plugin IDs to include after initialization.                        |
| `--packages <ids>`           | Comma-separated Feather catalog packages to install into `game`.                                 |
| `--vendor-targets <targets>` | Comma-separated build vendor targets for `feather build vendor add`.                             |
| `--skip-plugins`             | Skip extra plugin selection/setup. Default Feather init plugins still apply.                     |
| `--skip-packages`            | Skip package selection/setup.                                                                    |
| `--skip-vendors`             | Skip build vendor selection/setup.                                                              |

If git cannot create commits because user identity is missing, Feather keeps the initialized project and prints the exact `git config`, `git add`, and `git commit` commands needed to recover.

### `feather init [dir]`

Create Feather project configuration. For normal development, use CLI mode and launch with `feather run`; this keeps Feather out of your game code while still supporting desktop, web, Android, iOS, and Steam Deck dev loops.

```bash
feather init                                      # configure current directory for feather run
feather init path/to/my-game                      # configure a specific directory
feather init --no-plugins                         # feather core only, no plugins
feather init --plugins screenshots,console
feather init --plugins hot-reload --hot-reload-allow game.player,game.systems.combat
feather init --session-name "My Game" --app-id feather-app-...
feather init --remote --branch v0.7.0             # use a specific runtime release
feather init --local-src ../feather/src-lua       # use a local source tree
feather init --install-dir lib/feather            # configure like FEATHER_DIR=lib/feather
```

> [!IMPORTANT]
> `feather init` defaults to CLI mode. Use `--mode auto` or `--mode manual` only when you intentionally want Feather embedded in the project for launches outside the CLI.

**What it does:**

By default, `feather init` opens an interactive terminal picker powered by Ink with CLI mode selected:

| Mode     | Behavior                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `cli`    | Recommended. Creates `feather.config.lua` for `feather run` without changing game code.                                 |
| `auto`   | Advanced embedded mode. Copies core/plugins and patches `main.lua` with a guarded `require("feather.auto")`.            |
| `manual` | Advanced embedded mode. Copies core/plugins, creates `feather.debugger.lua`, and loads it from `main.lua` when enabled. |

CLI mode writes a development config with `debug = true`, `autoRegisterErrorHandler = true`, and `managed = "cli"`. Unless you pass `--plugins` or `--no-plugins`, it includes `particle-system-playground` and `shader-graph` so the creative tooling is ready immediately. Opt-in or dangerous plugins, such as Console and Hot Reload, still require an explicit include.

Install source priority:

1. `--local-src <path>` copies from a local `src-lua` style tree.
2. Running the CLI from the Feather monorepo copies the repo's `src-lua`.
3. Published CLI installs copy the bundled `cli/lua` runtime.
4. `--remote` downloads from GitHub using `--branch`.

Auto and manual mode are escape hatches for projects that cannot launch through the CLI. They use the same project layout as `scripts/install-feather.sh`:

```
my-game/
  feather/init.lua
  feather/plugins/screenshots/init.lua
  feather/plugins/hump/signal/init.lua
  main.lua
```

If you choose `lib/feather` as the install directory in auto mode, the Lua module becomes `lib.feather`, so Feather patches `main.lua` with a guarded loader:

```lua
local featherUseDebugger = os.getenv("USE_DEBUGGER")
if featherUseDebugger and featherUseDebugger ~= "0" and featherUseDebugger:lower() ~= "false" then
  require("lib.feather.auto")
end
```

> [!NOTE]
> This `USE_DEBUGGER` flow only applies to embedded auto/manual integrations. CLI-managed runs do not require setting `USE_DEBUGGER`.

```bash
# macOS / Linux
USE_DEBUGGER=1 love .
```

```powershell
# Windows PowerShell
$env:USE_DEBUGGER = "1"
love .
```

```bat
:: Windows cmd.exe
set USE_DEBUGGER=1 && love .
```

The interactive flow asks for:

- session name
- install directory, matching `FEATHER_DIR`
- install source: bundled/local copy or GitHub download
- Git branch or tag when using GitHub download, matching `FEATHER_BRANCH`
- whether to install built-in plugins, matching `FEATHER_PLUGINS`
- optional plugins to force-enable, such as Console, Physics Debug, and Timer Inspector
- plugins to skip/exclude, matching `FEATHER_SKIP_PLUGINS`; Console, Hot Reload, HUMP Signal, and Lua State Machine start preselected like the shell installer defaults
- advanced connection/runtime options from `feather.config.lua`, including host/port, socket vs disk mode, observers, logging, debugger, asset previews, capabilities, and binary threshold
- a strong API key when Console is included

If the terminal is non-interactive, Feather still defaults to CLI mode unless you pass `--mode auto` or `--mode manual`.

All modes create a `feather.config.lua` template if one doesn't exist.

Manual mode writes the custom integration into `feather.debugger.lua`, then adds a small marked loader block near the top of `main.lua`. Both are guarded by `USE_DEBUGGER`. Use this only for embedded integrations that cannot rely on `feather run`. For example, when installing into `lib/feather` with `screenshots` and `runtime-snapshot`, the generated file looks like:

```lua
-- feather.debugger.lua
local featherUseDebugger = os.getenv("USE_DEBUGGER")
if not (featherUseDebugger and featherUseDebugger ~= "0" and featherUseDebugger:lower() ~= "false") then
  return nil
end

if DEBUGGER then
  return DEBUGGER
end

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

return DEBUGGER
```

> [!TIP]
> `main.lua` gets matching `FEATHER-INIT` comments around the loader and update hook. `feather.config.lua` also includes a managed metadata block so `feather remove` can remove generated files and markers before production packaging.

**Options:**

| Option                       | Description                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--remote`                   | Download from GitHub instead of copying the local/bundled Lua runtime.                               |
| `--branch <branch>`          | GitHub branch or tag to download from when using `--remote` (default: `main`).                       |
| `--local-src <path>`         | Copy from a local `src-lua` style directory.                                                         |
| `--install-dir <path>`       | Install directory for auto/manual modes (default: `feather`).                                        |
| `--no-plugins`               | Skip plugin installation and omit the CLI-mode default include list.                                 |
| `--plugins <ids>`            | Comma-separated plugin IDs. In CLI mode this overrides the default creative plugins.                 |
| `--hot-reload-allow <names>` | Comma-separated Lua module names allowed for Hot Reload; also includes the `hot-reload` plugin.      |
| `--session-name <name>`      | Session name shown in the Feather desktop app.                                                       |
| `--app-id <id>`              | Desktop App ID allowed to send commands to this game.                                                |
| `--mode <mode>`              | Setup mode: `cli`, `auto`, or `manual`.                                                              |
| `-y, --yes`                  | Skip confirmation prompts.                                                                           |

---

### `feather replay init`

Create a centralized Session Replay adapter so replay code lives in one project file instead of being scattered through gameplay systems.

```bash
feather replay init
feather replay init --dir path/to/my-game
feather replay init --path dev/replay.lua
feather replay init --force
feather replay init --no-config
```

By default this creates `dev/replay.lua`. If `feather.config.lua` exists, it also enables the `session-replay` plugin.

The generated adapter exposes:

- `register()` to install the `DEBUGGER:replayRegister()` capture/restore hook
- `start()` to start recording with an explicit initial baseline
- `stop()` to stop and load the recording
- `play()` to replay the selected session
- `capture()` and `restore()` placeholders for your game checkpoint logic

Wire it once from your game:

```lua
local replay = require("dev.replay")

function love.load()
  replay.register()
end
```

Then edit `dev/replay.lua` to delegate to your save, checkpoint, scene-loading, seed, or debug-state systems. The adapter no-ops when `DEBUGGER` is unavailable, so the game can require it safely while keeping Feather-specific logic contained.

---

### `feather run [game-path]`

Inject Feather into a Love2D game and run it.

```bash
feather run                                # interactive run workflow
feather run .                              # run game in current directory
feather run path/to/my-game               # run from an explicit path
feather run . --session-name "RPG"        # custom name in the desktop session tab
feather run . --no-plugins                # feather core only, no plugins
feather run . --no-debugger               # launch without Feather injection
feather run . --love /usr/bin/love        # override love2d binary
feather run . --plugins-dir ./my-plugins  # use a custom plugins directory
feather run . -- --level dev              # pass args through to the game
feather run . --target web                # build love.js output and serve it locally
feather run . --target web --web-port 3000
feather run . --target web --no-debugger  # serve raw source without Feather embed
feather run . --target android            # build, install, adb reverse, and launch Android
feather run . --target android --device emulator-5554
feather run . --target android --verbose  # show Gradle/ADB commands and output
feather run . --target android --no-cache # force a fresh native workspace
feather run . --target android --no-debugger
feather run . --target ios                # build, install, and launch on the booted simulator
feather run . --target ios --device <simulator-udid>
```

When `game-path` is omitted in an interactive terminal, Feather opens an Ink workflow that asks for the game path, session name, config path, whether plugins should be disabled, and optional advanced paths/arguments. Scripts should pass `game-path` explicitly.

**Options:**

| Option                  | Description                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--love <path>`         | Path to the love2d binary. Defaults to auto-detect (see [Binary detection](#binary-detection)).                              |
| `--session-name <name>` | Custom session name shown in the Feather desktop app.                                                                        |
| `--no-plugins`          | Load feather core only — no plugins registered.                                                                              |
| `--no-debugger`         | Run without Feather debugger injection. Desktop runs the game directly; mobile skips connection setup and builds raw source. |
| `--disable-debugger`    | Alias for `--no-debugger`.                                                                                                   |
| `--config <path>`       | Explicit path to a `feather.config.lua` file.                                                                                |
| `--feather-path <path>` | Use a local feather install instead of the CLI's bundled copy.                                                               |
| `--plugins-dir <path>`  | Use a custom plugins directory instead of the CLI's bundled plugins.                                                         |
| `--target <target>`     | Run target: `desktop`, `web`, `android`, or `ios`. Defaults to `desktop`.                                                    |
| `--device <id>`         | Android device serial or iOS simulator UDID. iOS defaults to `booted`.                                                       |
| `--build-config <path>` | Path to `feather.build.json` for web/mobile run.                                                                             |
| `--out-dir <path>`      | Build output directory for web/mobile run.                                                                                   |
| `--clean`               | Remove the output directory before the web/mobile build.                                                                     |
| `--no-cache`            | Disable Android/iOS dev native build cache for this run.                                                                     |
| `--verbose`             | Show web/mobile build steps plus Android/iOS install and launch commands.                                                    |
| `--no-adb-reverse`      | Skip Android `adb reverse` setup.                                                                                            |
| `--port <port>`         | Port used for Android `adb reverse`; defaults to `feather.config.lua` `port` or `4004`.                                      |
| `--web-host <host>`     | Host used by the web dev server. Defaults to `127.0.0.1`.                                                                    |
| `--web-port <port>`     | Port used by the web dev server. Defaults to `8000`; use `0` for an OS-assigned port.                                        |

Use `--` to separate Feather CLI options from arguments intended for the LÖVE game. Everything after `--` is passed to `love` after the generated shim path.

Web and mobile run are dev-only in V1 and do not forward game arguments. By default they embed the bundled Feather runtime, bundled plugins, and the selected `feather.config.lua` into the temporary `.love` archive before serving or installing. Web requires a configured `targets.web.loveJsDir`. Android requires `adb`, a configured `targets.android.loveAndroidDir`, and USB debugging or an emulator. iOS requires macOS, Xcode, a configured `targets.ios.loveIosDir`, and a booted simulator.

**Project config file:**

If a `feather.config.lua` exists in the game directory, it is read automatically and merged into the feather setup. See [feather.config.lua](#featherconfiglua).

---

### `feather watch [game-path]`

Watch project source files and push `game.love` to a connected Android device or iOS simulator on every change — without rebuilding native binaries.

```bash
feather watch .                                    # watch current directory, push to Android
feather watch . --target ios                       # push to booted iOS simulator
feather watch . --target android --device emulator-5554
feather watch path/to/my-game --target android
feather watch . --debounce 750                     # wait 750 ms after last change before pushing
feather watch . --no-restart                       # push game.love without restarting the app
feather watch . --no-adb-reverse                   # skip adb reverse port forwarding
feather watch . --verbose                          # show adb and xcrun commands
```

**How it works:**

On start, `feather watch` runs a full `feather run` for the target — building the native app (or reusing the cache), installing it on the device, and launching it. From that point on, only `game.love` is rebuilt and pushed on every source change:

1. Files change in `sourceDir`.
2. A debounce timer fires (default 500 ms).
3. Feather stages the project, embeds the Feather runtime, and packs a new `game.love`.
4. **Android** — `adb push game.love /sdcard/Android/data/<appId>/files/game.love`; app is force-stopped and relaunched via `monkey` (unless `--no-restart`).
5. **iOS** — `game.love` is copied into the cached `.app` bundle, the bundle is ad-hoc re-signed, and the simulator app is terminated and relaunched via `xcrun simctl` (unless `--no-restart`).

The native binary (APK or `.app`) is reused across pushes. Gradle and Xcode only run on the first launch or when the native cache is cold.

> [!TIP]
> Use `feather watch` for tight Lua iteration loops. Typical push time (debounce → visible in app) is under two seconds for small games.

**Options:**

| Option                    | Description                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- |
| `--target <target>`       | Watch target: `android` or `ios`. Defaults to `android`.                        |
| `--device <id>`           | Android device serial or iOS simulator UDID. iOS defaults to `booted`.          |
| `--debounce <ms>`         | Milliseconds to wait after the last file change before pushing. Default: `500`. |
| `--no-restart`            | Push `game.love` without restarting the app.                                    |
| `--build-config <path>`   | Path to `feather.build.json`.                                                   |
| `--out-dir <path>`        | Build output directory.                                                         |
| `--no-plugins`            | Feather core only — no plugins embedded in `game.love`.                         |
| `--no-adb-reverse`        | Skip Android `adb reverse` setup.                                               |
| `--port <port>`           | Port for Android `adb reverse`. Defaults to `4004`.                             |
| `--feather-path <path>`   | Use a local Feather install instead of the CLI's bundled copy.                  |
| `--plugins-dir <path>`    | Use a custom plugins directory instead of the CLI's bundled plugins.            |
| `--runtime-config <path>` | Path to `feather.config.lua` for debugger embedding.                            |
| `--verbose`               | Show `adb` and `xcrun simctl` commands.                                         |

Ignored files: `.git`, `node_modules`, `.feather-cache`, hidden files.

> [!NOTE]
> `feather watch` is a dev-only command. The first launch always builds and installs the full native app — only subsequent pushes skip native compilation. Prefer `feather run` for one-shot installs.

---

### `feather remove [dir]`

Remove Feather from a project before creating a production build.

```bash
feather remove                         # interactive picker
feather remove path/to/my-game
feather remove --yes                   # remove default managed targets
feather remove --dry-run               # preview without changing files
feather remove --keep-config           # keep feather.config.lua
feather remove --keep-runtime          # keep feather/ and feather/plugins/
feather remove --install-dir lib/feather
```

> [!CAUTION]
> `feather remove` only edits `main.lua` inside the generated `FEATHER-INIT` marker blocks. It can also remove the installed runtime directory, `feather.config.lua`, and `feather.debugger.lua` when those files are detected.

The command reads managed metadata from `feather.config.lua` when available, including the install directory and manual entrypoint path.

**Options:**

| Option                 | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `--install-dir <path>` | Override the detected Feather install directory.                |
| `--dry-run`            | Show what would be removed without changing files.              |
| `--keep-config`        | Keep `feather.config.lua`.                                      |
| `--keep-main`          | Keep `main.lua` marker blocks and update hook.                  |
| `--keep-manual`        | Keep `feather.debugger.lua`.                                    |
| `--keep-runtime`       | Keep installed Feather runtime and plugins.                     |
| `-y, --yes`            | Skip the interactive picker and remove default managed targets. |

---

### `feather doctor [dir]`

Check the environment and project health.

```bash
feather doctor        # check current directory
feather doctor path/to/my-game
feather doctor . --install-dir lib/feather
feather doctor . --host 127.0.0.1 --port 4004
feather doctor . --json
feather doctor . --production
feather doctor . --security --json
feather doctor . --build-target web
feather doctor . --upload-target itch
```

Doctor checks:

- Node.js, npm, and LÖVE availability
- `main.lua`, `feather.config.lua`, and managed init metadata
- embedded runtime files for auto/manual setups
- installed plugin manifests
- missing, unknown, malformed, or development-only plugins
- package lockfile integrity, version drift, and source provenance
- build dependencies when `--build-target` is provided, plus upload readiness when an upload target is requested or `feather.build.json` is present
- `USE_DEBUGGER` guards and `FEATHER-INIT` markers
- risky settings such as hot reload, screenshot capture, and Console API keys
- Feather desktop WebSocket reachability

> [!TIP]
> `feather doctor --json` is useful in CI or pre-release scripts. It exits with a nonzero status only when it finds blockers.

Use `--production` as a release gate. It fails on production-dangerous settings such as `__DANGEROUS_INSECURE_CONNECTION__ = true`, Console with a weak or missing `apiKey`, hot reload, broad hot reload allowlists, debugger/screenshot/disk persistence settings, wildcard or LAN-facing hosts with weak auth, and unmanaged embedded Feather runtime.

Use `--security --json` when automation needs a security-focused report without environment noise. It emits JSON only, filters checks to security-relevant groups, and includes config posture, network exposure, runtime management, plugin trust, and package provenance.

Sensitive values such as `apiKey`, tokens, secrets, and passwords are redacted from human output, JSON output, compact errors, and `FEATHER_DEBUG=1` stack output.

**Example output:**

```
Feather doctor

Project: /path/to/my-game

Environment
  ✔ Node.js  v22.0.0
  ✔ npm  v10.8.1
  ✔ LÖVE binary  /Applications/love.app/Contents/MacOS/love  (11.5)

Safety
  ! Hot reload  enabled
    → Hot reload is development-only remote code execution; keep allowlists narrow and never ship with it on.

Doctor passed with 1 warning.
```

---

### `feather mcp`

Run Feather as a local [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18) server for AI clients. The MCP server exposes sanitized live session resources and full-control tools through the Feather desktop app's localhost bridge.

```bash
feather mcp                         # stdio transport for local MCP clients
feather mcp --transport http        # Streamable HTTP on 127.0.0.1:4006/mcp
feather mcp --transport http --port 4010
```

Enable **Settings → Security → MCP Access** in the Feather desktop app first. The desktop writes a token to `~/.feather/mcp.json`, which the CLI reads automatically. You can also pass a token explicitly:

```bash
FEATHER_MCP_TOKEN=feather-mcp-... feather mcp
feather mcp --token feather-mcp-... --transport http
```

**Options:**

| Option                | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `--transport <mode>`  | `stdio` or `http`. Defaults to `stdio`.                                     |
| `--host <host>`       | HTTP host. Defaults to `127.0.0.1`; only localhost hosts are accepted.      |
| `--port <port>`       | HTTP port. Defaults to `4006`.                                              |
| `--desktop-url <url>` | Feather desktop MCP bridge URL. Defaults to `http://127.0.0.1:4005`.       |
| `--token <token>`     | MCP bridge token; overrides `FEATHER_MCP_TOKEN` and `~/.feather/mcp.json`. |

Resources include `feather://sessions` and `feather://sessions/{id}/{section}` for `config`, `logs`, `performance`, `debugger`, `plugins`, `assets`, `observers`, and `session-replay`; `feather://plugins/catalog` and `feather://plugins/{id}` for built-in plugin metadata; live `feather://sessions/{id}/plugins/{pluginId}` payloads; and creative snapshots for Shader Graph, Particles Playground, and Texture Lab. Tools cover session snapshots, refresh requests, runtime suspend/resume, agent-friendly step debugging with breakpoints/source context/logs, Console eval/globals/pins, plugin catalog/live state/actions/params/enabling, high-level shader/particle/texture creation, Shader Graph compile/preview/import/export, Particle Playground authoring/export actions, Texture Lab recipe/generation actions, Time Travel, Session Replay state/record/playback/import/delete workflows, and the advanced `feather_send_command` escape hatch.

> [!WARNING]
> MCP full-control tools can execute powerful live-debug actions. The desktop bridge is disabled by default, binds only to localhost, requires a bearer token, and still relies on existing runtime gates such as Console `evalEnabled` and `apiKey`.

---

### `feather skills`

Install bundled Feather agent skills into a project-local `.agents/skills` directory. These are small `SKILL.md` playbooks for agents that need to debug games, inspect live sessions, profile, create shaders/particles/textures, iterate with plugins, build platform artifacts, or act as QA.

```bash
feather skills list
feather skills info feather-step-debugging
feather skills install feather-step-debugging feather-texture-lab
feather skills install --all --dir path/to/my-game
feather skills install feather-shader-graph --target .codex/skills
feather skills remove feather-step-debugging --dir path/to/my-game
```

**Commands:**

| Command                  | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| `skills list [--json]`   | List bundled skills.                                                        |
| `skills info <id>`       | Show metadata, source path, and default install path for one bundled skill. |
| `skills install [ids...]` | Copy selected skills, or the full catalog with `--all`.                    |
| `skills remove <ids...>` | Remove installed catalog-known skills from the target directory.            |

**Install options:**

| Option            | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `--all`           | Install every bundled skill.                                                |
| `--dir <path>`    | Resolve the project root from this path.                                    |
| `--target <path>` | Install directory. Relative paths stay inside the project root. Defaults to `.agents/skills`. |
| `--force`         | Overwrite existing installed skills.                                        |
| `--dry-run`       | Report planned writes or removals without changing files.                  |
| `--json`          | Emit machine-readable summaries.                                            |

The installer only copies skills declared in the bundled catalog and skips existing files unless `--force` is passed. V1 does not install remote or third-party skills.

---

### `feather build <target>`

Build a LÖVE game into local artifacts. Supported targets are `love`, `web`, `android`, `ios`, `windows`, `macos`, `linux`, and `steamos`. Android and iOS default to development builds from local native template checkouts; `--release` produces signed/store-oriented mobile artifacts without embedding Feather's debugger runtime.

```bash
feather build love --dir path/to/my-game
feather build web --dir path/to/my-game
feather build vendor add web --dir path/to/my-game
feather build vendor add mobile --dir path/to/my-game
feather build vendor add desktop --dir path/to/my-game
feather build vendor add all --dir path/to/my-game
feather build android --dir path/to/my-game
feather build android --dir path/to/my-game --verbose
feather build android --dir path/to/my-game --no-cache
feather build android --dir path/to/my-game --runtime-config path/to/feather.config.lua
feather build android --dir path/to/my-game --no-debugger
feather build android --dir path/to/my-game --release
feather build ios --dir path/to/my-game
feather build ios --dir path/to/my-game --verbose
feather build ios --dir path/to/my-game --release
feather build windows --dir path/to/my-game
feather build macos --dir path/to/my-game
feather build linux --dir path/to/my-game
feather build steamos --dir path/to/my-game --json
feather build web --dry-run
feather build web --allow-unsafe
```

Builds read `feather.build.json` from the project root. `love` builds can run without target-specific vendors. Web builds need a local love.js player directory, mobile builds need local LÖVE native template paths, desktop builds need local LÖVE runtime vendors, and uploads need store metadata.

To fetch build vendors locally:

```bash
feather build vendor add web
feather build vendor add mobile
feather build vendor add desktop
feather build vendor add all --json
feather build vendor add android --ref 11.5
feather build vendor add ios --ref 11.5 --json
feather build vendor add web --force          # overwrite existing vendor directory
feather build vendor list
```

## `build vendor add`

Installs local build vendors into `vendor/` and updates `feather.build.json` by default.

If a vendor directory already exists, it is skipped and installation continues for the remaining vendors. In interactive terminals, Feather prompts whether the existing vendor should be overwritten. Use `--force` to overwrite existing vendors without prompting.

### Vendor Sources

- **Web** — Fetches `2dengine/love.js` into `vendor/love.js`
- **Android** — Fetches `love2d/love-android` with submodules
- **iOS** — Fetches `love2d/love` and installs the matching `love-<version>-apple-libraries.zip` into the Xcode project tree
- **Desktop** — Downloads official LÖVE runtimes for:
  - Windows
  - macOS
  - Linux
- **SteamOS** — Reuses the Linux runtime unless configured separately

### Version Resolution

> [!NOTE]
> Only 11.5 has been tested, future Love2D releases will be officially supported short after launch.

Mobile and desktop vendors resolve versions using:

1. `loveVersion`
2. `--ref`

If neither is provided, Feather defaults to `11.5`.

Web vendors behave slightly differently:

- Defaults to the `main` branch of `love.js`
- Can be pinned using `--web-ref`
- Falls back to `--ref` if provided

```json
{
  "name": "My Game",
  "version": "1.0.0",
  "productId": "com.example.mygame",
  "company": "Example Studio",
  "website": "https://example.com",
  "sourceDir": ".",
  "outDir": "builds",
  "exclude": ["screenshots/**", "tmp/**"],
  "release": {
    "fastlane": {
      "path": "fastlane",
      "bundleExec": "auto"
    }
  },
  "targets": {
    "web": {
      "loveJsDir": "vendor/love.js"
    },
    "android": {
      "loveAndroidDir": "vendor/love-android",
      "displayName": "My Game",
      "orientation": "landscape",
      "recordAudio": false,
      "versionCode": 1,
      "versionName": "1.0.0",
      "release": {
        "bundleTask": "bundleEmbedNoRecordRelease",
        "apkTask": "assembleEmbedNoRecordRelease",
        "keystorePath": "signing/release.keystore",
        "keyAlias": "release",
        "storePasswordEnv": "ANDROID_STORE_PASSWORD",
        "keyPasswordEnv": "ANDROID_KEY_PASSWORD",
        "fastlane": {
          "packageName": "com.example.mygame",
          "track": "internal",
          "releaseStatus": "completed",
          "serviceAccountJsonEnv": "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
        }
      }
    },
    "ios": {
      "loveIosDir": "vendor/love-ios",
      "bundleIdentifier": "com.example.mygame",
      "displayName": "My Game",
      "scheme": "love-ios",
      "sdk": "iphonesimulator",
      "teamId": "ABCDE12345",
      "release": {
        "exportMethod": "app-store-connect",
        "signingStyle": "manual",
        "provisioningProfileSpecifier": "My Game App Store",
        "teamId": "ABCDE12345",
        "fastlane": {
          "bundleIdentifier": "com.example.mygame",
          "teamId": "ABCDE12345",
          "exportMethod": "app-store",
          "appStoreConnectApiKeyPathEnv": "APP_STORE_CONNECT_API_KEY_PATH"
        }
      }
    },
    "windows": {
      "loveRuntimeDir": "vendor/love-windows"
    },
    "macos": {
      "loveRuntimeDir": "vendor/love-macos"
    },
    "linux": {
      "loveRuntimeDir": "vendor/love-linux"
    }
  },
  "upload": {
    "itch": {
      "project": "my-user/my-game",
      "channels": {
        "web": "html5",
        "linux": "linux"
      }
    }
  }
}
```

Build behavior:

- creates a deterministic `.love` archive from the staged project
- excludes `.git`, `node_modules`, `.featherlog`, build output, and Feather runtime/config files by default
- runs a production safety preflight unless `--allow-unsafe` is passed
- writes `feather-build-manifest.json` in the output directory
- packages `web` by copying the configured love.js player, adding `game.love`, patching the page title/game URL, and creating an HTML zip
- packages `android` by copying a configured love-android checkout, embedding `game.love`, patching obvious app metadata, running Gradle, and copying the APK
- packages `ios` on macOS by copying a configured LÖVE iOS source tree, embedding `game.love`, running `xcodebuild`, and copying the `.app`
- embeds Feather runtime/config into Android/iOS dev builds by default; use `--no-debugger` to build raw source, and note that `--release` never auto-embeds Feather
- caches Android/iOS dev native workspaces under `<outDir>/.feather-cache` so Gradle/Xcode incremental state survives between builds
- `--release` on Android produces `.aab` and `.apk` artifacts; signing passwords are read from environment variables named in config
- `--release` on iOS produces `.xcarchive` and `.ipa` artifacts through `xcodebuild archive` and `-exportArchive`
- `--verbose` on Android/iOS shows staging steps, native workspace paths, Gradle/Xcode commands, and captured native tool output; JSON output stays decoration-free
- packages Windows as a fused runtime zip and NSIS installer, macOS as `.app.zip` and `.dmg`, and Linux/SteamOS as `.AppImage` plus `.tar.gz`
- `steamos` uses the Linux runtime vendor by default with SteamOS artifact naming

**Options:**

| Option              | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `--dir <path>`      | Project directory (default: current directory).                  |
| `--config <path>`   | Path to `feather.build.json`.                                    |
| `--out-dir <path>`  | Build output directory override.                                 |
| `--name <name>`     | Product name override.                                           |
| `--version <value>` | Product version override.                                        |
| `--clean`           | Remove the output directory before building.                     |
| `--dry-run`         | Show planned files/artifacts without writing them.               |
| `--json`            | Print machine-readable output only.                              |
| `--allow-unsafe`    | Skip the production safety preflight for intentional dev builds. |
| `--release`         | Build Android/iOS release artifacts instead of dev artifacts.    |
| `--no-cache`        | Disable Android/iOS dev native build cache for this build.       |
| `--no-debugger`     | Build Android/iOS dev artifacts without embedding Feather.       |
| `--runtime-config`  | Path to `feather.config.lua` for Android/iOS dev embedding.      |
| `--verbose`         | Show Android/iOS native build commands and tool output.          |

Run `feather doctor --build-target <target>` to see missing local dependencies and exact setup guidance before building. Use `feather doctor --build-target all` to scan every platform in one pass.

Mobile build notes:

- Android builds expect `targets.android.loveAndroidDir` to point at a local love-android checkout with `gradlew`.
- iOS builds expect `targets.ios.loveIosDir` to point at a local LÖVE iOS source tree with `platform/xcode/love.xcodeproj`.
- `feather build vendor add mobile` fetches those template checkouts, but it does not install Android SDK, JDK, Xcode, or signing assets.
- Desktop builds expect `targets.windows.loveRuntimeDir`, `targets.macos.loveRuntimeDir`, and `targets.linux.loveRuntimeDir` to point at local runtime vendors. `feather build vendor add desktop` creates those directories.
- Dev Android/iOS builds reuse cached copied native templates by default. Use `--no-cache` for a fresh temporary workspace, or `--clean` to remove both artifacts and cached state in the output directory.
- Release Android/iOS builds use fresh native workspaces by default for reproducibility.
- `feather doctor --build-target android --release` validates product id, Gradle wrapper, JDK, Android SDK, and signing env setup.
- `feather doctor --build-target ios --release` validates bundle id, macOS/Xcode setup, template path, export options, and signing hints.

### `feather release`

`feather release` is an optional Fastlane-backed layer for signed store-ready mobile workflows. It scaffolds editable Fastlane files, runs a clean Feather-free mobile release build for `beta` and `production`, checks generated artifacts for Feather runtime/debug files, and invokes the selected lane with explicit `FEATHER_*` environment variables.

```bash
feather release init --dir path/to/my-game
feather release ios beta --dir path/to/my-game
feather release ios production --dir path/to/my-game
feather release android beta --dir path/to/my-game
feather release android production --dir path/to/my-game
feather release android metadata --dir path/to/my-game --skip-build
feather release ios screenshots --dir path/to/my-game --skip-build
```

Fastlane remains optional: `feather build android --release` and `feather build ios --release` still work without it. If a `Gemfile` exists, Feather runs `bundle exec fastlane`; otherwise it runs `fastlane` directly. Secrets stay in environment variables or files referenced by environment variables, never directly in `feather.build.json`.

**Options:**

| Option              | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `--dir <path>`      | Project directory (default: current directory).       |
| `--config <path>`   | Path to `feather.build.json`.                         |
| `--out-dir <path>`  | Build output directory override.                      |
| `--name <name>`     | Product name override.                                |
| `--version <value>` | Product version override.                             |
| `--dry-run`         | Show the release command without running Fastlane.    |
| `--json`            | Print machine-readable output only.                   |
| `--clean`           | Remove build output before the release build.         |
| `--no-cache`        | Disable native build cache during the release build.  |
| `--verbose`         | Show native build and Fastlane output.                |
| `--skip-build`      | Run Fastlane using existing build manifest artifacts. |

---

### `feather upload <itch|steam>`

Upload a built artifact. V1 supports Itch through `butler`; Steam is registered but returns a planned-support error.

```bash
feather upload itch web --dir path/to/my-game
feather upload itch android --dir path/to/my-game --build
feather upload itch web --channel html5 --if-changed
feather upload itch web --dry-run --json
feather upload steam linux
```

`feather upload itch` reads `feather-build-manifest.json`, chooses the artifact for the requested build target, and runs:

```bash
butler push <artifact> <user/game>:<channel> --userversion <version>
```

The Itch project and default channels come from `feather.build.json`. Use `--channel` or `--user-version` to override them in CI.

When `--build` is used, upload always performs a production-safe build first. Android and iOS upload builds force release mode, debugger embedding is disabled, `--allow-unsafe` and `--allow-feather-runtime` are rejected, and generated inspectable artifacts are checked for Feather runtime/debug files before upload. `--allow-feather-runtime` only applies when uploading an existing artifact you built yourself.

**Options:**

| Option                     | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `--dir <path>`             | Project directory (default: current directory).     |
| `--config <path>`          | Path to `feather.build.json`.                       |
| `--build-dir <path>`       | Directory containing `feather-build-manifest.json`. |
| `--channel <name>`         | Upload channel override.                            |
| `--user-version <version>` | Store-facing version override.                      |
| `--dry-run`                | Show the upload command without running it.         |
| `--if-changed`             | Pass `--if-changed` to supported uploaders.         |
| `--hidden`                 | Pass `--hidden` to supported uploaders.             |
| `--build`                  | Build a production-safe artifact before uploading.  |
| `--allow-feather-runtime`  | Override safety checks only for existing artifacts. |
| `--json`                   | Print machine-readable output only.                 |

Run `feather doctor --upload-target itch` to check for `butler`, Itch project config, and CI auth hints. Use `BUTLER_API_KEY` in CI or `butler login` locally.

---

### `feather update [dir]`

Update the Feather core library in a project.

```bash
feather update                       # interactive source picker in a terminal
feather update -y                    # update from the local/bundled CLI copy
feather update path/to/my-game
feather update --remote --branch v0.7.1
feather update --local-src ../feather/src-lua
```

In an interactive terminal, `feather update` opens an Ink workflow to choose local/bundled files or a GitHub branch/tag. In scripts or with `-y`, it uses the local/bundled CLI copy unless `--remote` is provided.

This updates all `core:` files listed in `manifest.txt`. Plugin files are not touched — use `feather plugin update` for those.

> [!NOTE]
> CLI-managed projects (initialized with `feather init` in `cli` mode) do not embed the runtime in the project. For those projects `feather update` prints an informational message and exits — update the CLI package itself to get the latest runtime.

---

### `feather plugin`

Manage Feather plugins in a project.

Run `feather plugin` with no subcommand to open an Ink workflow for common plugin tasks:

```bash
feather plugin
feather plugin --install-dir lib/feather
feather plugin --remote --branch main
```

The workflow can list installed plugins, install one or more catalog plugins, remove installed plugins, or update selected plugins. Like `feather init`, plugin installs and updates are local-first by default:

1. `--local-src <path>` copies from a local `src-lua` style tree.
2. Running the CLI from the Feather monorepo copies the repo's `src-lua`.
3. Published CLI installs copy the bundled `cli/lua` runtime.
4. `--remote` downloads from GitHub using `--branch`.

#### `feather plugin list [dir]`

List installed plugins.

```bash
feather plugin list
```

```
Installed plugins (12)

  screenshots              1.0.0    Capture screenshots and record GIFs
  console                  1.0.0    Remote Lua console
  entity-inspector         1.0.0    ECS entity browser
  ...
```

#### `feather plugin install <id>`

Install a plugin from the local/bundled runtime by default, or from GitHub with `--remote`.

```bash
feather plugin install console
feather plugin install time-travel --remote --branch main
feather plugin install console --local-src ../feather/src-lua
feather plugin install console --install-dir lib/feather
feather plugin install console input-replay           # install multiple at once
feather plugin install console --force                # overwrite if already installed
```

If a plugin is already installed, `feather plugin install` skips it and continues installing the others. In an interactive terminal it then offers to overwrite the skipped plugins. Pass `--force` to overwrite without prompting.

**Options:**

| Option                 | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `--force`              | Overwrite already-installed plugins without prompting.        |
| `--dry-run`            | Show planned changes without writing files when supported.    |
| `--json`               | Emit machine-readable summaries for desktop/automation use.   |
| `--remote`             | Download from GitHub instead of the local/bundled runtime.    |
| `--branch <branch>`    | GitHub branch or tag when using `--remote` (default: `main`). |
| `--local-src <path>`   | Copy from a local `src-lua` style directory.                  |
| `--install-dir <path>` | Install directory (default: `feather`).                       |
| `--dir <path>`         | Project directory (default: current directory).               |

#### `feather plugin remove <id>`

Remove an installed plugin.

```bash
feather plugin remove hump.signal
```

#### `feather plugin update [id]`

Update a plugin, or all installed plugins if no ID is given.

```bash
feather plugin update              # interactive picker for installed plugins
feather plugin update -y           # update all installed plugins
feather plugin update console      # update a specific plugin
feather plugin update --remote --branch main
```

When no plugin ID or source flag is provided in an interactive terminal, `feather plugin update` opens an Ink workflow where you can choose the source and select installed plugins. Use `-y`, `--remote`, or `--local-src` for CI or scripts.

Use `--install-dir <path>` with plugin commands when the project was initialized outside the default `feather/` directory.

Use `--managed <mode>` to override the managed-mode detection read from `feather.config.lua`. Accepted values are `cli`, `auto`, and `manual`. This is rarely needed; the config file is the source of truth.

---

### `feather config`

Update values in `feather.config.lua` without opening the file.

#### `feather config plugins`

Add or remove plugins from the `include`/`exclude` lists and keep the `capabilities` allowlist in sync.

```bash
feather config plugins --include console,input-replay
feather config plugins --exclude hump.signal
feather config plugins --include console --exclude runtime-snapshot --dir path/to/my-game
```

**Options:**

| Option            | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `--include <ids>` | Comma-separated plugin IDs to add to `include`.         |
| `--exclude <ids>` | Comma-separated plugin IDs to add to `exclude`.         |
| `--dir <path>`    | Project directory (default: current directory).         |
| `--dry-run`       | Report planned config changes without writing files.    |
| `--json`          | Emit a machine-readable summary.                        |

#### `feather config hot-reload`

Enable the opt-in `hot-reload` plugin and write a narrow `debugger.hotReload.allow` list.

```bash
feather config hot-reload --allow game.player,game.systems.combat
feather config hot-reload --allow game.player --dir path/to/my-game
```

This also writes `debug = true`, `autoRegisterErrorHandler = true`, `include = { "hot-reload", ... }`, the required `filesystem` capability, and safe defaults such as `deny = { "main", "conf", "feather.*" }` and `persistToDisk = false`.

**Options:**

| Option            | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `--allow <names>` | Comma-separated Lua module names Hot Reload may update. |
| `--dir <path>`    | Project directory (default: current directory).         |

#### `feather config managed <mode>`

Change the `managed` field that controls how Feather detects the integration mode. Useful when you want to override what `feather init` wrote without re-initialising the project.

```bash
feather config managed cli
feather config managed auto
feather config managed manual --dir path/to/my-game
```

Valid modes are `cli`, `auto`, and `manual`. This updates the config field only — it does not patch `main.lua`, install the runtime, or generate `feather.debugger.lua`. Use `feather init --mode <mode>` for a full mode transition.

**Options:**

| Option         | Description                                     |
| -------------- | ----------------------------------------------- |
| `--dir <path>` | Project directory (default: current directory). |

---

## feather.config.lua

Place a `feather.config.lua` in your game directory to configure the Feather injection without touching command-line flags. `feather run` reads it automatically.

```lua
-- feather.config.lua
return {
  sessionName = "My RPG",

  -- Force-enable opt-in plugins.
  -- "console" is a remote REPL. "hot-reload" is development-only remote code execution.
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

  -- Small in-game badge shown while Feather is loaded.
  debugOverlay = {
    enabled = true,
    visible = true,
    hideKey = "f12",
    touchToggle = true,
    corner = "top-right",
  },
}
```

All `feather.auto.setup()` options are supported. Command-line flags (`--session-name`, etc.) take precedence over the config file. The debug overlay is visible by default when Feather is active; press `F12` or double-tap the top-right corner to temporarily hide/show it.

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

## CLI vs Embedded Setup

|                      | `feather run`      | Embedded auto/manual setup          |
| -------------------- | ------------------ | ----------------------------------- |
| Recommended for      | Normal development | Projects that cannot use CLI launch |
| Game code changes    | None               | Generated or manual loader code     |
| Works on any game    | Yes                | Only games you've modified          |
| `feather.config.lua` | Supported          | Supported                           |
| Plugin management    | Via CLI            | Vendored in the project             |

<!-- | Hot reload | love2d restarts via CLI | Native | -->

Both approaches are compatible, but prefer `feather run` when you can. A game that already has `require("feather.auto")` can still be launched with `feather run` because Feather checks the `DEBUGGER` global and skips double-initialization.
