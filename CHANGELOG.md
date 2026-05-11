# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.9.2] - 2026-05-11 - The one with NPM releases

- Add release step for npm

## [v0.9.0] - 2026-05-11 - The one with the Hot Reloading

### Added

- Hot reloading
  - Options added to debugger
  - Documentation
- e2e
  - cli
  - app
  - rust
  - lua
- MacOS
  - Code signing
- Plugin
  - Overlay plugin

### Changed

- CLI
  - `run`, `update`, `doctor` now include ink workflow
- Debugger
  - Toast is displayed in game when code is hot reloaded
- Console
  - Toast is displayed in game when code is hot reloaded
- AppID is now required to limit which serves can communicate with the feather lua client
- Handshake required before enabling connection

## [v0.8.0] - 2026-05-10 - The one with the CLI

### Added

- Feather CLI foundations
  - project setup commands
  - plugin management commands
  - `feather doctor`
  - Love2D launch helpers
  - commands
    - init - setup feather for a game
    - run - run game with feather auto hooks
    - plugin - management of the plugins
    - remove - allow removing feather before release builds are created for embedded workflows
- Plugins
  - manifests (`manifest.lua`)
    - Plugin capability declarations
  - automatic discovery and loading
  - UI layout type
    - Custom React UI builded from lua
      - `panel,`, `row`, `column`, `tabs`, `tab`, `text`, `badge`, `button`, `input`, `textarea`, `checkbox`, `switch`, `select`, `stat`, `progress`, `alert`, `list`, `link`, `separator`, `image`, `code`, `table`, `timeline`, `inspector`
  - disable all option
  - binary transport type
  - Screenshots
    - clean
- Observers
  - table diffing
  - view revamp
  - nested table change highlighting
  - history snapshots
  - search and filtering
- Session
  - reload button
  - source folder override option
  - add session specific apiKey
- Development
  - Automatic plugin list generation
  - Manifest generation tooling
  - Plugin manifest documentation
  - Commit level checks
    - synced version across all projects
- Performance
  - Add more insights
- Assets
  - list
  - preview
- **App ID authorization** (`appId`) — each Feather desktop app generates a unique ID; set `appId` in `feather.config.lua` so the game only accepts commands from the matching desktop instance; when unset, `__INSECURE_CONNECTION__` is set to `true` in the game
- **CLI: `appId` prompt** — `feather init` now asks for the desktop App ID and writes it to `feather.config.lua`
- **Performance overlay plugin** — in-game FPS and memory overlay without requiring the desktop app
- **Hot reload** — opt-in `hot-reload` plugin lets the Feather desktop push Lua source into the running game; guarded by allow/deny lists and `requireLocalNetwork`; development-only
- **Code signing** — macOS and Windows desktop app releases are now signed
- **E2E test suite** — end-to-end tests covering the Lua library, desktop app, Tauri layer, and CLI

### Changed

- Examples structure
- Plugins
  - improved architecture
  - improved documentation
  - improved ui
  - Screenshots
    - binary type transport
- Observers
  - UI changes
- Debugger
  - binary transport
- Navigation
  - require session to open tabs
  - allow opening .featherlog and .feathertravel as new sessions
- Docs
  - add github style notes

### Fixed

- Cleaning logs not longer clean other sessions logs
- Console page input area always visible regardless of log volume
- Console no longer breaks when all plugins are disabled simultaneously
- Particle editor: switching between multiple systems now correctly updates grouped inputs and applies subsequent property changes to the newly selected system
- Input replay: added capture and replay for touch (`love.touchpressed/released/moved`) and joystick (`love.joystickpressed/released`, `love.gamepadpressed/released`, `love.joystickaxis`, `love.gamepadaxis`, `love.joystickhat`)

## [v0.7.0] - 2026-05-08 - The one with the debugger and time travel

### Added

- **Debugger** - first-iteration Lua debugger: step through code, inspect variables, set conditional breakpoints, and browse the call stack from the desktop, search across selected file, allow selecting a custom folder for code visualization
- **Time travel** - record and replay game state snapshots; export and import snapshots to/from file
- **Compare instances** - compare metrics of two instances side-by-side in a dedicated diff tab
- **Syntax highlighting** - code in the console and debugger panels is now syntax-highlighted
- **Plugin filter** - option to hide specific plugins from the sidebar
- **Docs material** - added documentation content for plugins

### Changed

- Console history is now persisted across sessions
- Console is excluded from the auto-registration script by default (opt-in only)
- Plugins are now ordered alphabetically in the sidebar
- Improved variable inspection display in the debugger
- Improved reconnection reliability and feedback
- Documentation reorganized under the plugins location
- Updated dependencies and chart library

### Fixed

- Debugger panel scrolling
- No-session-active state now handled correctly in the UI

## [v0.6.0] - 2026-05-05 - The one with android and ios support

### Added

- **Plugin system** — more server-driven UI: new action, new layout options
- **15 built-in plugins:**
  - Console / REPL — execute Lua code in the running game (opt-in, requires `apiKey`)
  - Profiler — function-level CPU profiling with start/stop
  - Input Replay — record and replay keyboard, mouse, touch, and joystick input
  - Entity Inspector — browse and inspect live ECS entities and their properties
  - Config Tweaker — edit game config values at runtime without restarting
  - Bookmark — mark points of interest in game state with hotkey support
  - Network Inspector — monitor HTTP/WS traffic by wrapping `socket.http`
  - Memory Snapshot — heap snapshots, table size tracking, diff between snapshots
  - Physics Debug — color-coded love.physics overlay (bodies, joints, contacts, AABBs)
  - Particle Editor — live edit all 30+ ParticleSystem properties, export to Lua
  - Audio Debug — inspect love.audio sources, listener state, and effects
  - Coroutine Monitor — track coroutines auto-discovered via hook, yield counts per frame
  - Collision Debug — visualize bump.lua AABB worlds with per-item colors and labels
  - Animation Inspector — inspect anim8 animation state, pause/resume/reset from desktop
  - Timer Inspector — monitor HUMP timer and flux tween progress with cancel support
  - Filesystem — browse the game's save directory, preview file contents, delete files
- **`feather.auto`** — `require("feather.auto")` registers all plugins with sensible defaults; `setup()` for include/exclude/option overrides
- **`install-feather.sh`** — curl-pipe-sh installer; also usable to update or pin to a version tag
- **Multiple simultaneous sessions** — each connected game gets its own tab; sessions persist across reconnects
- **Per-session version mismatch indicator** — warning icon on the session tab when game library and desktop differ
- **Android and iOS support** — android and ios projects can communicate to feather
- **Disk mode** — skip WebSocket entirely, write `.featherlog` files only; useful for Android/iOS or when LuaSocket is unavailable
- **Late connection** — game can start before the desktop app; reconnects automatically
- **Mobile connection helper** — Settings auto-detects local network IPs and shows a copyable `ws://` connection string and Lua snippet
- **Session delete** — remove a disconnected session from the tab bar
- **Plugin docs link** — plugins can expose a `docs` URL in `getConfig()`; a Docs button opens it in the system browser
- **Plugin sidebar filter** — search box to filter plugins by name
- **`FEATHER_PLUGIN_PATH`** — allows plugins to be installed in a different directory from the core library

### Changed

- Switched from REST polling to WebSocket push — game drives the data cadence at a configurable `sampleRate`
- Settings page reorganized into sections (Appearance, Connection, Security, Editor) with descriptions
- Version mismatch warning moved from global sidebar to individual session tabs
- Particle editor correctly applies property changes when multiple systems are registered

### Fixed

- Console page input always visible regardless of log volume
- Particle editor selection not updating grouped inputs when switching systems
- `auto.lua` plugin resolution when `FEATHER_PLUGIN_PATH` differs from `FEATHER_PATH`

## [v0.5.1] - 2026-02-23 - The one with log folders

### Added

- Add option to navigate to logs folder
- Improve readme documentation
- Add ready to use zip file to release

## [v0.5.0] - 2026-02-23 - The one with log files

### Added

- Log file based logging
- Ability to see existing log files
- Improve error feedback
- Confirmation to download screenshots

### Fixed

- Keep existing data after disconnect
- Scrolling bug in logs details

### Changed

- Update roadmap
- Refact server utils
- Update Demo App
- Fix bug with cache keys
- Improve error handling
- Improve performance
- Clearing logs now filters from last timestamp
- Improve screenshot management and avoid unnecessary casting to base64
- Screenshots are now stored and managed by folder

### Removed

- Remove web version

## [v0.4.1] - 2025-12-24 - The one with screenshots fixed

- Fix error handler when no screenshots is being captured

## [v0.4.0] - 2025-09-01 - The one with screenshots download

### Added

- Add Configurable sampling interval
- Add download button for screenshots
- Add plugin `isSupported` function
- Add set config endpoint
- Add server language initial support (needs more changes to fully support other languages than Lua)

### Changed

- Update roadmap
- Refact server utils
- Update Demo App
- Fix bug with cache keys

## [v0.3.0] - 2025-08-29 - The one with global logs

### Added

- Add check for updates
- Add clear logs button
- Add play/pause logs button
- Add changelog page (github link)
- Add license page (github link)
- Add screenshot plugin
- Add basic UI support for plugins
- Add action support for plugins
- Add screenshot option for error capture
- Add api key support

### Changed

- Logs should be fetched globally not in tab
- Improve readme documentation
- Improve request handling from server

---

## [v0.2.0] - 2025-08-17 - The one with the plugin system and dark mode support

### Added

- Add dark mode support
- Add settings page:
  - custom port
  - custom URL
  - custom editor deeplinking
  - default settings
- Add about page:
  - download feather rock file for the version you are using
  - add mismatch version notification
- Add basic plugin support
  - Add plugin documentation
- Add optional plugins:
  - [signal](https://hump.readthedocs.io/en/latest/signal.html)
  - [lua-state-machine](https://github.com/kyleconroy/lua-state-machine)

## [v0.1.3] - 2025-08-16 - The one with the deep linking fix

### Added

- Fix deep linking pointer
- Fix deep linking
- Log levels & colors
- Improve auto-complete and documentation

## [v0.1.2] - 2025-08-10

### Added

- Improve CI workflow.

## [v0.1.1] - 2025-08-10

### Added

- Add default options to example.
- Add CI workflow for Apps Release.
- Improve Linter.

## [v0.1.0] - 2025-08-10

### Added

- Feather library.
- React frontend.
- README and LICENSE.
- LuaRocks package.
- GitHub Actions CI.

[v0.8.0]: https://github.com/Kyonru/feather/compare/v0.7.0...v0.8.0
[v0.7.0]: https://github.com/Kyonru/feather/compare/v0.6.0...v0.7.0
[v0.6.0]: https://github.com/Kyonru/feather/compare/v0.5.1...v0.6.0
[v0.5.1]: https://github.com/Kyonru/feather/compare/v0.5.0...v0.5.1
[v0.5.0]: https://github.com/Kyonru/feather/compare/v0.4.1...v0.5.0
[v0.4.1]: https://github.com/Kyonru/feather/compare/v0.4.0...v0.4.1
[v0.4.0]: https://github.com/Kyonru/feather/compare/v0.3.0...v0.4.0
[v0.3.0]: https://github.com/Kyonru/feather/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/Kyonru/feather/compare/v0.1.3...v0.2.0
[v0.1.3]: https://github.com/Kyonru/feather/compare/v0.1.2...v0.1.3
[v0.1.2]: https://github.com/Kyonru/feather/compare/v0.1.1...v0.1.2
[v0.1.1]: https://github.com/Kyonru/feather/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/Kyonru/feather/releases/tag/v0.1.0
