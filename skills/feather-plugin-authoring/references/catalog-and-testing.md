# Catalog And Testing

## Manifest shape

Each auto-discovered plugin has `src-lua/plugins/<id>/manifest.lua`:

```lua
return {
  id = "my-plugin",
  name = "My Plugin",
  description = "What this plugin does",
  version = "1.0.0",
  capabilities = {},
  opts = {},
  optIn = false,
  disabled = true,
}
```

Rules:

- `id` must match the plugin ID and directory mapping.
- `name`, `description`, and `version` should be human-readable and stable.
- `capabilities` should disclose access needs.
- `optIn = true` means skipped unless included.
- `disabled = true` means registered but inactive unless included.
- Development-only or risky plugins should be both opt-in and disabled.

## Adding a built-in plugin

Start from an existing plugin with similar lifecycle or UI behavior. A built-in plugin should usually add:

```text
src-lua/plugins/<plugin-id>/
  init.lua
  manifest.lua
  README.md
```

Checklist:

- Keep the plugin ID aligned across the directory, `manifest.lua`, `createPlugin`, docs, tests, and e2e fixture names.
- Declare capabilities and default `opts` in `manifest.lua`; use `pluginOptions` in `feather.config.lua` for user configuration.
- Keep risky, local-only, or development-only plugins opt-in and disabled by default.
- Use callback bus registration or `on*` lifecycle methods instead of patching Love2D callbacks directly.
- Return serializable data or `feather.ui.render(...)` payloads; do not return functions, userdata, or React-specific concepts.
- Add a Lua e2e fixture under `src-lua/e2e/plugins/` for runtime behavior.
- Add desktop or showcase e2e coverage when the plugin changes rendered UI behavior.
- Add or update the plugin README and any docs symlink target under `docs/plugins/`.
- Update `CHANGELOG.md` for new plugin behavior, capability changes, UI changes, or meaningful e2e coverage.

## Generated catalog

`scripts/generate-plugin-catalog.mjs` reads plugin manifests and writes `cli/src/generated/plugin-catalog.ts`.

Use:

```bash
npm run check:plugin-catalog
```

This regenerates and fails if the generated file differs. Do not manually edit the generated catalog.

The generator also checks `src-lua/manifest.txt`. New plugin manifests must be listed there, and stale manifest entries should fail generation instead of silently producing partial bundled metadata.

After adding or changing a built-in plugin, run:

```bash
bash scripts/generate-manifest.sh
npm run generate:plugin-catalog
npm run cli:build
npm run typecheck:lua
npm run test:lua:e2e
```

## Tests and smoke checks

- Lua plugin logic: `npm run test:lua:e2e`.
- CLI plugin commands: `node --test cli/test/commands/*.test.mjs`.
- Desktop rendering changes: Playwright tests or targeted app smoke checks.
- Catalog-only manifest changes: `npm run check:plugin-catalog`.

Each built-in plugin should have a matching Lua e2e fixture under `src-lua/e2e/plugins/` when it has runtime behavior. Keep fixture names aligned with plugin IDs using underscore file names where existing fixtures do.

## Docs update rules

Update `docs/plugins/` and `src-lua/plugins/plugins-ui.md` when plugin capabilities, UI nodes, lifecycle methods, or manifest fields change. The `docs/plugins-ui.md` is the user-facing reference for declarative UI — keep it in sync with `src-lua/feather/ui.lua`.

## Common mistakes

- Adding `init.lua` without `manifest.lua`.
- Changing a manifest without regenerating/checking the catalog.
- Returning UI nodes with function callbacks.
- Mutating global Love2D callbacks instead of using the callback bus.
