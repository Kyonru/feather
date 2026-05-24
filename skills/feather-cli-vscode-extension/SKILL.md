---
name: feather-cli-vscode-extension
description: Work on Feather's VS Code extension, command flow, CLI wrapper behavior, bundled binary versus dev launcher, settings, project view, packaging, and extension tests.
---

# Feather VS Code Extension

## When to use

Use this skill when changing the VS Code extension, command palette actions, project view, CLI invocation wrapper, build config panel, vendor flow, packaged extension assets, or extension tests.

## First pass

- Start with `vscode-extension/src/extension.ts` for activation and command registration.
- Follow CLI execution through `vscode-extension/src/cli.ts` and command helpers.
- For architecture, load [extension architecture](references/extension-architecture.md).
- For commands, packaging, and tests, load [commands and packaging](references/commands-and-packaging.md).
- If behavior mirrors the CLI, also use `feather-cli-builds`.

## Core rules

- The extension is a companion to the CLI. Prefer invoking or wrapping CLI behavior instead of duplicating business logic in VS Code.
- Packaged builds include the CLI/runtime assets; local development uses the workspace CLI through the dev launcher.
- Keep command IDs stable unless the task includes a migration.
- Respect user settings for project directory, Love2D executable, default upload target/channel, watch mode, run targets, and vendor directory.
- Refresh the project view when config or relevant project files change.
- Show CLI output in VS Code terminals or output channels in a way users can act on.
- Keep build config editing aligned with `feather.build.json`.

## Common implementation map

- Activation and commands: `vscode-extension/src/extension.ts`.
- CLI wrapper: `vscode-extension/src/cli.ts`.
- Command helper: `vscode-extension/src/command.ts`.
- Project detection/status: `vscode-extension/src/project.ts`.
- Activity panel: `vscode-extension/src/featherPanel.ts`.
- Build config panel: `vscode-extension/src/buildConfigPanel.ts`.
- Vendor support: `vscode-extension/src/vendor.ts`.
- Package catalog support: `vscode-extension/src/catalog.ts`.
- Prep/package scripts: `vscode-extension/scripts/prepare.mjs`, `generate-icon.mjs`.

## Verification

- Add or update e2e/integration coverage for extension behavior changes; use extension integration tests for command workflows and packaging-sensitive behavior.
- Build extension: `npm run extension:build`.
- Run extension tests: `npm run extension:test`.
- Run integration tests when command/workflow behavior changes: `npm run extension:test:integration`.
- Package extension when packaging assets or icons change: `npm run extension:package`.

## Docs touchpoints

- Update docs for user-facing extension commands, settings, project view behavior, packaging, or troubleshooting in the same change as the implementation.
- Update `CHANGELOG.md` for extension commands, settings, packaging, CLI-bundle behavior, or extension e2e/integration coverage changes.
- VS Code extension behavior belongs in `vscode-extension/README.md`; `docs/vscode-extension.md` points there.
- CLI behavior invoked by the extension should still be documented in the CLI docs when user-facing.
- Prefer source-side extension docs in `vscode-extension/`, exposed through `docs/` with a symlink.

## Avoid

- Do not make extension-only behavior diverge from CLI semantics.
- Do not assume the workspace root is the game project; respect `feather.projectDir`.
- Do not require packaged binaries during local development unless the task is packaging-specific.
- Do not hide CLI errors behind generic VS Code messages.
