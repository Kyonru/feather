---
name: feather-plugin-authoring
description: Create, update, review, or test Feather Lua plugins, manifests, capabilities, lifecycle hooks, callback bus usage, declarative plugin UI, and plugin catalog generation.
---

# Feather Plugin Authoring

## When to use

Use this skill when adding or changing built-in plugins, plugin manifests, plugin lifecycle behavior, capability declarations, plugin UI payloads, or generated plugin catalog data.

## First pass

- Start with an existing plugin in `src-lua/plugins/<plugin-id>/`.
- Read `src-lua/plugins/plugins-ui.md` before changing declarative UI nodes.
- For plugin lifecycle and UI details, load [lifecycle and UI](references/lifecycle-and-ui.md).
- For adding plugins, manifests, catalog generation, and tests, load [catalog and testing](references/catalog-and-testing.md).

## Core rules

- Plugins are Lua modules. They do not import React or call desktop app code.
- `manifest.lua` is required for auto-discovery.
- Plugin IDs should match the directory name, except dotted IDs map to nested directories such as `hump.signal` -> `hump/signal`.
- Declare capability tokens in the manifest for filesystem, network, draw, input, audio, or similar access.
- Use the shared callback bus or `on*` plugin methods for Love2D callbacks.
- Return serializable data or `feather.ui.render(...)` payloads from `handleRequest`.
- Use `handleActionRequest`, `handleActionCancel`, and `handleParamsUpdate` for desktop interactions.
- Keep development-only plugins opt-in and disabled by default.
- Regenerate catalog output after manifest changes.

## Common implementation map

- Built-in plugins: `src-lua/plugins/`.
- Plugin UI docs: `src-lua/plugins/plugins-ui.md`.
- Base class: `src-lua/feather/core/base.lua`.
- Plugin manager: `src-lua/feather/plugin_manager.lua`.
- UI helpers: `src-lua/feather/ui.lua`.
- Generated catalog: `cli/src/generated/plugin-catalog.ts`.
- Catalog generator: `scripts/generate-plugin-catalog.mjs`.
- CLI plugin commands: `cli/src/commands/plugin.ts`.

## Verification

- Add or update e2e coverage for plugin behavior changes; use Lua e2e fixtures for runtime behavior and desktop/showcase e2e for rendered UI behavior.
- Run `npm run check:plugin-catalog` after manifest changes.
- Run `npm run test:lua:e2e` after plugin logic changes.
- Run `npm run cli:build` when CLI catalog consumers change.
- Run desktop or showcase checks when changing plugin UI payloads that React renders.

## Docs touchpoints

- Update docs for user-facing plugin behavior, options, manifests, or UI nodes in the same change as the implementation.
- Update `CHANGELOG.md` for new plugins, changed plugin behavior, capability/security changes, plugin UI changes, or plugin e2e coverage changes.
- Plugin authoring behavior belongs in `docs/plugins.md`.
- Declarative plugin UI details belong in `src-lua/plugins/plugins-ui.md`.
- Per-plugin behavior belongs in that plugin's `src-lua/plugins/<plugin-id>/README.md`.
- Prefer source-side docs under `src-lua/plugins/`; expose them through `docs/` symlinks such as `docs/plugins.md`, `docs/plugins-ui.md`, or `docs/plugins/<plugin-id>.md`.

## Avoid

- Do not patch `love.*` directly from multiple plugins when callback bus support exists.
- Do not return functions, userdata, or unserializable values in plugin UI/data payloads.
- Do not add a desktop-specific plugin API that bypasses the protocol.
- Do not enable Console, Hot Reload, or high-risk capabilities by default.
