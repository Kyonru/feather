# Runtime Architecture

## Runtime layout

- `src-lua/feather/init.lua`: main debugger object.
- `src-lua/feather/auto.lua`: auto-registration and config-driven setup.
- `src-lua/feather/plugin_manager.lua`: plugin discovery, capability checks, lifecycle dispatch.
- `src-lua/feather/core/base.lua`: `FeatherPlugin` base class.
- `src-lua/feather/callback_bus.lua`: shared Love2D callback dispatch.
- `src-lua/feather/core/logger.lua`: logs and print wrapping.
- `src-lua/feather/core/observer.lua`: observed variables.
- `src-lua/feather/core/performance.lua`: performance samples.
- `src-lua/feather/core/assets.lua`: asset previews.
- `src-lua/feather/debugger.lua`: step debugger and command handling.
- `src-lua/feather/ui.lua`: declarative plugin UI helpers.

## CLI injection

`feather run` creates a temporary shim instead of editing the game:

- Shim `conf.lua` delegates to the game's `conf.lua`.
- Shim `main.lua` loads Feather, then loads the real game `main.lua`.
- Runtime and plugin folders are linked or copied from bundled assets.
- The game path is added to Lua module search paths and mounted for assets.
- The CLI can pre-scan plugins and expose `FEATHER_PLUGIN_LIST`; Lua then uses `require()` for manifest loading to avoid Love2D/PhysFS symlink issues.

Embedded modes exist for projects that cannot use `feather run`:

- `auto`: patches `main.lua` with a guarded `require`.
- `manual`: writes `feather.debugger.lua` and a guarded loader/update block.
- Both should remain explicit and removable through `feather remove`.

## Plugin dispatch

The plugin manager owns lifecycle calls:

- `init`
- `update`
- `onerror`
- `handleRequest`
- `handleActionRequest`
- `handleActionCancel`
- `handleParamsUpdate`
- `finish`

Keep lifecycle calls isolated with `pcall` where current code does so. Plugin crashes should be logged and contained.

## Bundling

Runtime files are copied into `cli/lua` for packaged CLI usage. When adding runtime files:

- Update manifests or bundle scripts if the file is not picked up automatically.
- Run `npm run bundle:lua --workspace=cli`.
- Run `npm run cli:build` before testing packaged CLI behavior.

## Adding a runtime feature

- Start from the existing runtime subsystem closest to the data being collected: logs, observers, assets, performance, debugger, replay, or plugins.
- Keep data that crosses Lua, Rust, and React JSON-serializable; use the binary side-channel for bulky payloads.
- Add config fields in `feather.config.lua` only when the feature needs user control; update CLI config parsing/writing at the same time.
- Keep release builds Feather-free by default, including new runtime files, plugin files, temp shims, and debug artifacts.
- Add Lua e2e coverage for runtime behavior and pair it with CLI or desktop e2e when injection or protocol behavior changes.
- Update source-side docs and `CHANGELOG.md` for user-visible runtime, config, debugger, or protocol changes.

## Test taxonomy

- Runtime behavior: `npm run test:lua:e2e`.
- CLI integration with runtime files: `node --test cli/test/commands/runtime.test.mjs` plus related command tests.
- Protocol changes: pair Lua e2e with desktop app or Rust WebSocket tests when the wire shape changes.
- Plugin changes: use per-plugin fixtures under `src-lua/e2e/plugins/`.
