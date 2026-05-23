# Extension Architecture

## Purpose

The VS Code extension keeps common Feather workflows in the editor:

- initialize a project
- run or watch the game
- manage plugins and packages
- run doctor
- edit build config
- manage vendors
- build releases
- upload builds
- update or remove Feather

## Source map

- `vscode-extension/src/extension.ts`: activation and command registration.
- `vscode-extension/src/cli.ts`: resolves and invokes Feather CLI.
- `vscode-extension/src/command.ts`: command execution helpers.
- `vscode-extension/src/project.ts`: project detection and status.
- `vscode-extension/src/featherPanel.ts`: activity bar tree/webview surface.
- `vscode-extension/src/buildConfigPanel.ts`: `feather.build.json` editing.
- `vscode-extension/src/vendor.ts`: vendor flows.
- `vscode-extension/src/catalog.ts`: package catalog support.

## CLI boundary

The extension should delegate core behavior to the CLI. VS Code code should handle:

- collecting user choices
- resolving project/settings context
- invoking CLI commands
- showing output and errors
- refreshing the project view

Business rules such as production safety, package trust, build config resolution, and runtime integration should remain in CLI code unless there is a strong reason to mirror a read-only subset for UI display.

CLI resolution follows this pattern:

- Local development uses `vscode-extension/bundled-bin/feather-dev.mjs` when present.
- Packaged builds use the platform-specific bundled binary in `bundled-bin`.
- Terminal commands quote shell text; background commands use `spawn(..., { shell: false })`.

Do not duplicate CLI behavior in the extension just to avoid invoking the CLI. Add CLI support first, then call it from VS Code.

## Adding an extension feature

- Add business behavior to the CLI first when the workflow is not VS Code-specific, then invoke it from the extension.
- Register new commands in `vscode-extension/src/extension.ts` and keep `vscode-extension/package.json` contributions in sync.
- Route command execution through `vscode-extension/src/cli.ts` and `vscode-extension/src/command.ts`; keep shell quoting and background process behavior consistent with existing helpers.
- Respect `feather.projectDir` and multi-root workspaces instead of assuming the first workspace folder is the game.
- Refresh the project view after commands that change config, packages, plugins, vendors, build config, or project status.
- Add extension integration coverage for command workflows and packaging-sensitive behavior.
- Update `vscode-extension/README.md`, any docs symlink target, and `CHANGELOG.md`.
- Run `npm run extension:build`, `npm run extension:test`, and `npm run extension:test:integration` when command flow changes.

## Settings

Important settings:

- `feather.projectDir`
- `feather.loveExecutable`
- `feather.defaultUploadTarget`
- `feather.defaultUploadChannel`
- `feather.watchMode`
- `feather.runTargets`
- `feather.vendorDir`

Always account for unset settings and multi-root workspaces.
