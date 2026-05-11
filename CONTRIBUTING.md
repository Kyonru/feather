# Contributing to Feather

Thanks for helping make Feather better. This project spans a React/Tauri desktop app, a TypeScript CLI, and an embedded Lua runtime for LÖVE games, so the best contributions are small, well-tested, and clear about which part of the stack they touch.

Feather uses [Ink](https://github.com/vadimdemedes/ink) for interactive CLI workflows. Ink's own contributing guide is a good reference for the kind of contribution style we want too: focused changes, reproducible tests, and human-reviewed work.

## Before You Start

- Open an issue or draft PR for large features, protocol changes, or plugin API changes.
- Keep PRs focused. A bug fix, documentation update, CLI workflow, or Lua runtime change should usually stand on its own.
- Include docs when behavior changes. User-facing CLI, plugin, debugger, hot reload, or security changes should update `docs/` and relevant README files.
- Treat Feather as development tooling that can run inside someone’s game. Security-sensitive features such as Console, hot reload, and app ID validation should stay opt-in and clearly documented.

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

Run the desktop app in development:

```sh
npm run dev
```

Serve the docs:

```sh
npm run docs
```

## Project Layout

- `src/` contains the React desktop app.
- `src-tauri/` contains the Tauri shell and WebSocket server.
- `cli/` contains the Feather CLI and Ink workflows.
- `src-lua/feather/` contains the embedded Lua runtime.
- `src-lua/plugins/` contains built-in Lua plugins.
- `src-lua/example/` contains runnable LÖVE examples.
- `docs/` contains the MkDocs documentation site.

## Commit Messages

Commit subjects must start with one of these prefixes:

```txt
cli:
app:
lua:
tauri:
feather:
docs:
```

Examples:

```txt
cli: add interactive remove workflow
app: improve session empty state
lua: harden hot reload allowlist checks
tauri: validate websocket payloads
docs: document app id pairing
```

## Generated Files

Some files are generated and must stay in sync:

- `src-lua/manifest.txt`
- `cli/src/generated/plugin-catalog.ts`
- version fields in `package.json`, `src-lua/feather/init.lua`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`

The pre-commit hook checks these automatically. You can refresh them manually:

```sh
bash scripts/generate-manifest.sh
npm run generate:plugin-catalog
bash scripts/set-version.sh
```

## Checks

Run the checks that match your change. For broad changes, run all of them.

```sh
npm run typecheck:web
npm run typecheck:lua
npm run lint
npm run cli:build
npm run test:cli:e2e
npm run test:lua:e2e
npm run test:app:e2e
npm run test:tauri:e2e
```

Use the focused lanes when possible:

- React app changes: `npm run typecheck:web`, `npm run lint`, and Playwright if UI behavior changed.
- CLI changes: `npm run cli:build` and `npm run test:cli:e2e`.
- Lua runtime/plugin changes: `npm run typecheck:lua` and `npm run test:lua:e2e`.
- Tauri/WebSocket changes: `npm run test:tauri:e2e`.
- Docs-only changes: `npm run docs` and skim the rendered page.

## Lua Runtime Guidelines

- Keep Feather disabled in production unless the user explicitly enables it.
- Guard generated imports with `USE_DEBUGGER`.
- Do not make Console, hot reload, or remote code execution features load by default.
- Do not allow hot reload to modify Feather internals or plugin allowlist/security configuration.
- Keep plugin APIs declarative and serializable. Lua plugins describe UI and behavior; React renders it.
- When adding built-in plugins, update the plugin manifest/catalog and documentation.

## CLI Guidelines

- Prefer interactive Ink workflows for commands that need several choices.
- Keep non-interactive flags available for scripts and CI.
- Make generated Lua easy to remove later. Preserve `FEATHER-INIT` style comments and metadata when touching init/remove flows.
- When adding setup options, update `docs/cli.md`, `docs/configuration.md`, and generated config templates.

## Desktop App Guidelines

- Keep session-scoped behavior session-scoped. Avoid leaking data between connected games.
- Show empty states when no session is selected or a session does not support a feature.
- Handle web mode and Tauri mode gracefully.
- Keep file access rooted in user-selected or configured directories.
- Unless it's a generic code addition, plugins PR should not include plugin specific code for the Desktop app.

## Pull Requests

Please include:

- What changed and why.
- Screenshots or short recordings for visible UI changes.
- The commands you ran.
- Any follow-up work or known limitations.
- AI Disclaimer
