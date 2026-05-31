# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v3.1.0] - 2026-06-01 - The one with particles improvements

### Added

- Particle Playground timeline rows now include emitter visibility toggles and grouped clip/keyframe selection for clamped horizontal timing moves.
- Particle Playground scratch composites now have in-memory undo/redo history with toolbar buttons plus `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, and `Ctrl+Y` shortcuts.
- Added Texture Lab, a shared procedural PNG generator for particle sprites, masks, noise maps, pixel patterns, gradients, and trail textures that can feed Particle Playground and Shader Graph texture slots.
- Added editable Texture Lab spline path generators for trails, ribbons, masks, and lightning strokes.
- Texture Lab spline points now use explicit fill, border color, and border width styles with a separate selected-point highlight, and Texture Lab includes a quick reset for the current generator values.

### Fixed

- Fixed Particle Playground timeline drags so focused numeric clip editors cannot write stale values back over direct clip movement.

### Tests

- Added app and showcase e2e coverage for timeline visibility toggles and grouped timeline dragging.
- Added focused history reducer tests plus Lua, app, and showcase coverage for Particle Playground undo/redo restores.
- Added focused Texture Lab generator tests plus app/showcase coverage for the generator page and creative texture picker workflows.
- Added focused spline generator coverage plus app/showcase checks for editing Texture Lab path points.
- Added focused/app/showcase coverage for Texture Lab generator resets and spline point styling.

## [v3.0.0] - 2026-05-31 - The one with core workflows

### Added

- Improved Shader Graph compiler UX with local diagnostics for missing outputs, stale connections, missing texture uploads, invalid custom functions, and cyclic subgraphs before runtime validation.
- Added Shader Graph Preview nodes as inline RGBA probes with embedded love.js previews and an optional send-to-game control for connected LÖVE sessions.
- Shader Graph now renders only the selected Preview node's embedded love.js probe so multiple inline probes do not run preview runtimes at the same time.
- Added zoom controls to Shader Graph Preview nodes for inspecting details inside embedded love.js previews.
- Shader Graph Preview node game-preview buttons now toggle the connected-game probe off after sending it live.
- Added pinning for Shader Graph Preview nodes so chosen embedded previews stay live when another node is selected.
- Expanded Shader Graph canvas zoom range for inspecting dense node clusters and large graphs.
- Added Shader Graph canvas mode buttons for switching empty-canvas drags between node selection and panning.
- Shader Graph now deletes all selected nodes together with one Delete/Backspace action.
- Shader Graph connected-game previews now dedupe and throttle live updates while the runtime caches preview shaders and draws through a capped overlay canvas.
- Showcase dev now serves a generated real love.js preview target so Shader Graph Preview nodes exercise the same LÖVE path during browser development.
- Shader Graph Preview nodes now keep a stable embedded preview aspect ratio instead of stretching to an arbitrary fixed height.
- Added all 11 Noctis theme variants as optional app themes with matching syntax highlighting while keeping Feather Light, Feather Dark, and System defaults.
- Expanded GitHub themes with Light Default, Light High Contrast, Light Colorblind, Dark Default, Dark High Contrast, Dark Colorblind, and Dark Dimmed alongside the classic GitHub Light theme.
- Added a curated Rainglow VS Code theme selection, including Hawaii, Heroku, Hive, Horizon, Hyrule, and Iceberg families, as optional app themes grouped into Light, Dark, and Contrast options with matching syntax highlighting.
- Added Tokyo Night Light, Tokyo Night, and Tokyo Night Storm as optional app themes with matching syntax highlighting.
- Added Microsoft Visual Studio C/C++ Light, Dark, 2017 Light, and 2017 Dark as optional app themes with matching syntax highlighting.
- Added pinned sidebar Favorites for common tools, with Settings controls and quick star actions for pinning tools from the sidebar.
- Added Shader Graph composition helper nodes for effect mixing, alpha/luma/range/color-key masks, palette swaps, gradient maps, mask combining, blend modes, and color ramps.
- Added Shader Graph Fake 3D nodes for billboard UVs, parallax UVs, sprite texture sampling, depth shading, card shadows, and packed atlas sprite stacks.
- Added Shader Graph template subgraphs for presets, with explicit Subgraph Input/Output boundary nodes and public Template Controls for common effect knobs and texture slots.
- Added Shader Graph right-panel tabs with a Controls view that collects Template Controls and root Parameter nodes before the Selection inspector and Output panel.
- Added a Particle System Playground Timeline tab with emitter clips, keyframed opacity/rate/speed/size/direction/spread/offset lanes, transport controls, and real LÖVE preview scrubbing.
- Added timeline-authored beginner Particle System Playground templates for Fire, Explosion, Smoke, Sparkles, Muzzle Flash, Magic Burst, and Dust Puff.
- Added a Complex Composite Particle System Playground template with five emitters and a staggered authored timeline for combining burst, ring, smoke, spark, and dust layers.
- Added Ambient timeline mode and Snowfall, Rainfall, and Falling Leaves templates for continuous Particle System Playground effects.
- Added a session-tab suspend/resume control that temporarily pauses Feather runtime work in a connected game while keeping the command socket available.
- Added an opt-in Feel Inspector plugin for feel.lua sequences, active plays, targets, recent events, and LOVE adapter state.
- Added Debugger Profiler Probes so source gutter markers can start, stop, or snapshot the core profiler without adding a second Lua debug hook.
- Added Debugger Profile Function probes that automatically wrap supported global/table functions for core Profiler captures.
- Added exact Profiler invocation samples and a Run Comparison drawer for comparing individual executions against A/B, previous, first, best, or median baselines.
- Added a golden workflow checklist for validating connect/session health, logs, performance/profiler, debugger/probes, and runtime inspection before developer-preview use.

### Changed

- Reworked the Settings modal with a wider responsive layout, left-side navigation, page summaries, framed setting groups, and clearer autosave/status cues.
- Reworked the About modal with clearer app identity, version/update status, quick actions, feature summaries, and project links.
- Reworked the main sidebar into Favorites, Core, Inspect, Creative, and History groups for faster scanning.
- Improved Shader Graph node palette scanability with collapsible category sections, remembered section state, node counts, and search that opens matching collapsed sections.
- Shader Graph presets now load and insert as reusable Subgraph instances instead of expanding full flat graphs onto the root canvas.
- Shader Graph previews in Feather dev and showcase dev now use the same generated love.js target when available so embedded node previews render through the same LÖVE path.
- Shader Graph Parameter nodes can now be edited from the Controls tab, including labels, defaults, texture uploads, uniform names, connection warnings, and select-node actions.
- Shader Graph now opens the Selection tab when a node is selected and lets Space toggle the canvas between selection and panning modes.
- Shader Graph connected-game previews now start runtime canvas refresh at 60 FPS and automatically lower to 40, 30, or 24 FPS for highly zoomed or large-texture previews.
- Particle System Playground project files now save as `.featherparticles` version 3 with authoritative timeline modes, while version 1/2 imports migrate legacy loop booleans to One-shot or Loop.
- Particle System Playground Lua exports now replay saved timelines from `emit(payload)`, including scheduled clips, keyframes, non-looping stops, and looping playback.
- Improved Particle System Playground Timeline layout so the editor fills the available width and clips, playhead, zoom, and keyframe strips align on one timeline scale.
- Reworked the Particle System Playground Timeline tab with video-editor-style clip dragging, resize handles, inline selected-emitter lanes, draggable keyframe timing, a selection inspector, and remembered zoom/snap preferences.
- Renamed Particle System Playground timing controls so clip entry time is shown as Emit At and burst counts are shown separately from timing.
- Particle System Playground timelines now treat clips as emission windows, intersect clip timing with Emitter Lifetime, preserve particle-life tails across loop boundaries, and show non-editable tail overlays in the Timeline tab.
- Particle System Playground timeline playback now animates the visible playhead smoothly between runtime updates instead of jumping in coarse connected-game intervals.
- Particle System Playground timeline keyframes now support curated easing curves, including hold, sine, quad, cubic, quart, expo, back, elastic, and bounce shapes, with expanded lanes drawing the resulting value curve.
- Particle System Playground keeps the local love.js preview in the browser showcase, while the Feather/Tauri app now uses connected-game runtime preview only through the explicit Show in Game toggle.
- Particle System Playground showcase previews now float over the editor and keep a locked 16:9 love.js canvas aspect ratio.
- Particle System Playground replaced the header Emit action with a Play action that starts timeline playback.
- Particle System Playground now colors Show in Game green and Hide in Game red so connected-game preview state is easier to scan.
- Particle System Playground Lua exports now include `play`, `pause`, and `stop` methods, with `emit` kept as a compatibility alias for timeline playback payloads.
- Particle System Playground Lua exports now play authored timeline bursts exactly instead of applying a payload-level amount scale.
- Particle System Playground Lua exports now expose `setLoop` and `isLooping`, and `play({ loop = ... })` can override the saved timeline loop setting per playback.
- Particle System Playground Lua exports now expose `setMode` and `getMode`, and `play({ mode = ... })` can override saved One-shot, Loop, or Ambient behavior per playback.
- Feather now keeps creative preview runtime work dormant until Particle Playground or Shader Graph previews are explicitly active.
- Feather runtime suspend now keeps explicitly active Shader Graph and Particle Playground in-game previews animating from their last payload, and lets the In-Game Overlay keep sampling/drawing while other runtime work stays paused.
- Reduced idle connected-game overhead by throttling callback/asset rehook checks and batching log-history persistence.
- Feather now spreads connected-game sample pushes across frames so performance, observer, asset, plugin, and GC work no longer lands in one once-per-second burst.
- Runtime Snapshot is now opt-in, disabled by default, and uses a low-frequency live push interval when enabled.
- Profiler is now a core Feather runtime service available as `DEBUGGER.profiler`, with the old profiler plugin path removed and captures idle by default until explicitly started.
- Reworked the Profiler tab into a capture workspace with Record/Finish capture controls, named snapshots, and hotspot bars for the highest-cost instrumented functions.
- Profiler command and debugger-probe state uploads are now deferred onto Feather's runtime update lane so stop/snapshot probes do not serialize large captures inside the profiled call.
- Profiler run strips are now zoomable and horizontally scroll inside the Run Comparison drawer instead of widening the drawer content.
- Feather now reports its own runtime overhead in Performance, including update cost, transport bytes, deferred work, budget misses, and top plugin costs.
- Performance now puts Feather runtime overhead in its own Overhead tab instead of crowding the Health view.
- Feather runtime sampling now uses panel-driven interest and frame/message/byte budgets so observers, assets, plugin payloads, and high-cost plugin updates stay dormant until their page or explicit workflow needs them.
- Feather websocket logs are now batched for normal output while errors, fatal lines, and session start/finish still flush immediately.

### Fixed

- Fixed log type badges so their text and icons keep readable contrast across light, dark, and Noctis themes.
- Fixed live session logs disappearing after reopening Feather or restarting a CLI-launched game by restoring recent log history from a bounded local cache.
- Fixed local log-history persistence so storage quota pressure no longer interrupts Particle Playground timeline editing.
- Fixed the Settings modal close button so it no longer overlaps the version badge in the header.
- Fixed Debugger Profile Function probes on `love.*` callbacks so profiling `love.keypressed`, `love.update`, and other managed callbacks preserves the game's original callback logic after Feather rehooks callbacks.
- Fixed the Performance Profiler filter row so controls wrap instead of overflowing at medium desktop widths.
- Fixed the Logs toolbar so search takes its own row before filters and actions when horizontal space is tight.
- Fixed Feather dev Shader Graph node previews by serving the generated love.js preview route with the required isolation headers.
- Fixed showcase love.js shader previews so node preview zoom is honored by the real LÖVE preview target.
- Fixed Shader Graph preview probes so embedded love.js previews use the same 16:9 aspect ratio in web and preserve uploaded texture proportions while zooming.
- Fixed Shader Graph Preview nodes so uploaded preview textures are passed through the embedded love.js bridge instead of falling back to generated preview shapes.
- Fixed Shader Graph texture preview handling so the shared Preview Texture remains the source sprite while texture-uniform nodes require and bind their own uploads.
- Fixed Shader Graph link suggestions so image outputs create type-correct Sample Texture nodes instead of wiring image data into Texture Uniform Color UV inputs.
- Fixed Shader Graph template codegen so texture-image inputs, including Texture Noise Water's noise slot, emit valid LÖVE `Image` parameters.
- Fixed Shader Graph connected-game preview so switching away from the Output tab no longer turns off an active runtime preview.
- Fixed Shader Graph Preview nodes so the selected Preview Texture is sent directly to the embedded love.js iframe instead of falling back to the generated shape when upload-cache hydration is unavailable.
- Fixed Shader Graph Preview nodes so texture-uniform uploads are also sent directly to the embedded iframe, restoring texture effects when the parent upload cache is unavailable.
- Fixed Shader Graph Preview nodes so texture-image parameters inside template subgraphs are converted to WebGL sampler uniforms for embedded previews.
- Fixed real love.js Shader Graph Preview nodes so uploaded texture uniforms are retained by the embedded LÖVE runtime after binding, matching connected-game preview behavior.
- Fixed Shader Graph Preview nodes so embedded love.js frames wait for the preview-ready handshake before sending texture-heavy payloads.
- Fixed Shader Graph Preview nodes so embedded node previews use a dedicated WebGL preview target that keeps uploaded source and uniform textures visible even when the generated love.js target cannot poll browser payloads.
- Fixed standalone Shader Graph texture upload controls so browser showcase previews can load source and uniform textures.
- Fixed Shader Graph palette dragging in the showcase by replacing native browser drag with a pointer-driven drop path and hardening the standalone layout against 0x0 canvas collapse.
- Fixed Shader Graph Preview node toolbar actions so pin/zoom/reload clicks no longer re-select the node underneath.
- Fixed looping Particle System Playground timelines so delayed emitter clips restart their particle system when the clip begins instead of expiring before they can emit.
- Fixed Particle System Playground timeline clips and keyframes bleeding into the wrong emitter after reordering or deleting emitters.
- Fixed Particle System Playground timeline Stop and Reset Playhead controls so restarting playback restores emitter base rates instead of keeping stale muted timeline values.
- Fixed live-session reconnects so restored log-history sessions no longer block the app from requesting fresh config from an already-connected game.
- Fixed Particle Playground and Shader Graph connected-game preview work lingering after leaving the page or switching sessions.
- Fixed connected Lua games stuttering on the default one-second sample cadence when several live payloads were pushed together.
- Fixed Runtime Snapshot contributing to idle connected-game stutters through default live dashboard pushes.
- Fixed Feather runtime budgets so active panels cannot get stuck behind a deferred sampling task when a frame is already over budget.
- Fixed In-Game Overlay performance by caching its font/layout and throttling expensive graphics, GC, and particle metric sampling instead of doing that work every frame.
- Fixed Particle System Playground connected-game preview performance by muting paused timeline emission and updating only the selected scratch composite.
- Fixed continuous Particle System Playground effects by adding Ambient timeline playback that holds final lane values without replaying clip bursts.
- Fixed live session visibility so authenticated sockets appear in the app while waiting for the config handshake retry, and disabled plugin capability checks no longer show as startup errors.
- Fixed the Particle System Playground Timeline loop control so it renders as a stable explicit toggle.
- Fixed Particle System Playground timeline playback after applying motion presets while paused, so presets no longer capture the muted preview emission rate as the base rate.
- Fixed Particle System Playground timeline drags so runtime timeline updates are sent only when the drag is released.
- Fixed Feather Particle System Playground local previews when the app falls back to the static showcase love.js bridge.
- Fixed Feather Particle System Playground local preview playback so play/pause timeline sync no longer rebuilds particle systems and interrupts continuous emission.
- Fixed Particle System Playground local preview timelines so Feather keeps advancing local playback while Show in Game is off and love.js previews respect clip/lane timing.
- Fixed Particle System Playground Lua exports so paused or scrubbed timeline state no longer mutates the exported base emitter settings.
- Fixed Particle System Playground Lua exports so keyframe easing names are preserved and exported playback uses the same shared timeline evaluator as the plugin preview.
- Fixed Particle System Playground Lua exports so repeated `play`/`emit` calls use pooled independent timeline instances and can overlap without resetting earlier effects.
- Fixed Particle System Playground Lua exports so `play({ loop = false })` and `emit({ loop = false })` override looping timelines instead of falling back to the saved loop setting.
- Fixed Follow Tail in Logs so newly appended visible rows scroll into view through the virtual log list.
- Fixed Profiler actions so Start, Stop, Snapshot, and Reset refresh the visible capture table immediately.
- Fixed Tauri development reloads getting stuck on Vite `504 Outdated Optimize Dep` responses by isolating app/showcase optimizer caches, forcing a fresh Tauri dev optimize pass, and disabling WebView caching for dev modules.
- Fixed Tauri dev CSP headers so Feather can use Tauri IPC for event listeners and commands while love.js preview isolation headers are enabled.
- Fixed the Particle System Playground app layout so editor content scrolls inside the main pane instead of expanding the whole app window.
- Fixed idle connected-game overhead from background observer, asset, and plugin payload work by gating those pushes behind active panels or explicit recording/preview state.

### Tests

- Expanded app e2e coverage for responsive and degraded triage states, including missing sessions, partial payloads, missing/disabled plugins, and narrow layouts.
- Added showcase e2e coverage for Shader Graph diagnostics on broken imported graphs.
- Added showcase e2e coverage for inline Shader Graph Preview probes.
- Expanded showcase e2e coverage to verify only the selected Shader Graph Preview probe renders live.
- Expanded showcase e2e coverage for Shader Graph Preview node zoom controls.
- Expanded showcase e2e coverage for pinned Shader Graph Preview nodes.
- Added showcase e2e coverage for Shader Graph diagnostics on broken imported graphs.
- Added focused coverage for Shader Graph game-preview throttling and runtime preview caching.
- Expanded showcase e2e coverage for Shader Graph Preview node aspect ratio.
- Added app and showcase e2e coverage that verifies texture-heavy Shader Graph Preview nodes receive source/uniform uploads and render textured canvas output.
- Added app e2e and focused registry coverage for Noctis theme selection, persistence, and fallback behavior.
- Expanded app e2e coverage for the redesigned Settings modal navigation and connection summary.
- Added app e2e coverage for opening the redesigned About modal from the sidebar.
- Added app e2e coverage for log type badge contrast in dark themes.
- Added focused log-history coverage and app e2e coverage for restoring saved session logs.
- Added focused and app e2e reconnect coverage for remembered sessions, pending config handshakes, and persisted session state.
- Added app e2e coverage for Performance Profiler filter controls at constrained desktop widths.
- Expanded app e2e coverage for the Profiler capture workspace, including Record/Finish capture, named snapshots, hotspot focus, and constrained-width controls.
- Expanded Lua and app e2e coverage for exact Profiler invocation samples, sample caps, debugger wrap samples, and run comparison drawer behavior.
- Added golden workflow app and Lua e2e coverage for connection recovery, log batching, performance overhead, profiler captures, debugger probes, observers, assets, and Console eval.
- Added app e2e coverage for the constrained-width Logs toolbar layout.
- Added app e2e coverage for grouped sidebar navigation, pinned tool persistence, Settings pin controls, and hidden pinned tools.
- Added showcase e2e and focused settings coverage for Shader Graph collapsible node palette defaults, persistence, search, and empty states.
- Added focused codegen and showcase e2e coverage for the new Shader Graph composition helper nodes.
- Expanded particle playground e2e coverage for full-width Timeline layout, default overflow behavior, and clip alignment.
- Expanded showcase and app e2e coverage for Particle System Playground Timeline clip dragging, clip duplication/deletion, keyframe retiming, and persisted zoom/snap controls.
- Added focused codegen and showcase e2e coverage for the new Shader Graph Fake 3D sprite illusion nodes.
- Added focused helper, showcase e2e, and app e2e coverage for Shader Graph template preset controls and subgraph boundary nodes.
- Added showcase and app e2e coverage for the Shader Graph right-panel Controls, Selection, and Output workflow.
- Added focused bridge coverage plus showcase and app e2e coverage for texture-heavy Shader Graph Preview node uploads.
- Expanded Lua e2e coverage for looping Particle System Playground timelines with delayed emitter clips.
- Expanded Lua e2e coverage for Particle System Playground export playback APIs and authored timeline burst handling.
- Added Lua e2e coverage for Feel Inspector registration, handler preservation, replay/clear actions, and LOVE adapter summaries.
- Expanded Lua, showcase, and app e2e coverage for Particle System Playground particle-life tails in timeline loops.
- Expanded Lua, showcase, and app e2e coverage for Particle System Playground Emitter Lifetime and timeline clip intersections.
- Expanded Lua, showcase, and app e2e coverage for preserving Particle System Playground timeline values when emitters are reordered.
- Expanded Lua e2e coverage for Particle System Playground timeline stop/reset playback recovery.
- Expanded showcase and app e2e coverage for smooth Particle System Playground timeline playback.
- Added focused, Lua, showcase, and app e2e coverage for Particle System Playground timeline easing curves and track curve rendering.
- Added Lua and app e2e coverage for the core Profiler runtime, dedicated protocol messages, and migration away from the old profiler plugin.
- Expanded app and showcase e2e coverage for Particle System Playground showcase-local previews and Feather on-demand connected-game preview activation.
- Expanded showcase e2e coverage for the floating, aspect-locked Particle System Playground preview.
- Expanded app and showcase e2e coverage for the Particle System Playground header Play action replacing Emit.
- Expanded Lua e2e coverage for Particle System Playground timeline playback after applying motion presets while the preview is muted.
- Added Lua and showcase e2e coverage for the Complex Composite Particle System Playground timeline template.
- Expanded Lua, showcase, and app e2e coverage for Ambient Particle System Playground timelines and continuous templates.
- Expanded Lua e2e coverage for paused Particle System Playground timelines and inactive scratch preview throttling.
- Expanded Lua e2e coverage for capability allowlist startup warnings.
- Added Lua, showcase, and app e2e coverage for Particle System Playground timeline import/export, clip/keyframe editing, preview controls, and exported timeline replay hooks.
- Added Lua, app e2e, and focused store coverage for idle creative preview runtime behavior, stable connected-game config probing, and batched log-history persistence.
- Added Lua e2e coverage for incremental connected-game sample pushes.
- Added Lua e2e coverage for plugin push intervals and manual refresh bypass.
- Expanded theme registry and app e2e coverage for GitHub theme variants, including high contrast, colorblind, and dimmed options.
- Expanded theme registry and app e2e coverage for the curated Rainglow theme selection, including restored family variants.
- Expanded theme registry and app e2e coverage for Visual Studio C/C++ theme variants.
- Expanded theme registry and app e2e coverage for Tokyo Night theme variants.
- Added app e2e coverage for live runtime suspend/resume, Profiler action refreshes, and Logs Follow Tail behavior.
- Expanded Lua e2e coverage for suspended-runtime creative preview allowlists, active Particle Playground preview updates, and throttled In-Game Overlay sampling.
- Expanded Lua e2e coverage for Shader Graph runtime preview render cadence scaling across small, large-texture, and highly zoomed previews.
- Added Lua and app e2e coverage for Debugger Profiler Probes syncing to the runtime and triggering core profiler captures from source lines.
- Expanded Lua and app e2e coverage for Debugger Profile Function probes, including automatic wrapping, unsupported lines, persistence, and removal.
- Added Lua and app e2e coverage for Feather overhead telemetry, runtime interest, log batching, and panel-driven runtime activation.

## [v2.0.0] - 2026-05-26 - The one with better traces

### Added

- Added a global Command Center with `Cmd/Ctrl+K` for discovering pages, hidden sidebar features, plugins, Console snippets, debugger shortcuts, sessions, and docs links.
- Added Console result inspectors, live Observability pins, and best-effort read-only guardrails for safer runtime inspection.
- root path fallback for deeplinking from trace.
- Added `continueOnGameError` for opt-in callback crash recovery with an in-game toast while keeping normal crash behavior as the default.
- Added a Session page toggle for enabling callback crash recovery on the current run.
- Added Health and Profiler tabs to the Performance page with expanded metric charts, spike triage, profiler controls, and JSON export.
- Added Profiler scoped samples, before/after snapshots, group metadata, and diff-friendly capture data for focused profiling workflows.
- Added richer Observability triage with observer groups, change counts, first/last seen metadata, sorting, group filters, customizable changed-marker duration, and JSON export.
- Added debugger reliability status, opt-in pause-on-error, condition error reporting, and stack-frame variable inspection.

### Changed

- Reworked the Logs view with a dedicated live log table, search and type filters, follow-tail control, stable row selection, and richer synced details.
- Profiler plugin captures now include start/stop recording, raw timing values, percent of captured time, calls per second, and capture metadata.
- Profiler wrapped functions now preserve tracebacks with error-safe wrappers while still recording failed calls.
- Improved the Debugger page with a single-row header, colored controls, file-title flow controls, safer gutter-only breakpoint toggling, and clearer source/variable empty states.
- Improved Debugger Hot Reload controls with selected-module status, disabled reasons, and compact safety chips for allowlist, remote-block, persistence, modified, and failed states.
- Improved the Console page with status chips, transcript actions, collapsible long output, rerun/use-as-input controls, and session-scoped snippets.
- Added manual `_G` refresh for Console autocomplete so runtime globals can be suggested without changing eval sandbox behavior.
- Improved Console autocomplete with scoped Lua/LÖVE suggestions for member access such as `_G.print` and `love.graphics.getStats`.
- Improved the Assets page with denser filtering, sorting, repeated-load badges, richer preview details, and copy/reveal actions.
- Compare now appears below Session in the sidebar only when at least two sessions are connected.
- Improved Compare with auto-selected sessions, observer diff filters/search/sorting, summary counts, performance deltas, and row copy actions.
- Live session selection now re-requests the config handshake and current runtime data to refresh stale desktop state.
- Added persisted Settings controls for hiding unused main sidebar features.
- Reworked Session into an onboarding and health hub with connection, security, debugger, plugin, package, and recommended-action summaries.
- Added actionable Performance Health verdicts for frame hitches, low FPS, draw-call pressure, state switching, memory growth, and texture pressure.
- Performance Health warnings now render as a compact collapsible strip so diagnostics do not crowd the chart.
- Hidden sidebar features and hidden disabled plugins are now hidden from Command Center by default, with a Settings opt-in for sidebar features.
- Shared triage UI primitives now keep search, filters, summary chips, empty states, copy actions, and details panels more consistent across live debugging pages.
- Shader Graph Output now keeps GLSL as the main scrollable content while docking diagnostics and preview/apply controls at the bottom of the panel.

### Fixed

- Asset tracking now deduplicates repeated file-backed loads while keeping runtime-created assets distinct, and reports the real preview enabled state.
- Wrapped game callback errors now rethrow by default after Feather can capture them, so game crashes are no longer silently swallowed.
- Fixed CLI-managed debugger breakpoint matching for long source paths and modules loaded through the temporary run shim by matching against untruncated source paths and normalizing shim paths back to project-relative source files.
- Fixed `feather run` so CLI-managed desktop launches enable the step debugger by default unless `--no-debugger` is used.
- Fixed the Performance page empty-data state so the health chart no longer loops when no metrics have arrived yet.
- Fixed Performance metric formatting and runtime normalization so partial samples render safe fallback values instead of `NaN` or broken units.
- Fixed Compare memory and texture metrics so missing live performance fields render as unavailable instead of `NaN undefined`.
- Fixed the Console snippets rail so it hides on narrow screens instead of squeezing the chat workspace.
- Log repeat counts now render in the actual log table.
- Log details now show the repeat count for the selected entry.
- Log details now stay synced as repeat counts update.
- Clearing logs now resets the runtime repeat counter so the next identical log appears normally.
- Fixed log row selection so live updates no longer prevent opening a log details panel.
- Fixed Shader Graph node previews so alpha-masked shaders stay clipped to the selected preview shape instead of tinting the full preview quad.
- Traceback path stripping.

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
