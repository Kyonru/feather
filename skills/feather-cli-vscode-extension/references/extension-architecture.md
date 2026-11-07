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

- `apps/vscode-extension/src/extension.ts`: activation wiring; returns the API the integration test uses.
- `apps/vscode-extension/src/workflows/`: command registration and user interaction, per workflow.
- `apps/vscode-extension/src/plans.ts`: pure argv builders for every CLI call.
- `apps/vscode-extension/src/jobs/runner.ts`: job lifecycle without `vscode` (steps, exit codes, cancel, `--json`).
- `apps/vscode-extension/src/jobs/service.ts`: output channel, progress notification, completion notification, refresh.
- `apps/vscode-extension/src/cli.ts`: resolves the bundled CLI or dev launcher; run/watch terminals.
- `apps/vscode-extension/src/project/selection.ts`: which folder is the project (multi-root, `feather.projectDir`).
- `apps/vscode-extension/src/project/state.ts`: project state from `doctor`, `plugin list` and `package list` JSON.
- `apps/vscode-extension/src/featherPanel.ts`: activity bar tree.
- `apps/vscode-extension/src/buildConfig/model.ts`: `feather.build.json` form model; preserves fields it does not show.
- `apps/vscode-extension/src/buildConfig/panel.ts` and `html.ts`: the webview.
- `apps/vscode-extension/src/catalog.ts`: bundled plugin/package catalog snapshots.

## CLI boundary

The extension should delegate core behavior to the CLI. VS Code code should handle:

- collecting user choices
- resolving project/settings context
- invoking CLI commands
- showing output and errors
- refreshing the project view

Business rules such as production safety, package trust, build config resolution, and runtime integration should remain in CLI code unless there is a strong reason to mirror a read-only subset for UI display.

CLI resolution follows this pattern:

- Local development uses `apps/vscode-extension/bundled-bin/feather-dev.mjs` when present.
- Packaged builds use the platform-specific bundled binary in `bundled-bin`.
- Managed jobs and state queries use `spawn(..., { shell: false })` with stdin closed; run/watch terminals start the CLI as the terminal process (`shellPath`), so nothing is shell-quoted.

Do not duplicate CLI behavior in the extension just to avoid invoking the CLI. Add CLI support first, then call it from VS Code.

## Adding an extension feature

- Add business behavior to the CLI first when the workflow is not VS Code-specific, then invoke it from the extension.
- Register new commands in the matching `apps/vscode-extension/src/workflows/` module and keep `apps/vscode-extension/package.json` contributions in sync.
- Build argv in `apps/vscode-extension/src/plans.ts` and add the plan to `apps/vscode-extension/test/cli-contract.test.mjs`.
- Run non-interactive commands through `services.jobs.run(plan, root)`; use `runInTerminal` only for interactive, long-lived processes.
- Get the project from `services.project.requireRoot()`; it handles `feather.projectDir`, multi-root selection and outside-workspace confirmation.
- Managed jobs refresh project state when the process exits; do not add refresh timers.
- Add extension integration coverage for command workflows and packaging-sensitive behavior.
- Update `apps/vscode-extension/README.md`, any docs symlink target, and `CHANGELOG.md`.
- Run `pnpm run extension:build`, `pnpm run extension:test`, and `pnpm run extension:test:integration` when command flow changes.

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
