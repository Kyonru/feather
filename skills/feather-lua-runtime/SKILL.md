---
name: feather-lua-runtime
description: Work on Feather's Lua runtime, CLI injection, feather.config.lua, WebSocket and disk modes, auth, debugger runtime boundaries, and Lua e2e behavior.
---

# Feather Lua Runtime

## When to use

Use this skill when changing `src-lua/feather`, bundled Lua plugins, runtime configuration, CLI injection behavior, WebSocket/disk transport, auth, debugger behavior, or Lua e2e tests.

## First pass

- Start with `src-lua/feather/init.lua`, `src-lua/feather/auto.lua`, and `src-lua/feather/plugin_manager.lua`.
- For config, connection, and transport behavior, load [config and protocol](references/config-and-protocol.md).
- For runtime layout, injection modes, and tests, load [runtime architecture](references/runtime-architecture.md).
- If the change touches plugins, also use the `feather-plugin-authoring` skill.

## Core rules

- CLI-managed runs should keep game source code unchanged. Injection happens through a temporary shim.
- Embedded `auto` and `manual` modes must stay guarded by explicit debug/runtime settings.
- Keep runtime APIs compatible with bundled plugins unless the task includes a coordinated plugin migration.
- Use the callback bus for Love2D callbacks instead of each plugin patching `love.*` independently.
- Treat Console and Hot Reload as development-only remote code execution surfaces. Require explicit opt-in and strong configuration.
- Preserve error isolation for plugins. A plugin failure should not crash the game loop.
- Keep binary/text threshold behavior compatible with desktop app consumers.
- Do not introduce hard dependencies on desktop-only behavior inside the Lua runtime.

## Common implementation map

- Runtime entry: `src-lua/feather/init.lua`.
- CLI auto-loader: `src-lua/feather/auto.lua`.
- Plugin manager: `src-lua/feather/plugin_manager.lua`.
- Base plugin class: `src-lua/feather/core/base.lua`.
- Callback bus: `src-lua/feather/callback_bus.lua`.
- Logger, observers, performance, assets: `src-lua/feather/core/`.
- Debugger: `src-lua/feather/debugger.lua`.
- Error handler: `src-lua/feather/error_handler.lua`.
- Declarative UI helpers: `src-lua/feather/ui.lua`.
- Runtime examples and e2e fixtures: `src-lua/example/`, `src-lua/e2e/`.

## Verification

- Add or update Lua e2e coverage for runtime behavior changes; use `src-lua/e2e/`, `src-lua/example/`, and `scripts/lua-e2e.mjs` patterns.
- Run Lua e2e checks: `npm run test:lua:e2e`.
- Rebuild bundled CLI runtime if packaging behavior changes: `npm run bundle:lua --workspace=cli`.
- Run CLI build when TypeScript and Lua bundle behavior meet: `npm run cli:build`.
- Run relevant showcase checks if runtime protocol changes affect the desktop app.

## Docs touchpoints

- Update docs for user-facing runtime, config, debugger, or transport behavior in the same change as the implementation.
- Update `CHANGELOG.md` for runtime, config, protocol, debugger, security, or Lua e2e coverage changes that affect users.
- Runtime config fields belong in `docs/configuration.md`.
- User workflows around observers, logging, console, debugger, or replay belong in `docs/usage.md` and related focused docs.
- Production/security posture belongs in `docs/recommendations.md`.
- When runtime docs are plugin- or feature-specific, prefer a source-side README under `src-lua/` and expose it through `docs/` with a symlink.

## Avoid

- Do not require users to add `require("feather.auto")` for normal CLI-managed runs.
- Do not send game data before auth completes in socket mode.
- Do not silently enable Console, Hot Reload, filesystem access, or network access.
- Do not make new runtime files invisible to bundling or manifest generation.
