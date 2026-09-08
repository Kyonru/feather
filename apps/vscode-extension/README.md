# Feather for Love2D

Feather for VS Code is the editor companion for Feather projects. It keeps the common CLI workflows close at hand: initialize a project, run or watch it, manage plugins and packages, check project health, create release builds, and upload builds without leaving VS Code.

The extension uses the Feather CLI under the hood. Packaged builds include the CLI and Feather runtime assets; local development builds use the workspace CLI through `vscode-extension/bundled-bin/feather-dev.mjs`.

## Requirements

- VS Code 1.101 or newer.
- A Love2D project with a `main.lua` file.
- A Love2D executable for desktop runs. Set `feather.loveExecutable` if auto-detection does not find it.
- Platform tooling for mobile builds when needed, such as Android SDK/JDK, Xcode, signing credentials, or Fastlane configuration.

For extension development from this repository:

```sh
npm install
npm run cli:build
npm run extension:build
```

## Getting Started

1. Open a Love2D project folder in VS Code.
2. Open the Feather activity bar view.
3. Run **Initialize Project**.
4. Use the CLI-managed setup for the simplest workflow.
5. Select run targets with **Select Run Targets**.
6. Use **Run Project** or enable watch mode with **Toggle Watch Mode**.

After initialization, the extension refreshes the project view when Feather config files change.

## Project View

The Feather activity bar view is organized around the main project workflow:

- **Status** shows project config, runtime mode, plugins, packages, and selected run targets.
- **Run** starts the project, toggles watch mode, and selects run targets.
- **Build & Release** opens build config, creates release builds, uploads builds, and manages native vendors.
- **Project Tools** runs doctor, manages plugins and packages, configures extension settings, updates Feather, and removes Feather from a project.

## Commands

| Command palette action | Command id | Purpose |
| --- | --- | --- |
| Feather: Run Project | `feather.run` | Run the current project with selected targets. |
| Feather: Initialize Project | `feather.init` | Create or update Feather project config. |
| Feather: Run Doctor | `feather.doctor` | Check project setup, safety posture, dependencies, and connectivity. |
| Feather: Manage Plugins | `feather.plugins` | Install, update, remove, include, or disable plugins. |
| Feather: Manage Packages | `feather.packages` | Install, update, or remove curated packages. |
| Feather: Upload Build | `feather.upload` | Upload an existing or newly built artifact through the CLI upload flow. |
| Feather: Remove Feather | `feather.remove` | Remove Feather integration from the project. |
| Feather: Update Runtime | `feather.update` | Update the embedded Feather runtime when the project uses one. |
| Feather: Toggle Watch Mode | `feather.toggleWatch` | Switch between normal run and watch mode. |
| Feather: Configure | `feather.configure` | Configure project directory, Love2D executable, upload defaults, and watch mode. |
| Feather: Manage Vendors | `feather.vendor` | Add or list native build vendor templates. |
| Feather: Select Run Targets | `feather.selectTargets` | Choose desktop, web, Android, or iOS run targets. |
| Feather: Edit Build Config | `feather.buildConfig` | Open or create `feather.build.json`. |
| Feather: Create Release Build | `feather.buildRelease` | Run a production-oriented Android or iOS release build. |
| Feather: Refresh | `feather.refreshProjectView` | Refresh the Feather project view. |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `feather.projectDir` | empty | Optional project directory override. |
| `feather.loveExecutable` | empty | Path to the Love2D executable used by desktop runs. |
| `feather.defaultUploadTarget` | `itch` | Default upload target for the upload flow. |
| `feather.defaultUploadChannel` | empty | Optional default upload channel. |
| `feather.watchMode` | `false` | Run projects through `feather watch` when enabled. |
| `feather.runTargets` | `["desktop"]` | Targets used by the run command. |
| `feather.vendorDir` | empty | Optional directory containing native vendor templates. |

## Build And Upload

**Create Release Build** runs the CLI release build path for Android or iOS with `--release --no-debugger`. The picker can also add `--clean`, `--dry-run`, `--no-cache`, and `--verbose`.

Build settings live in `feather.build.json`. Use **Edit Build Config** to create or open that file, and use **Run Doctor** when a release build fails preflight checks.

**Upload Build** can upload an existing artifact or build first, using the configured default upload target and channel as starting values.

## Plugins And Packages

CLI-managed projects use bundled Feather runtime and plugin code. In that mode, plugin management updates `feather.config.lua` include lists instead of copying plugin files into the project.

Embedded projects copy plugin files into the configured Feather install directory. The extension handles both modes and shows the current mode in the project status section.

## Local Development

Useful commands from the repository root:

```sh
npm run extension:build
npm run extension:test
npm run extension:package
```

`npm run extension:build` prepares the local extension bundle and compiles TypeScript. If you need packaged CLI binaries for distribution, run the binary/package scripts from the root package instead of relying on the development launcher.

## Troubleshooting

- If the project is not detected, check that the workspace or configured project directory contains `main.lua`.
- If Feather config is missing, run **Initialize Project**.
- If Love2D cannot be launched, set `feather.loveExecutable`.
- If mobile builds fail, run **Run Doctor** and check native vendor, SDK, signing, and release-safety output.
- If a vendor template is missing, use **Manage Vendors** before building.
- CLI output is shown in the VS Code terminal used by the task or command.
