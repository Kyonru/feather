# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.3.0] - 2026-05-22 - The one with the extension

### Added

- VS Code Extension
- Session Replay
- CLI Fastlane draft support
- Lua plugin unit tests
- Lua callback bus with priority overrides
- Standalone Showcase build for trying Shader Graph and Particle System Playground in the browser without connecting a game.
- Static love.js preview bridge for standalone shader and particle previews, including showcase build/preview scripts and a publishing workflow.
- Shader Graph custom function, texture input, texture uniform color, texture upload, and preview texture support.
- Expanded Shader Graph node library with complex math, quaternion operations, symmetry, random, pixel-perfect primitives, patterns, halftone, Lab color helpers, composite, Truchet tiles, improved SDF nodes, and broader vertex shader authoring.
- Added Shader Graph vector math nodes for component-wise `vec2`/`vec3`/`vec4` add, subtract, multiply, divide, and scalar scaling.
- Added Shader Graph right-click node insertion, preset insertion, dirty preset replacement confirmation, graph-local subgraph instances, and deterministic link suggestions.
- Shader Graph preset and UI improvements for graph authoring, node inspection, code preview, and standalone preview controls.
- Session Replay checkpoints, seeking, baseline restore, sparse state deltas, and Lua E2E coverage for replay flows.
- Pre-push hook that runs CLI E2E, Lua E2E, app Playwright E2E, and showcase Playwright E2E before pushing.

### Changed

- CLI managed key to identify flow type
- Replay plugins now use the plugin handler bus instead of rewriting LÖVE hooks
- Improved session performance documentation
- Improved session replay examples and documentation
- Improved Feather upload process
- Improved Feather init process
- Improved Feather testing
- Improved CLI build flow
- Improved CLI configuration
- Improved CLI Linux vendoring
- Updated roadmap
- Shim hooks on load
- Improved standalone Shader Graph and Particle System Playground ergonomics, including local in-browser state for showcase mode.
- Improved Shader Graph WebGL preview adaptation for LÖVE shader syntax and precision-qualified uniforms.
- Improved Particle System Playground preview payload handling and emitter list behavior.
- Improved Lua E2E reliability in headless CI by disabling audio for E2E runs and making the Lua E2E timeout configurable.
- Improved audio-debug behavior when `love.audio` is unavailable, allowing headless smoke tests to run.
- Improved doctor reporting for dangerous installed plugins even when bundled catalog data is unavailable or stale.
- Moved standalone showcase deployment toward Railway hosting so love.js previews can be served with COOP/COEP/CSP headers.

### Fixed

- Fixed regex issues in CLI
- Fixed optimistic plugin updates
- Fixed input replay
- Fixed stack overflow on LÖVE hooks
- Fixed Shader Graph `u_time` precision mismatch between vertex and fragment shaders in love.js/WebGL.
- Fixed Shader Graph rounded functions and generated GLSL/WebGL preview handling.
- Fixed standalone showcase Playwright coverage so the showcase test runs only in the dedicated showcase config and uses current preview iframe selectors.
- Fixed CLI Linux AppImage vendor extraction fallback to use `unsquashfs -offset` when direct AppImage execution fails or is non-native.
- Fixed CI-only Lua E2E ALSA/audio startup failures in xvfb environments.
- Fixed doctor E2E fixture setup for dangerous bundled plugin trust checks.

### Tests

- Added standalone showcase Playwright smoke test and dedicated showcase Playwright config.
- Added Lua plugin E2E smoke coverage, including session replay flows.
- Added CLI doctor trust coverage for unknown and dangerous installed plugins.
- Added CLI Linux AppImage fallback tests for `unsquashfs` offset detection and actionable extraction errors.
- Added pre-push local verification for CLI, Lua, app, and showcase E2E lanes.

## [v1.2.0] - 2026-05-19 - The one with the shader and particles playground

### Added

- **Shader Graph** — node-based visual GLSL editor for authoring Love2D pixel and vertex shaders without writing code.
  - 40+ built-in nodes across 9 categories: Input, Math, Vector, Color, UV, Noise, Effect, Vertex, and Output.
  - Input nodes: Texture Color, Texture Coords, Screen Coords, Vertex Color, Time, Resolution, Float, Vec2, Vec3, Vec4 constants.
  - Math nodes: Add, Subtract, Multiply, Divide, Power, Sqrt, Abs, Clamp, Lerp, Step, Smoothstep, Fract, Floor, Ceil, Mod, Min, Max, Sign, Sin, Cos, Atan2.
  - Vector nodes: Combine2, Combine3, SplitVec2, SplitVec3, Dot, Cross, Normalize, Length, MatVecMul, TransformMatrix.
  - Color nodes: Desaturate, OneMinus, HueShift, InvertColor, Contrast, PosterizeColor, MultiplyColor.
  - UV nodes: TilingOffset, RotateUV, TwirlUV, PolarCoordinates.
  - Noise nodes: SimpleNoise, Ripple, VoronoiCells, Checkerboard.
  - Vertex nodes: VertexPosition, VertexWave2D with a dedicated VertexOutput node for vertex shader authoring.
  - Type-safe port connections — incompatible types are rejected; handle colors reflect the GLSL type.
  - GLSL code generation with pixel and vertex shader output, extern declarations, and shared noise helpers.
  - Live GLSL preview panel with syntax highlighting, copy to clipboard, line numbers, and light/dark theme support.
  - Validate against the running game via the `shader-graph` Lua plugin (`compile-shader` action).
  - Apply generated shader directly to a Particle System Playground composite target.
  - Undo/redo history (up to 100 snapshots), Delete/Backspace to remove selected nodes or edges.
  - Import/export graph as `.feathershgh` JSON files.
  - Bundled preset graphs (chromatic aberration, pixelation, grayscale, vignette, wave distortion, and more).
  - Enable/disable toggle integrated with the plugin control system; empty state when the plugin is not active.
  - New `shader-graph` Lua plugin for in-game GLSL compilation and validation.

- **Particle System Playground** — live editor for Love2D composite particle systems with real-time in-game preview.
  - Side-by-side emitter list and full properties panel covering all 30+ Love2D `ParticleSystem` parameters.
  - Visual property editors: color gradient with alpha curve lane, size curve with draggable Catmull-Rom spline, direction/spread gizmo, rotation/spin gizmo, circular force gizmo, linear acceleration plane, damping range editor, and texture offset gizmo.
  - Range pair fields for all min/max properties (speed, spin, rotation, acceleration, damping) with a connecting bar visual.
  - 30 built-in motion presets: Explosion, Whirlpool, Tornado, Wind Drift, Smoke Rise, Gravity Fall, Orbit, Shockwave, Fountain, Fire Sparks, Ember Float, Rain, Snow Drift, Magic Swirl, Portal Inhale, Portal Burst, Spiral Up, Spiral Down, Jet Thruster, Muzzle Flash, Blood Spray, Debris Arc, Dust Puff, Steam Vent, Bubbles, Water Splash, Leaf Gust, Sparks Shower, Energy Beam, Implosion — each with an intensify variant.
  - Texture importer with base64 transport and live preview inside the editor.
  - Shader editor panel with preset shader library and live apply to game.
  - Composite and system selector for multi-emitter setups.
  - Export panel for saving the full composite configuration.
  - New `particle-system-playground` Lua plugin with `draw` and `filesystem` capabilities.

- **Session page** — dedicated `/session` route showing an overview of the active game session.
  - Session card: name, device ID, session ID, insecure connection warning.
  - Environment card: OS, architecture, CPU cores, LÖVE version (when reported by the runtime), Feather runtime version, and API version.
  - Plugins section: all plugins reported by the session with name, version, and enabled/disabled/incompatible badge.
  - Packages section: reads `feather.lock.json` from the project root via Tauri file API; shows package name, version, and trust level badge (`verified` / `known` / `experimental`). Gracefully unavailable for file sessions, web mode, and remote machines.

- **`feather init` capability inference** — when installing plugins in `auto` or `manual` mode, the generated `feather.config.lua` automatically includes the `capabilities` required by the selected plugins (e.g. installing `console` adds `filesystem`).
  - New `--allow-insecure-connection` flag for non-interactive `--yes` flows: `__DANGEROUS_INSECURE_CONNECTION__` is no longer written by default; users must opt in explicitly.

- **Lua config parser** — `feather run` now correctly strips Lua comments before parsing `feather.config.lua`, so commented-out example options no longer interfere with loaded values.

- **`feather run` shim** — CLI-only projects now get an auto-shim that drives `DEBUGGER:update(dt)` without requiring changes to `main.lua`.

### Changed

- `feather doctor` downgrades missing `Desktop App ID` from `fail` to `warn` when `__DANGEROUS_INSECURE_CONNECTION__` is present, reflecting that it is an intentional development override rather than a misconfiguration.

### Fixed

- `feather run` no longer errors on CLI-only projects that have no embedded Feather runtime directory.

### Tests

- `init`: added tests for `--yes` without `--allow-insecure-connection` (config stays clean, doctor fails on appId), `--yes --allow-insecure-connection` (flag written, doctor downgrades to warn), plugin capability propagation into generated config, and interactive mode capability inference.
- `doctor`: added test verifying the missing appId warning when the insecure dev override is enabled.
- `run`: added tests for the CLI-only shim update hook and comment-stripping in the Lua config parser.

## [v1.1.1] - 2026-05-17 - The one with better defaults

### Changes

- cli is the default configuration

## [v1.1.0] - 2026-05-17 - The one with the watcher

### Added

- **Watch mode** — `feather watch` allows you to watch your game files for changes and automatically rebuilds the project when they change. Currently (desktop | android | ios | steamos).
- **SteamOS run/watch** — `feather run --target steamos` and `feather watch --target steamos` build a SteamOS package and notify the local SteamOS Devkit Client when available.

### Changed

- **Fast Builds** - By default, when building android or ios, it only bundles creates a new `game.love` and uses existing installed APK or IPA files instead of rebuilding the entire project.
- `--clean` now clears all cache.
- `--no-cache` now ignores exiting APK or IPA.
- `feather build vendor add --target <target>` can be used instead of positional vendor targets.
- **Simpler target flags** — `feather doctor --target <target>` now matches `run` and `watch`; `--build-target` remains as an alias.
- Update screenshots.

### Fixes

- Fixes remote debugger for zero config flows
- Debugger shortcuts

## [v1.0.1] - 2026-05-17 - The one with auto load config

### Fixes

- Use `feather.config.lua` for `feather.auto`

## [v1.0.0] - 2026-05-17 - The one with platform builds

### Added

- **Build pipeline** — `feather build` now supports `.love`, web, Android, iOS, Windows, macOS, Linux, and SteamOS targets.
  - Added mobile release build support for Android and iOS.
  - Added desktop runtime packaging for Windows, macOS, Linux, and SteamOS.
  - Added web build output and web run support.
  - Added vendor management with `feather build vendor add/list` for build templates and runtimes.
- **Upload pipeline** — added `feather upload` support for publishing build artifacts, including itch.io workflows.
- **Run targets** — `feather run` can now launch desktop, web, Android, and iOS development flows.
  - Added mobile run cache support to speed up repeated Android/iOS iteration.
  - Added Android/iOS device and simulator launch helpers.
- **CLI doctor expansion** — `feather doctor` now includes deeper environment, project, security, production, vendor, and build-target checks.
  - Added `--production`, security-focused checks, and build-target diagnostics.
  - Added structured JSON diagnostics used by the desktop app.
- **Desktop CLI awareness** — Settings now detects the Feather CLI, reports CLI version/path/source, checks Node/npm, and runs read-only project doctor/vendor summaries.
  - Added CLI path override and project directory selection.
  - Added CLI/Desktop version mismatch warnings.
  - Added docs links and copyable fix commands for missing setup.
- **Safe editor launch** — replaced shell-based source opening with a dedicated Tauri command that validates editor paths and project-relative file locations before launching VS Code.
- **First-run guidance** — added no-session setup prompts for installing the CLI, opening docs, connecting a LÖVE project, and copying `feather run`.
- **Package catalog growth** — added packages including baton, beehive, cargo, g3d, knife, love-dialogue, lovebpm, lua-state-machine, shove, SYSL-text, and tiny-ecs.
- **Custom package installs** — added `feather package add` workflows for custom packages, branch/commit-based sources, submodules, and provenance metadata.
- **CLI tooling and tests** — added package helper scripts and a broader CLI command test suite for build, doctor, package, plugin, run, runtime, and upload commands.

### Changed

- Refactored CLI command structure, shared UI components, output formatting, and interactive workflows for init, package, plugin, remove, and update commands.
- Hardened package, plugin, and filesystem mutation paths with path safety checks, provenance tracking, trust validation, redaction, and more auditable output.
- Improved lockfile handling for package installs and audits.
- Improved package registry generation and switched package source references toward pinned commit hashes.
- Improved documentation for installation, usage, assets, debugger, recommendations, CLI workflows, and minimal examples.
- Refined desktop settings into tabbed sections with CLI, assets, editor, connection, and security controls.
- Improved light/dark theming, plugin sidebar states, plugin button-style inputs, observability controls, and empty states.
- Updated Lua runtime/plugin internals, including safer `auto.lua` loading, plugin manager improvements, and debug overlay support.

### Fixed

- Fixed custom package add behavior and terminal input cleanup.
- Fixed iOS build behavior and error messages.
- Removed Lua `goto` usage that could trigger runtime errors.
- Removed frontend dependency on arbitrary shell execution for opening source locations.

## [v0.10.0] - 2026-05-13 - The one with the internal package manager

### Added

- **Package manager** — `feather package` command group for installing and managing LÖVE libraries
  - Curated catalog of 11 libraries: anim8, bump, classic, flux, hump (+ subpackages), inspect, lume, middleclass, push, sti, windfield
  - `feather package install <name>` — downloads and verifies files against pinned SHA-256 before writing to disk
  - `feather package install` (no args) — restores all packages recorded in `feather.lock.json`; skips files already verified
  - `feather package install <name>@<version>` — installs a specific version, treated as `experimental` (requires `--allow-untrusted`)
  - `feather package install --from-url <url> --target <path>` — install any Lua file by URL; SHA-256 computed live and stored
  - `feather package update [name]` — updates installed packages to the registry-pinned version
  - `feather package remove <name>` — deletes installed files and removes the lockfile entry
  - `feather package audit` — re-hashes every installed file and compares against `feather.lock.json`; exits 1 if any file is missing or modified
  - `feather package search [query]` — filters catalog by name, description, or tag
  - `feather package info <name>` — shows source, trust level, files, and usage snippet
  - `feather package list` — interactive TUI browser (falls back to plain text when not a TTY)
  - Three trust levels: `verified` (Feather-reviewed, pinned SHA-256), `known` (checksum-pinned), `experimental` (`--from-url` or version override)
  - `feather.lock.json` lockfile — records exact version and SHA-256 of every installed file; designed to be committed
  - `--dry-run`, `--offline`, `--allow-untrusted`, `--json` flags across subcommands
- **Registry pipeline** — `packages/*.json` source files compose into a `registry.json` snapshot via `scripts/generate-registry.mjs`; GitHub Actions publishes it to the `packages` branch automatically on every change
- **Interactive TUI** — `feather package list` uses an ink-based browser with search, navigation, and an action picker (install / update / remove)
- **Install progress UI** — live per-file download and checksum status for installs and updates
- **GitHub issue templates** — package request, plugin request, and bug report

## [v0.9.3] - 2026-05-11 - The one with NPM releases

- fix npm step release

## [v0.9.2] - 2026-05-11 - The one with NPM (broken) releases

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

[v1.3.0]: https://github.com/Kyonru/feather/compare/v1.2.0...v1.3.0
[v1.2.0]: https://github.com/Kyonru/feather/compare/v1.1.1...v1.2.0
[v1.1.1]: https://github.com/Kyonru/feather/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/Kyonru/feather/compare/v1.0.1...v1.1.0
[v1.0.1]: https://github.com/Kyonru/feather/compare/v1.0.0...v1.0.1
[v1.0.0]: https://github.com/Kyonru/feather/compare/v0.10.0...v1.0.0
[v0.10.0]: https://github.com/Kyonru/feather/compare/v0.9.3...v0.10.0
[v0.9.3]: https://github.com/Kyonru/feather/compare/v0.9.2...v0.9.3
[v0.9.2]: https://github.com/Kyonru/feather/compare/v0.9.0...v0.9.2
[v0.9.0]: https://github.com/Kyonru/feather/compare/v0.8.0...v0.9.0
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
