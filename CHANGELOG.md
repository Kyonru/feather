# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v4.0.0] - 2026-06-14 - The one with MCPs

### Added

- Added `feather mcp` with stdio and localhost Streamable HTTP transports for token-protected MCP access to live Feather desktop sessions.
- Added desktop Settings → Security → MCP Access controls for enabling the local MCP bridge, copying client config, and regenerating the bridge token.

### Tests

- Added MCP CLI, Tauri bridge, and Settings coverage for token auth, sanitized session snapshots, command routing, and visible MCP controls.

## [v3.3.1] - 2026-06-14 - The one with fixed versions

### Changed

- Update feather version to the expected v3.3.1

## [v3.3.0] - 2026-06-08 - The one with package dependency

### Added

- Added exact catalog package dependencies with dependency-first install resolution.
- Added generated package dependency aliases so shared Lua libraries can satisfy upstream-specific require paths without vendoring.
- Added package-lock compatibility metadata and early update guidance for unsupported future lockfile features.
- Added Git-transport package sources for private repositories using the user's configured terminal Git credentials.
- Added opt-in package license file installation with checksum, audit, restore, and remove support.
- Added a package catalog license backfill script for discovering upstream license files.

### Tests

- Added package resolver coverage for dependency ordering, cycles, missing deps, and install conflicts.
- Added package installer coverage for generated dependency aliases, restore, audit, remove, and target collision handling.
- Added package-lock compatibility fixture coverage for old locks, generated aliases, future-feature guards, and doctor output.
- Added package installer coverage for Git-transport installs, restores, checksum failures, and ref mismatch errors.
- Added package installer coverage for opt-in license files across raw, Git, restore, audit, and remove paths.

## [v3.2.0] - 2026-06-02 - The one with texture maps

### Added

- Added Texture Lab Shader map generators for normal, flow, ripple, and distortion PNGs.
- Added Texture Lab image-to-mask and SDF/glow generators for masks, outlines, glows, and distance-field-style VFX textures.
- Added fixed-layout package metadata for libraries that require project-root support files, including Menori's `libs/json.lua`.

### Changed

- Improved Texture Lab layout and atlas editing so side panels stay usable, previews have more room, and expensive atlas renders do not block controls.
- Shader Graph palette drops now briefly highlight the newly created node.

### Tests

- Added focused/app/showcase coverage for Texture Lab Shader maps, image masks, SDF/glow generators, and atlas UI workflows.
- Added package installer and package e2e coverage for fixed-layout package paths.

## [v3.1.0] - 2026-06-01 - The one with particles improvements

### Added

- Particle Playground timeline editing now supports emitter visibility, grouped clip/keyframe moves, and scratch-composite undo/redo.
- Added Texture Lab for procedural particle sprites, masks, noise, gradients, spline paths, and shape/polygon textures.
- Texture Lab can send generated PNGs to Particle Playground emitters and Shader Graph texture slots.
- Texture Lab supports saved recipes, solid/background color controls, generator-specific resets, spline overlap modes, and direct spline/shape editing.
- Texture Lab dimensions now include `4 x 4`, `8 x 8`, `16 x 16`, and custom width/height outputs.
- Texture Lab atlas authoring now includes editable frames, seeded fills, onion skinning, uploaded-frame replacement, ZIP export, Particle Playground atlas metadata, and safe all-frame actions.
- Added persisted local creative sessions for game-free Shader Graph, Particle Playground, and Texture Lab workspaces.

### Changed

- Texture Lab now keeps Comet Tail and Slash as Spline Trail path presets instead of redundant hardcoded generators.

### Fixed

- Fixed Shader Graph embedded previews for Fake 3D and other derivative-based nodes so Preview nodes/showcase previews match the game runtime instead of falling back silently.
- Fixed Texture Lab Shapes & Polygons so Spline layers can be edited in the preview point editor.
- Fixed Texture Lab generator and spline preset switching so each preset restores its default controls instead of inheriting stale values from the previous recipe.
- Fixed Particle Playground timeline drags so focused numeric clip editors cannot write stale values back over direct clip movement.
- Fixed local Particle Playground previews so web and creative-session playback follow authored timeline timing.
- Fixed CLI watch startup so immediate Android/iOS file edits are not missed while the native watcher settles.

### Tests

- Added focused Shader Graph coverage for WebGL preview derivative support.
- Added focused/Lua/app/showcase coverage for Particle Playground timeline grouping, undo/redo, atlas metadata, and export paths.
- Added app/showcase coverage for local Particle Playground preview timeline playback.
- Added focused Texture Lab dimension coverage alongside app/showcase coverage for generators, recipes, spline/shape editing, atlas workflows, layout, and confirmation dialogs.
- Added focused/app coverage for creative session persistence and local creative-tool access without runtime commands.

## [v3.0.0] - 2026-05-31 - The one with core workflows

### Added

- Shader Graph gained inline Preview nodes, local diagnostics, richer canvas controls, composition helpers, Fake 3D nodes, template subgraphs, and right-panel Controls.
- Particle Playground gained a timeline editor with clips, keyframed lanes, real LÖVE scrubbing, beginner/complex templates, Ambient mode, and continuous weather-style presets.
- Added core workflow tooling for runtime suspend/resume, core Profiler captures, debugger profiler probes, function wrapping, invocation run comparison, and developer-preview golden checks.
- Added runtime impact controls, including overhead telemetry, panel-driven runtime interest, frame/message/byte budgets, deferred profiler uploads, and batched normal logs.
- Added app customization and navigation polish with expanded theme families, pinned sidebar Favorites, grouped sidebar sections, and refreshed Settings/About screens.
- Added the opt-in Feel Inspector plugin for feel.lua sequences, active plays, targets, recent events, and LOVE adapter state.

### Changed

- Reworked Shader Graph authoring around reusable subgraphs, docked controls, safer previews, selected-node inspection, palette organization, and adaptive connected-game preview FPS.
- Reworked Particle Playground timeline authoring around direct clip/keyframe editing, shared timing coordinates, smooth playback, easing curves, explicit preview controls, and timeline-driven Lua exports.
- Particle Playground `.featherparticles` files now save as version 3 with authoritative timeline modes while importing older loop booleans safely.
- Particle Playground exports now expose `play`, `pause`, `stop`, `setLoop`, `setMode`, and compatibility `emit` behavior that replays authored timelines.
- Creative previews now stay dormant by default, run on demand, and can keep animating from the last payload while the runtime is suspended.
- Profiler moved from a plugin to the core `DEBUGGER.profiler` service, with a capture workspace, named snapshots, hotspot bars, zoomable run strips, and idle-by-default behavior.
- Performance now shows Feather overhead in its own tab, and runtime sampling uses active-panel interest plus budgets so high-cost work stays dormant until needed.

### Fixed

- Fixed Shader Graph preview reliability across texture uploads, texture-heavy subgraphs, WebGL fallback, preview-ready handshakes, aspect ratio, zoom, pin controls, and connected-game lifecycle.
- Fixed Shader Graph authoring edge cases for palette dragging, collapsed standalone layouts, type-correct texture suggestions, template texture codegen, and Output-tab preview persistence.
- Fixed Particle Playground timeline/runtime parity for delayed clips, emitter reorder/delete, stop/reset recovery, smooth playback, local preview timing, easing export, overlapping instances, and loop/mode overrides.
- Fixed Particle Playground preview and layout issues, including stale game-preview work, Tauri fallback playback, app-pane scrolling, muted paused emission, and Ambient continuous playback.
- Fixed runtime performance spikes by spreading sample pushes, gating idle observers/assets/plugins, throttling In-Game Overlay sampling, and moving Runtime Snapshot to opt-in low-frequency pushes.
- Fixed session/log/profiler reliability around reconnect handshakes, follow-tail, log-history quota pressure, callback wrapper preservation, immediate profiler refreshes, and responsive filter/toolbars.
- Fixed Tauri dev reload and CSP problems that could block Vite modules or Tauri IPC while preview isolation headers were enabled.

### Tests

- Expanded focused/app/showcase coverage for Shader Graph diagnostics, Preview nodes, texture-heavy uploads, composition helpers, Fake 3D nodes, template subgraphs, and right-panel workflows.
- Expanded Lua/app/showcase coverage for Particle Playground timeline editing, easing, templates, Ambient mode, preview activation, export playback, and reordered emitter safety.
- Added Lua/app coverage for the core Profiler runtime, debugger probes, function wrapping, invocation samples, run comparison, and deferred profiler uploads.
- Added Lua/app coverage for runtime impact controls, overhead telemetry, panel-driven interest, log batching, suspended creative previews, and In-Game Overlay throttling.
- Expanded app/focused coverage for themes, Settings/About/sidebar polish, log history, reconnects, responsive layouts, and golden workflow acceptance paths.
- Added Lua coverage for the Feel Inspector plugin registration, handler preservation, replay/clear actions, and LOVE adapter summaries.

## [v2.0.0] - 2026-05-26 - The one with better traces

### Added

- Added Command Center discovery, Console result inspectors, live Observability pins, and safer read-only runtime inspection.
- Added opt-in callback crash recovery with Session controls and in-game error toasts while keeping normal crash behavior as the default.
- Added Performance Health and Profiler workflows with richer charts, spike triage, scoped captures, snapshots, diffs, and JSON export.
- Added deeper Observability and Debugger triage, including observer groups/history, pause-on-error, condition errors, reliability status, and stack-frame variables.

### Changed

- Reworked Logs, Debugger, Console, Assets, Compare, Session, and Performance into denser, more predictable workflow screens.
- Improved Profiler captures with start/stop recording, raw timing values, percent totals, calls-per-second, metadata, and error-safe wrappers.
- Added persisted sidebar visibility controls and hid unused sidebar/disabled plugin entries from Command Center by default.
- Improved live-session refresh behavior so selecting a session re-requests config and runtime data instead of showing stale desktop state.
- Shader Graph Output now keeps GLSL as the scrollable tab content while diagnostics and preview/apply controls stay docked at the bottom.

### Fixed

- Fixed asset load deduplication, preview enabled reporting, and runtime-created asset tracking.
- Fixed callback error handling so captured game errors rethrow by default instead of being silently swallowed.
- Fixed CLI-managed debugger path matching, step-debugger startup defaults, and traceback path stripping.
- Fixed Performance/Compare empty and partial data states so missing metrics render safe fallbacks instead of broken units.
- Fixed Logs repeat counts, detail syncing, clear behavior, and row selection during live updates.
- Fixed narrow Console layouts and Shader Graph alpha-masked node previews.

### Tests

- Expanded app e2e coverage for responsive and degraded triage states, including missing sessions, partial payloads, missing/disabled plugins, and narrow layouts.

## [v1.5.0] - 2026-05-26 - The one with particles playground fixes

### Added

- Added portable `.featherparticles` project save/import for Particle System Playground so editable composites can be continued later.
- Session page now shows sample rate, save directory, project root, the global capability allowlist (or "all"), per-plugin capability badges (colour-coded by type), and the incompatibility reason when a plugin is blocked.
- Bookmark plugin timeline now shows a full-size screenshot preview in a dialog when clicking a bookmark thumbnail.

### Changed

- Particle System Playground exports now generate drop-in Lua modules with `init`, `update`, `draw`, `emit`, and `release` lifecycle functions.
- Particle System Playground Emit and Reset now replay the whole enabled composite, with per-emitter enabled toggles and a scratch preview pause.
- CLI plugin selection (in `feather init`, `feather create`, and `feather plugin`) now shows each plugin's capability requirements (e.g. `[filesystem]`, `[draw, filesystem]`) alongside the description so users know what they are opting into.
- CLI interactive selection lists (`feather init`, `feather plugin`, `feather create`, etc.) now use a scrolling 10-item viewport with `↑ N more` / `↓ N more` indicators so large lists (plugins, packages, vendors) no longer overflow the terminal.

### Fixed

- Fixed Screenshots plugin GIF recording disconnecting the WebSocket client by draining binary frame payloads gradually (2 per game frame) instead of flushing all frames in a single push, which overflowed the non-blocking socket buffer.
- Fixed disabled plugins receiving and executing action, params-update, and cancel requests; all plugin dispatch paths now bail early when `plugin.disabled` is true.
- Fixed CLI-managed step debugging so breakpoints and paused stack frames normalize absolute game paths back to project-relative files.
- Fixed Particle System Playground exports with shaders so generated modules embed shader source directly in `init.lua` instead of requiring runtime `.glsl` file reads.
- Fixed Particle System Playground pending property edits so debounced changes stay scoped to the emitter they were made on when switching emitters.
- Fixed Particle System Playground numeric fields so negative values can be typed without intermediate `-` or empty states being coerced to `0`.
- Fixed Particle System Playground numeric snapshots so LÖVE float precision noise like `0.10000000149012` is rounded before returning to the UI.
- Fixed Shader Graph numeric fields so negative and in-progress decimal values can be typed without being coerced mid-edit.

### Tests

- Added Lua e2e coverage for the Particle System Playground drop-in export format.
- Added Lua e2e coverage for Particle System Playground composite-wide emit/reset, disabled emitters, and preview pause behavior.
- Added Lua e2e coverage for Particle System Playground project export/import.

## [v1.4.2] - 2026-05-25 - The one with fixed cli

### Added

- Added `--install-dir` and `--save-install-dir` to `feather package install` so catalog packages can be installed under a custom base directory and keep that location for future installs and updates.
- Renamed package install targeting flags to `--flat-dir` for catalog flattening and `--target-path` for `--from-url`; `--target` remains as a hidden compatibility alias.

### Fixed

- Fixed the global `feather` npm bin so symlinked installs execute the CLI instead of exiting silently.

### Tests

- Added CLI help coverage for symlinked global-bin execution.
- Added package CLI coverage for custom install directories, saved install directory lockfile metadata, and install-dir validation.

## [v1.4.1] - 2026-05-24 - The one with the correct extension name

### Fixed

- Change extension name to `feather-cli-vscode`.

## [v1.4.0] - 2026-05-23 - The one with create command

### Added

- Added `feather create <project-name>` to bootstrap Love2D projects from the Oval-Tutu template, configure Feather CLI mode, create a Makefile command surface, and optionally set up plugins, packages, and build vendors.
- Added FEATHER ASCII banner printed at the start of `feather init` and `feather create` (suppressed with `--yes`).
- Added `--allow-non-lua-files` flag to `feather package install` — by default only `.lua` files are permitted; this flag opts into installing packages that include non-Lua files such as shaders or images.
- Added 9 new catalog packages: flexlove, smiti18n, tween, busted, moonshine, cdata, bitser, ripple, lue.
- Added missing shader assets (`g3d.vert`, `g3d.frag`) to the g3d catalog entry so `require('lib.g3d')` works without errors.
- Added `scripts/package-e2e.mjs` — installs every catalog package then runs Love2D to verify each can be required without error or load-time output; available as `npm run test:packages:e2e`.
- Added `FEATHER_PACKAGE_E2E_GAME_DIR` env var to cache installed packages across e2e runs (skips re-download when all registry files are present).
- Added Agent Skills and CLAUDE.md for agent-assisted development.
- Added GitHub Release, npm, npm downloads, VS Code Marketplace, and LuaRocks badges to README, plus demo link.

### Changed

- Registry publish workflow (`registry.yml`) now installs Love2D and runs the package e2e as a guard step before pushing to the packages branch — a broken catalog entry blocks the publish.

### Fixed

- Removed `knife.gun` from the knife catalog — the upstream file calls `os.exit()` unconditionally (joke module titled "Give Up Now"), which terminated Love2D during the e2e run with no catchable Lua error.

### Tests

- Added CLI create command coverage for template ref resolution, project safety checks, Oval-Tutu cleanup, VS Code recommendations, Makefile generation, optional setup hooks, and git identity recovery.
- Added package loadability e2e covering all 38 require paths across 22 catalog packages; load-time error output (matching `error`, `failed`, `not found`, `could not`) is treated as a failure.

## [v1.3.1] - 2026-05-23 - The one with extension releases

### Fixed

- Fix extension configuration

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
  - `feather package install --from-url <url> --target-path <path>` — install any Lua file by URL; SHA-256 computed live and stored
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

[v3.3.0]: https://github.com/Kyonru/feather/compare/v3.2.0...v3.3.0
[v3.2.0]: https://github.com/Kyonru/feather/compare/v3.1.0...v3.2.0
[v3.1.0]: https://github.com/Kyonru/feather/compare/v3.0.0...v3.1.0
[v3.0.0]: https://github.com/Kyonru/feather/compare/v2.0.0...v3.0.0
[v2.0.0]: https://github.com/Kyonru/feather/compare/v1.5.0...v2.0.0
[v1.5.0]: https://github.com/Kyonru/feather/compare/v1.4.2...v1.5.0
[v1.4.2]: https://github.com/Kyonru/feather/compare/v1.4.1...v1.4.2
[v1.4.1]: https://github.com/Kyonru/feather/compare/v1.4.0...v1.4.1
[v1.4.0]: https://github.com/Kyonru/feather/compare/v1.3.1...v1.4.0
[v1.3.1]: https://github.com/Kyonru/feather/compare/v1.3.0...v1.3.1
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
