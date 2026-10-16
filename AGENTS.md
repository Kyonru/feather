# Feather Agent Guide

This is the canonical repo guide for coding agents. Keep subsystem-specific details in `skills/*` and use this file for routing, repo-wide rules, and workflow expectations.

Feather is a CLI debugger, inspector, desktop devtool, VS Code companion, and package manager for Love2D games. It injects a Lua runtime through the CLI and shows a live React + Tauri desktop app with logs, variables, performance, plugins, build tools, and creative inspectors.

## Active Architecture Work

Feather is finishing a v4 architecture organized around release boundaries. **[`V4.md`](./V4.md) is
the single v4 document.** Read it before any structural, build, release or packaging work, before
changing an existing feature's behaviour or UI, and before touching `apps/studio/`.

- §3 lists the steps left before v4 is complete, each with its acceptance check. Take them in order.
- §5 is the architecture and its invariants, which hold for every commit.
- §6 is the design reference: the refinement rule (**refine, do not add**), the lens, Inspector's
  direction, Studio's workbench rules, and the particle runtime's semantics.
- §8 is the decision log. Read it before reopening anything it settles.

`V4.md` governs *what is left to build and the rules it follows*. This file governs *how to work in
this repo*. Both apply. Do not add new tracking documents; record progress in `V4.md`.

## Project Layout

Everything that ships lives under `apps/`; `packages/` holds only what those
applications consume.

- `apps/inspector/` - Tauri desktop debugger. React in `apps/inspector/src/`, Rust WS server in `apps/inspector/src-tauri/`.
- `apps/studio/` - Feather Studio: shader graph, texture lab, particle playground. Separate
  application with its own binary, bundle identifier, version and release feed.
- `apps/showcase/` - Thin shell hosting Studio for the web. No page code of its own.
- `apps/cli/` - TypeScript CLI using Commander. Workspace package `@kyonru/feather`.
- `apps/vscode-extension/` - VS Code extension. Vendors a pinned platform snapshot.
- `apps/docs/` - Zensical documentation site.
- `packages/protocol/` - Wire message registry and envelope.
- `packages/host/` - Environment capabilities, with Tauri and browser implementations.
- `packages/session-bridge/` - Versioned Inspector↔Studio process contract.
- `packages/ui/` - Shared interface primitives.
- `packages/runtime-lua/` - The Lua runtime and built-in plugins. Publishes to LuaRocks.
- `catalog/packages/` - Curated Love2D package catalog entries (`catalog/packages/*.json`).
  Published to the `packages` branch by `.github/workflows/registry.yml`.
- `scripts/` - Registry/catalog generators, checksum tools, bundle helpers.
- `skills/` - Repo-local agent skills. Read the matching skill before editing a subsystem.

## Pick The Right Skill

Before editing a subsystem, read the matching `SKILL.md`. If a skill points to `references/*.md`, read only the reference files that match the task.

| Task area                                                     | Read first                                     |
| ------------------------------------------------------------- | ---------------------------------------------- |
| CLI commands, build, release, upload, vendor flows            | `skills/feather-cli-builds/SKILL.md`           |
| Lua runtime, injection, WebSocket/disk transport, auth        | `skills/feather-lua-runtime/SKILL.md`          |
| Built-in plugins, manifests, capabilities, plugin UI payloads | `skills/feather-plugin-authoring/SKILL.md`     |
| Catalog packages, trust, checksums, lockfile, package CLI     | `skills/feather-package-catalog/SKILL.md`      |
| React desktop app, pages, hooks, stores, Playwright           | `skills/feather-desktop-app/SKILL.md`          |
| VS Code extension, commands, CLI wrapper, packaging           | `skills/feather-cli-vscode-extension/SKILL.md` |

For cross-cutting protocol changes, read both `skills/feather-lua-runtime/SKILL.md` and `skills/feather-desktop-app/SKILL.md`. If Tauri, Rust server events, or native commands are involved, also read `skills/feather-desktop-app/references/tauri-and-protocol.md`.

For package or plugin work that changes generated files, read the relevant skill before running generators so source files and generated artifacts stay in sync.

## Adding New Work

New packages:

- Read `skills/feather-package-catalog/SKILL.md` and its workflow reference before editing catalog data.
- Prefer `pnpm run package:add` for GitHub-hosted packages and `pnpm run package:add-url` for direct file URL packages.
- Commit both the source `catalog/packages/<id>.json` file and the generated `apps/cli/src/generated/registry.json` update.
- Verify with `pnpm run check:registry`, `pnpm run cli:build`, `pnpm run feather -- package info <id>`, and a package install into a temp or fixture project.
- Update package docs, e2e coverage, and `CHANGELOG.md` when the package is user-visible.

New plugins:

- Read `skills/feather-plugin-authoring/SKILL.md` and its catalog/testing reference before adding plugin files.
- Built-in plugins should usually include `packages/runtime-lua/plugins/<plugin-id>/init.lua`, `manifest.lua`, and `README.md`.
- Declare capabilities, default options, `optIn`, and `disabled` deliberately; risky or development-only plugins stay opt-in and disabled.
- Add Lua e2e coverage under `packages/runtime-lua/e2e/plugins/` for runtime behavior, and desktop/showcase e2e when React-rendered plugin UI changes.
- Run `bash scripts/generate-manifest.sh`, `pnpm run generate:plugin-catalog`, `pnpm run cli:build`, `pnpm run typecheck:lua`, and `pnpm run test:lua:e2e`.
- Update plugin docs, any docs symlink targets, and `CHANGELOG.md`.

New features:

- Pick the primary subsystem skill first, then load adjacent skills for protocol, CLI, desktop, package, plugin, or extension effects.
- Start from existing command/page/hook/store/runtime patterns before adding new abstractions.
- Add or update e2e coverage in the subsystem that proves the user workflow, not only unit coverage for helper code.
- Update docs in the same change. Prefer canonical docs beside the subsystem, exposed through `apps/docs/` with symlinks when practical.
- Update `CHANGELOG.md` for user-visible behavior and add compare-link bookkeeping when preparing a release section.
- Regenerate catalogs, registries, manifests, or bundled assets whenever the source files they represent change.

## Dev Setup

```sh
pnpm install
pnpm run cli:build
pnpm run feather --help
pnpm run up -- --studio    # Inspector + Studio + an example game, in order; Ctrl+C stops all
pnpm run inspector:tauri   # or one app at a time
pnpm run studio:tauri
pnpm run docs
```

`pnpm run cli:build` is required before local `pnpm run feather -- ...` smoke checks. Never run a bare
`pnpm run tauri ...`: there are two `src-tauri` directories, and the Tauri CLI picks one by search
order rather than by intent. The `inspector:*` and `studio:*` scripts pin the project.

## Generated Files

Do not edit generated files by hand.

| File                                  | Generator/check                                                    |
| ------------------------------------- | ------------------------------------------------------------------ |
| `apps/cli/src/generated/registry.json`     | `pnpm run generate:registry` / `pnpm run check:registry`             |
| `apps/cli/src/generated/plugin-catalog.ts` | `pnpm run generate:plugin-catalog` / `pnpm run check:plugin-catalog` |

When source catalog or manifest files change, run the generator and include the generated result.

## Docs Rules

Update docs when a user-facing command, config field, plugin option, build behavior, package behavior, extension behavior, or safety check changes.

Prefer canonical documentation beside the subsystem it describes, then expose it through `apps/docs/` with a symlink when practical. Edit the source-side file, not only the symlink path.

Docs symlink source files:

- `apps/docs/cli.md` points to `apps/cli/README.md`.
- `apps/docs/vscode-extension.md` points to `apps/vscode-extension/README.md`.
- `apps/docs/packages.md` points to `catalog/packages/README.md`.
- `apps/docs/plugins.md` points to `packages/runtime-lua/plugins/README.md`.
- `apps/docs/plugins-ui.md` points to `packages/runtime-lua/plugins/plugins-ui.md`.
- Plugin pages under `apps/docs/plugins/` usually point to `packages/runtime-lua/plugins/<plugin-id>/README.md`.

Edit the source file, not only the docs path.

## Changelog Rules

Update `CHANGELOG.md` for user-visible changes, release behavior changes, new commands/options, security/safety changes, plugin/package catalog changes, extension workflows, and meaningful e2e coverage additions. Skip it only for docs-only edits, purely internal refactors, or test-only maintenance with no user-facing impact.

Format:

- Keep the file in Keep a Changelog style.
- Version headings use `## [vX.Y.Z] - YYYY-MM-DD - The one with short release theme`.
- Add entries under the nearest relevant section: `### Added`, `### Changed`, `### Fixed`, or `### Tests`.
- Use concise bullets that describe user-visible behavior, not implementation minutiae.
- Add `### Tests` bullets for new or materially expanded e2e coverage.
- Each release heading uses a reference link; add the matching bottom-of-file compare link in the form `[vX.Y.Z]: https://github.com/Kyonru/feather/compare/vPREVIOUS...vX.Y.Z`. The first release uses a release tag link instead.
- For unreleased work, add bullets to the current top release section unless the user is explicitly preparing a new version section.

## E2E Rules

Add or update e2e coverage for behavior changes. Use the subsystem skill to pick the right suite, and mention explicitly when e2e coverage is not feasible or not relevant.

## Working Rules

- Read relevant files before editing. Use `rg` and focused file reads.
- Run `git status --short` before and after work. Never revert unrelated user changes.
- Do not modify `package-lock.json` unless dependencies actually changed.
- Use the narrowest useful tests first, then broader checks when behavior crosses subsystem boundaries.
- Include documentation and e2e updates in the same change when user-visible behavior changes.
- Do not leave generated files stale. If `registry.json` or `plugin-catalog.ts` should change, include it.
- Keep release builds Feather-free by default. Do not embed debugger/runtime content in release or upload paths unless explicitly requested.
- Do not enable Console, Hot Reload, filesystem access, or network capabilities by default.
- If a required local tool is missing, report the exact command and failure.
