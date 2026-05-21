# Contributing to Feather

Thanks for helping make Feather better. Feather spans a React/Tauri desktop app, a TypeScript CLI, a VS Code extension, and an embedded Lua runtime for LÖVE games. The best contributions are focused, testable, documented, and careful about the fact that Feather runs inside someone else's game during development.

Feather's current product direction is polish first: make setup, debugging, plugin workflows, release safety, and docs feel reliable before adding more surface area. New features should make LÖVE developers faster at debugging, validating, shipping, or reproducing a problem.

## Working Principles

- Keep changes small and scoped. A CLI fix, Lua plugin change, desktop workflow, docs update, or VS Code extension change should usually stand on its own.
- Prefer CLI-managed development flows. Normal examples and integrations should work with `feather run` and `feather.config.lua`, not by requiring Feather directly from game code.
- Keep production builds Feather-free by default. Release builds must exclude Feather runtime files, `feather.config.lua`, plugins, local replay/debug artifacts, and generated development files unless the user explicitly opts into a debug build.
- Treat Console, hot reload, filesystem writes, insecure app pairing, debugger hooks, and replay/session capture as development-only features. They must be opt-in and clearly documented.
- Keep plugin APIs declarative and serializable. Lua plugins should expose data and actions; React should render generic plugin UI unless a dedicated desktop page is genuinely needed.
- Update docs when behavior changes. If a user-facing command, config field, plugin option, extension command, build behavior, or safety check changes, update the relevant docs in the same PR.

## For Agents And Automation

If you are an automated coding agent, follow these extra rules:

- Read the relevant files before editing. Use `rg` and focused file reads to understand the existing pattern.
- Check `git status --short` before and after. Never revert unrelated changes; assume they belong to the user.
- Do not modify `package-lock.json` unless dependencies actually changed.
- Use `apply_patch` or normal editor-style edits. Avoid broad rewrites and formatting churn.
- Run the narrowest useful tests first, then broader checks when the change crosses boundaries.
- If a check cannot run because local tooling is missing, say so plainly and include the exact failure.
- Do not leave generated files stale. If a generated file changes because it should, include it. If it changes accidentally, restore it carefully.

## Development Setup

Install dependencies from the repo root:

```sh
npm install
```

Build the CLI before using local `npm run feather` commands:

```sh
npm run cli:build
npm run feather -- --help
```

Run the desktop app:

```sh
npm run tauri dev
```

Serve docs:

```sh
npm run docs
```

## Project Layout

- `src/` contains the React desktop app.
- `src-tauri/` contains the Tauri shell and WebSocket server.
- `cli/` contains the Feather CLI, build/upload/release logic, package manager, and Ink workflows.
- `cli/test/commands/` contains CLI end-to-end tests using Node's built-in test runner.
- `src-lua/feather/` contains the embedded Lua runtime.
- `src-lua/plugins/` contains built-in Lua plugins.
- `src-lua/example/` contains runnable LÖVE examples.
- `vscode-extension/` contains the VS Code extension.
- `docs/` contains the MkDocs documentation site.
- `packages/` contains curated package registry entries.

`docs/cli.md` is a symlink to `cli/README.md`, and `docs/vscode-extension.md` is a symlink to `vscode-extension/README.md`. Edit the source file directly when your editor or tool has trouble writing through symlinks.

## CLI-Managed Examples

Most examples should be plain LÖVE projects. Do not add direct `require("feather")`, `require("feather.auto")`, `FeatherDebugger(...)`, or `DEBUGGER:update(dt)` to normal examples unless the example is specifically demonstrating manual/auto embedding.

Prefer this shape:

```txt
src-lua/example/my_example/
  main.lua
  conf.lua
  feather.config.lua
```

Run it with:

```sh
npm run feather -- run src-lua/example/my_example
```

Example game code may use guarded runtime APIs:

```lua
if DEBUGGER then
  DEBUGGER:observe("player.x", player.x)
end
```

Plugin options belong in `feather.config.lua`:

```lua
return {
  include = { "session-replay", "hot-reload" },
  pluginOptions = {
    ["session-replay"] = {
      captureJoystickAxis = true,
    },
    ["hot-reload"] = {
      enabled = true,
      allow = { "gameplay" },
    },
  },
}
```

The CLI shim must preserve `pluginOptions` for any plugin, including IDs with dashes. If you change config parsing or shim generation, add or update CLI tests that prove nested plugin options survive injection.

## Common Workflows

Run the CLI:

```sh
npm run cli:build
npm run feather -- doctor src-lua/example/test_cli
npm run feather -- run src-lua/example/test_cli
```

Run a focused CLI test file:

```sh
npm run cli:build
node --test cli/test/commands/run.test.mjs
```

Run Lua examples:

```sh
npm run feather -- run src-lua/example/test_cli
npm run feather -- run src-lua/example/session_replay
npm run feather -- run src-lua/example/session_replay_multiplayer
```

Run Android development builds:

```sh
npm run feather -- build vendor add android --dir src-lua/example/test_cli
npm run feather -- build android --dir src-lua/example/test_cli --verbose
npm run feather -- run src-lua/example/test_cli --target android --verbose
```

Use cache controls when testing build behavior:

```sh
npm run feather -- build android --dir src-lua/example/test_cli --no-cache --verbose
npm run feather -- build android --dir src-lua/example/test_cli --clean --verbose
```

## Verification

Run the checks that match your change. For broad changes, run more than one lane.

```sh
npm run typecheck:web
npm run typecheck:lua
npm run lint
npm run cli:build
npm run test:cli:e2e
npm run test:lua:e2e
npm run test:app:e2e
npm run test:tauri:e2e
npm run extension:build
npm run extension:test
```

Focused guidance:

- React desktop changes: `npm run typecheck:web`, `npm run lint`, and Playwright if visible behavior changed.
- CLI changes: `npm run cli:build` and the relevant `node --test cli/test/commands/*.test.mjs` file.
- Lua runtime or plugin changes: `npm run typecheck:lua`, `npm run test:lua:e2e`, and any focused Lua e2e path if available.
- Build/upload/release safety changes: run targeted build, doctor, upload-safety, and release tests.
- Tauri/WebSocket changes: `npm run test:tauri:e2e`.
- VS Code extension changes: `npm run extension:build` and `npm run extension:test`.
- Docs-only changes: read the edited Markdown and run `npm run docs` when practical.

If `love`, `luacheck`, Android SDK, Xcode, Fastlane, or other local tooling is missing, document that in the PR or final handoff. Do not pretend the check passed.

## Generated Files

Some files are generated and must stay in sync:

- `src-lua/manifest.txt`
- `cli/src/generated/plugin-catalog.ts`
- `cli/src/generated/registry.json`
- version fields in `package.json`, `src-lua/feather/init.lua`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`

Refresh them with:

```sh
bash scripts/generate-manifest.sh
npm run generate:plugin-catalog
npm run generate:registry
bash scripts/set-version.sh
```

`npm run check:plugin-catalog` and `npm run check:registry` intentionally fail when generated output differs from git. If the generated diff is expected, commit it.

Generated or local-only folders such as `vscode-extension/bundled-cli/`, `vscode-extension/bundled-bin/`, build outputs, caches, and replay/debug artifacts should not be committed.

## Lua Runtime Guidelines

- Keep Feather disabled in production unless the user explicitly chooses a debug build.
- Guard manual integration with `USE_DEBUGGER` when touching auto/manual init flows.
- Keep CLI mode clean: the CLI injects Feather and drives `DEBUGGER:update(dt)`.
- Do not make Console, hot reload, session replay, filesystem writes, or remote code execution load by default in production-oriented configs.
- Keep runtime APIs JSON-serializable when data crosses the WebSocket/plugin boundary.
- Avoid global mutation unless the plugin explicitly wraps LÖVE callbacks or exposes a guarded `DEBUGGER` API.
- Add Lua e2e coverage for runtime behavior, callback wrapping, replay, protocol, or plugin lifecycle changes.

## Plugin Guidelines

Built-in plugins live under `src-lua/plugins/<plugin-id>/` and should usually include:

```txt
src-lua/plugins/<plugin-id>/
  init.lua
  manifest.lua
  README.md
```

After adding or changing a built-in plugin:

```sh
bash scripts/generate-manifest.sh
npm run generate:plugin-catalog
npm run cli:build
npm run typecheck:lua
npm run test:lua:e2e
```

Plugin contribution tips:

- Prefer improving existing plugins over adding more plugins.
- Mark opt-in, disabled, dangerous, or development-only behavior clearly in `manifest.lua` and docs.
- Keep plugin state session-local.
- Document setup, options, security implications, and at least one minimal snippet.
- Use `pluginOptions` in `feather.config.lua` for CLI-managed configuration.
- Avoid plugin-specific React code unless the workflow needs a dedicated desktop page. If you add one, keep the generic plugin tab useful for status and simple actions.

## Desktop App Guidelines

- Keep session data scoped to the active session. Never leak logs, plugin state, replay metadata, assets, or file roots between sessions.
- Show useful empty states when no session is selected or a session lacks a capability.
- Make requests optimistic only when rollback/error state is clear.
- Handle web mode and Tauri mode gracefully.
- Keep file access rooted in user-selected or configured directories.
- Use existing app patterns, query keys, routing, and shared UI components.

## CLI Guidelines

- Keep non-interactive flags available for scripts and CI.
- Use Ink workflows for commands that need several choices, but never make automation depend on an interactive prompt.
- Preserve config and generated Lua in a form users can understand and remove.
- Follow skip-on-exists behavior for file installers. Use `--force` when overwriting is intentional.
- Keep `doctor` useful. New setup requirements should have a doctor check and a clear remediation message.
- When adding setup options, update `cli/README.md`, `docs/configuration.md`, and generated config templates.
- Build and upload commands must run production safety checks before shipping user-facing artifacts.

## Build, Upload, And Release Safety

Production paths should be boringly strict.

- Release builds should exclude Feather runtime, plugins, `feather.config.lua`, `.feather-main.lua`, replay files, `.featherreplay`, logs, and generated debug artifacts.
- Upload safety should inspect existing artifacts where possible, including `.love`, `.zip`, `.apk`, `.aab`, `.ipa`, and app bundles.
- `feather doctor --production` should fail or warn on unsafe config, debug runtime footprints, missing signing/upload dependencies, weak app pairing, hot reload persistence, Console exposure, and replay artifacts.
- If a development config is unsafe, prefer offering a production staging/build path over asking users to manually edit several fields.

## VS Code Extension Guidelines

- The extension is a UI controller for the CLI. It should spawn the bundled CLI and avoid re-implementing CLI logic.
- Keep extension commands mapped closely to CLI commands. If behavior does not exist in the CLI, add it there first.
- Workspace-scoped settings should use `ConfigurationTarget.Workspace`, not `Global`, when they are project-specific.
- Register new commands in both `vscode-extension/src/extension.ts` and `vscode-extension/package.json`.
- Build/package flows should use the bundled CLI/binary prepared by `vscode-extension/scripts/prepare.mjs`.
- Do not commit generated extension bundles.

## Documentation Guidelines

- User-facing CLI behavior belongs in `cli/README.md` and, when broader, in `docs/usage.md` or a dedicated page.
- Runtime config belongs in `docs/configuration.md`.
- Plugin behavior belongs in `src-lua/plugins/<plugin-id>/README.md`; major workflows may also need a `docs/<feature>.md` page and a `mkdocs.yml` nav entry.
- VS Code extension behavior belongs in `vscode-extension/README.md`.
- Prefer copy-pasteable commands and small guarded Lua examples.
- Be explicit about what Feather does not do. For example, Session Replay records inputs and developer-selected state; it does not serialize an entire game.

## Package Catalog Contributions

Use helper scripts instead of hand-writing package entries whenever possible. They fetch metadata, pin source commits or URLs, calculate SHA-256 checksums, write `packages/<id>.json`, and regenerate `cli/src/generated/registry.json`.

For GitHub-hosted packages:

```sh
npm run package:add
```

For direct file URLs:

```sh
npm run package:add-url
```

After the wizard finishes:

```sh
npm run check:registry
npm run cli:build
npm run feather -- package info <package-id>
npm run feather -- package install <package-id> --dir /tmp/feather-package-test
```

Package contribution tips:

- Prefer tagged releases. If a package has no tags, pin a specific commit.
- Keep install targets narrow and predictable, usually under `lib/<package-id>/`.
- Include a realistic `require` path and a small usage example.
- Use `verified` only for packages reviewed and pinned with checksums. Use `known` for checksum-pinned sources that still need extra review.
- Commit both `packages/<id>.json` and `cli/src/generated/registry.json`.

## Commit Messages

Commit subjects should start with one of these prefixes:

```txt
ci:
cli:
package:
plugin:
app:
lua:
tauri:
feather:
docs:
vscode-extension:
```

Examples:

```txt
cli: preserve plugin options in run shim
app: add session replay page
lua: harden hot reload allowlist checks
plugin: add session replay docs
docs: document cli-managed examples
vscode-extension: add release build command
```

## Pull Requests

Include:

- What changed and why.
- Screenshots or short recordings for visible UI changes.
- The commands you ran and their results.
- Any checks you could not run and why.
- Known limitations or follow-up work.
- AI assistance disclosure when applicable.
