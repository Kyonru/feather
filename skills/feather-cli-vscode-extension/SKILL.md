---
name: feather-cli-vscode-extension
description: Work on Feather's VS Code extension, command flow, CLI wrapper behavior, bundled binary versus dev launcher, settings, project view, packaging, and extension tests.
---

# Feather VS Code Extension

## When to use

Use this skill when changing the VS Code extension, command palette actions, project view, CLI invocation wrapper, build config panel, vendor flow, packaged extension assets, or extension tests.

## First pass

- Start with `apps/vscode-extension/src/extension.ts` for activation wiring, then the workflow module under `apps/vscode-extension/src/workflows/`.
- CLI argv comes from `apps/vscode-extension/src/plans.ts`; non-interactive commands run through `apps/vscode-extension/src/jobs/`.
- For architecture, load [extension architecture](references/extension-architecture.md).
- For commands, packaging, and tests, load [commands and packaging](references/commands-and-packaging.md).
- If behavior mirrors the CLI, also use `feather-cli-builds`.

## Core rules

- The extension is a companion to the CLI. Prefer invoking or wrapping CLI behavior instead of duplicating business logic in VS Code.
- Packaged builds include the CLI/runtime assets; local development uses the workspace CLI through the dev launcher.
- Keep command IDs stable unless the task includes a migration.
- Respect user settings for project directory, Love2D executable, default upload target/channel, watch mode, run targets, and vendor directory.
- Refresh the project view when config or relevant project files change.
- Run non-interactive commands as managed jobs (output channel + progress + completion); keep terminals for `run`/`watch` only. Never refresh on a timer.
- Read project state from the CLI's JSON output, never by parsing project files in the extension.
- Keep build config editing aligned with `feather.build.json`.

## Common implementation map

- Activation wiring only: `apps/vscode-extension/src/extension.ts`.
- Commands, one module per workflow: `apps/vscode-extension/src/workflows/` (`run`, `setup`, `plugins`, `packages`, `buildRelease`).
- Every CLI argv the extension builds: `apps/vscode-extension/src/plans.ts` (pure; contract-tested against the CLI).
- Managed jobs (spawn without a shell, output channel, progress, cancel, completion): `apps/vscode-extension/src/jobs/`.
- CLI resolution and run/watch terminals: `apps/vscode-extension/src/cli.ts`.
- Project selection and CLI-sourced state (`doctor`, `plugin list`, `package list` JSON): `apps/vscode-extension/src/project/`.
- Activity panel: `apps/vscode-extension/src/featherPanel.ts`.
- Build config panel, model apart from rendering: `apps/vscode-extension/src/buildConfig/`.
- Bundled catalog snapshots: `apps/vscode-extension/src/catalog.ts`.
- Prep/package scripts: `apps/vscode-extension/scripts/prepare.mjs`, `generate-icon.mjs`.

## Verification

- Add or update e2e/integration coverage for extension behavior changes; use extension integration tests for command workflows and packaging-sensitive behavior.
- Build extension: `pnpm run extension:build`.
- Run extension tests: `pnpm run extension:test`.
- Run integration tests when command/workflow behavior changes: `pnpm run extension:test:integration`.
- Package extension when packaging assets or icons change: `pnpm run extension:package`.

## Docs touchpoints

- Update docs for user-facing extension commands, settings, project view behavior, packaging, or troubleshooting in the same change as the implementation.
- Update `CHANGELOG.md` for extension commands, settings, packaging, CLI-bundle behavior, or extension e2e/integration coverage changes.
- VS Code extension behavior belongs in `apps/vscode-extension/README.md`; `apps/docs/vscode-extension.md` points there.
- CLI behavior invoked by the extension should still be documented in the CLI docs when user-facing.
- Prefer source-side extension docs in `apps/vscode-extension/`, exposed through `apps/docs/` with a symlink.

## Avoid

- Do not make extension-only behavior diverge from CLI semantics.
- Do not assume the workspace root is the game project; respect `feather.projectDir`.
- Do not require packaged binaries during local development unless the task is packaging-specific.
- Do not hide CLI errors behind generic VS Code messages.
