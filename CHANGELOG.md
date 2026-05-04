# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.6.0] - 2026-05-04 - The one with the plugin ecosystem

### Added

- Improve plugin system with server-driven UI (actions, params, toggle)
- Add built-in plugins:
  - Console / REPL — execute Lua code remotely
  - Profiler — function-level CPU profiling
  - Input Replay — record and replay input sequences
  - Entity Inspector — ECS entity browser
  - Config Tweaker — live game config editing
  - Bookmark — mark and navigate to points of interest
  - Network Inspector — HTTP/WS traffic monitor
  - Memory Snapshot — heap snapshots and leak detection
  - Physics Debug Draw — love.physics overlay renderer
  - Particle Editor — live ParticleSystem editor
  - Audio Debug — inspect love.audio state and sources
  - Coroutine Monitor — track active coroutines with stats
  - Collision Debug — visualize bump.lua AABB worlds
  - Animation Inspector — inspect anim8 sprite animations
  - Timer Inspector — monitor HUMP timers and flux tweens
- Add plugin enable/disable toggle from desktop
- Add `auto.lua` zero-config entry point (`require("feather.auto")`)
- Add `install-feather.sh` curl-pipe-sh installer script
- Add mobile connection info in settings (auto-detect local IP, copyable config)
- Add multiple sessions connection
  - Add per-session version mismatch warning on session tabs
  - Add session persistence across reconnects
- Add disk mode for logging without WebSocket (Android/iOS)
- Add late connection support (game starts before desktop app)
- Add sandbox option for console plugin
- Add option to disable log file writing

### Changed

- Change architecture from REST to WebSocket
- Improve plugin documentation
- Improve screenshots plugin
- Move version mismatch from global sidebar to per-session tab indicator

### Fixed

- Broken app layout

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
