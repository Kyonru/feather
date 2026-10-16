# Feather for Love2D

Feather for VS Code is the editor companion for Feather projects. It keeps the common CLI workflows close at hand: initialize a project, run or watch it, manage plugins and packages, check project health, create release builds, and upload builds without leaving VS Code.

The extension runs the Feather CLI it bundles — never the one on your `PATH` — so the CLI, runtime, and extension you use are one tested snapshot. **Feather: Run Doctor** prints which platform snapshot that is.

## Requirements

- VS Code 1.101 or newer.
- A Love2D project with a `main.lua` file.
- A Love2D executable for desktop runs. Set `feather.loveExecutable` if auto-detection does not find it.
- Platform tooling for mobile builds when needed, such as Android SDK/JDK, Xcode, signing credentials, or Fastlane configuration.

## Getting Started

1. Open a Love2D project folder in VS Code.
2. Open the Feather activity bar view. It names the project it is working on.
3. Run **Initialize Project**.
4. Use the CLI-managed setup for the simplest workflow.
5. Select run targets with **Select Run Targets**.
6. Use **Run Project** or enable watch mode with **Toggle Watch Mode**.

## Choosing The Project

Feather works on one project folder at a time and shows it at the top of the Feather view and in the status bar.

- If `feather.projectDir` is set, that folder is the project. A relative path is resolved against the workspace. If the folder does not exist, the view says so instead of falling back to another folder.
- Otherwise Feather looks for `main.lua` in each workspace folder and in its direct subfolders. One match is used directly. With several, Feather asks once (**Feather: Select Project**) and remembers the choice for this workspace.
- A folder outside the workspace is only used after you confirm it.

## How Commands Run

Commands that finish on their own — init, doctor, plugin and package changes, vendor fetches, release builds, uploads, update, and remove — run as **managed jobs**:

- the bundled CLI is started directly, without a shell;
- its output streams to the **Feather** output channel;
- a progress notification shows the latest output line and has a **Cancel** button, which stops the CLI process;
- when the process exits, a notification reports success or the CLI's own error message, and the project view refreshes. Where the CLI offers `--json`, the notification summarizes its result (for example, the plugins init included or the artifacts a release build wrote).

Jobs never prompt: anything the CLI would ask in a terminal is either answered by the picker beforehand or reported as an error.

**Run Project** and watch mode are long-lived and interactive, so they run in terminals named `Feather: Run` / `Feather: Watch`. Starting a run while the previous one is still going asks whether to show it or restart it; a running game or watch loop is never closed without asking.

## Project View

The Feather activity bar view is organized around the main project workflow:

- **Project** names the selected folder; click it to choose another.
- **Status** comes from the CLI: the project mode and plugins (`feather plugin list`), installed packages (`feather package list`), and Doctor's blockers and warnings (`feather doctor`). A file the CLI cannot read — for example an invalid `feather.lock.json` — is shown as an error with Doctor's message, not as zero packages.
- **Run** starts the project, toggles watch mode, and selects run targets.
- **Build & Release** opens build config, creates release builds, uploads builds, and manages native vendors.
- **Project Tools** runs doctor, manages plugins and packages, and configures extension settings.

The view refreshes when `feather.config.lua`, `feather.lock.json`, `feather.build.json`, `main.lua`, or installed plugins change, and after every managed job.

## Commands

| Command palette action | Command id | Purpose |
| --- | --- | --- |
| Feather: Run Project | `feather.run` | Run the current project with selected targets. |
| Feather: Initialize Project | `feather.init` | Create or update Feather project config. |
| Feather: Run Doctor | `feather.doctor` | Check project setup, safety posture, dependencies, and connectivity. |
| Feather: Manage Plugins | `feather.plugins` | Install, update, or remove plugins. |
| Feather: Manage Packages | `feather.packages` | Install, update, or remove curated packages. |
| Feather: Upload Build | `feather.upload` | Upload an existing or newly built artifact through the CLI upload flow. |
| Feather: Remove Feather | `feather.remove` | Remove Feather integration from the project. |
| Feather: Update Runtime | `feather.update` | Update the embedded Feather runtime when the project uses one. |
| Feather: Toggle Watch Mode | `feather.toggleWatch` | Switch between normal run and watch mode. |
| Feather: Configure | `feather.configure` | Configure project directory, Love2D executable, upload defaults, and watch mode. |
| Feather: Manage Vendors | `feather.vendor` | Add or list native build vendor templates. |
| Feather: Select Run Targets | `feather.selectTargets` | Choose desktop, web, Android, iOS, or SteamOS run targets. |
| Feather: Select Project | `feather.selectProject` | Choose which workspace folder is the LÖVE project. |
| Feather: Edit Build Config | `feather.buildConfig` | Open or create `feather.build.json`. |
| Feather: Create Release Build | `feather.buildRelease` | Run a production-oriented Android or iOS release build. |
| Feather: Refresh | `feather.refreshProjectView` | Re-read project state from the CLI. |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `feather.projectDir` | empty | Project folder override, absolute or relative to the workspace. |
| `feather.loveExecutable` | empty | Path to the Love2D executable used by desktop runs. |
| `feather.defaultUploadTarget` | `itch` | Default upload target for the upload flow. |
| `feather.defaultUploadChannel` | empty | Optional default upload channel. |
| `feather.watchMode` | `false` | Run projects through `feather watch` when enabled. |
| `feather.runTargets` | `[]` | Targets used by the run command; asked for on first run. |
| `feather.vendorDir` | empty | Vendor directory inside the project, passed as `--vendor-dir`. Empty uses the CLI default, `vendor`. |

## Build And Upload

**Create Release Build** runs the CLI release build for Android or iOS with `--release --no-debugger`. The picker can add `--clean`, `--dry-run`, `--no-cache`, and `--verbose`. Verbose builds stream native tool output; other builds report the artifacts they wrote and offer **Reveal Output**.

**Edit Build Config** edits `feather.build.json`. Only the fields you change are written, onto the file as it is when you save, so settings the form does not show — release signing, Fastlane lanes, Gradle and Xcode overrides — and edits made in the JSON file meanwhile are kept. Browsed paths inside the project are stored relative to it. If the file is not valid JSON, the panel says so and offers to open it rather than showing an empty form over it. After saving, Feather doctor checks the file and the panel shows its verdict.

**Upload Build** can upload an existing artifact or build first, using the configured default upload target and channel.

**Run Project** checks the selected targets' build vendors with `feather build vendor list` (which honours paths in `feather.build.json`) and offers to fetch any that are missing before running.

## Plugins And Packages

CLI-managed projects use bundled Feather runtime and plugin code. In that mode, plugin management updates `feather.config.lua` include lists instead of copying plugin files into the project. The extension uses the mode the CLI reports, and shows it in the Status section.

Embedded projects copy plugin files into the configured Feather install directory and include or exclude them in config.

Package management reads installed packages from the CLI. If `feather.lock.json` cannot be read, **Manage Packages** stops and offers to open the file instead of installing over it.

## Troubleshooting

- If the project is not detected, check that the workspace or `feather.projectDir` contains `main.lua`, or run **Feather: Select Project**.
- If Feather config is missing, run **Initialize Project**.
- If Love2D cannot be launched, set `feather.loveExecutable`.
- If mobile builds fail, run **Run Doctor** and check native vendor, SDK, signing, and release-safety output.
- If a vendor template is missing, use **Manage Vendors** before building.
- Job output is in the **Feather** output channel (**View → Output**, then pick *Feather*). Run and watch output is in their terminals.

## Developing The Extension

From the repository root:

```sh
pnpm install
pnpm run extension:build
```

`extension:build` builds the CLI, bundles the Lua runtime, and writes `bundled-bin/` with a development launcher (`feather-dev.mjs`) that runs the workspace CLI from `apps/cli/dist`, then compiles the extension into `out/`. No Bun binaries are needed for development.

**Press F5** (or **Run and Debug → Feather VS Code Extension**) with the repository root open in VS Code. The launch configurations in the repository's `.vscode/launch.json` run the `extension:build` task first, then start an Extension Development Host with this extension loaded:

- **Feather VS Code Extension** opens an empty window; use **File → Open Folder** to open a game.
- **Feather VS Code Extension (example game)** opens `packages/runtime-lua/example/test_cli`, a standalone LÖVE project with a `feather.config.lua`, so the Feather view has a configured project straight away.

Commands write into the opened project. To try **Initialize Project** on a clean game, copy an example out of the repository first, for example `cp -R packages/runtime-lua/example/demo /tmp/feather-demo`, and open the copy. After changing extension code, rebuild (`pnpm run extension:build`, or `pnpm --filter feather-cli-vscode exec tsc -p . --watch` for TypeScript-only changes) and run **Developer: Reload Window** in the development host.

Tests:

```sh
pnpm run extension:test              # unit and CLI contract tests (node --test)
pnpm run extension:test:integration  # runs the suite inside a downloaded VS Code
pnpm run extension:package           # builds CLI binaries and the VSIX
```

The unit tests check the job lifecycle against a real child process, parse every CLI command the extension builds against the compiled CLI's own command tree, round-trip every `feather.build.json` field through the CLI's reader, and cover project selection. The integration test downloads VS Code into `node_modules/.vscode-test`, opens a window (it needs a desktop session), activates the extension on a temporary project, and runs Doctor as a managed job.
