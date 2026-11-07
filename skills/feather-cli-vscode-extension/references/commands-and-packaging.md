# Commands And Packaging

## Command IDs

Current command palette actions include:

- `feather.run`
- `feather.init`
- `feather.doctor`
- `feather.plugins`
- `feather.packages`
- `feather.upload`
- `feather.remove`
- `feather.update`
- `feather.toggleWatch`
- `feather.configure`
- `feather.vendor`
- `feather.selectTargets`
- `feather.buildConfig`
- `feather.buildRelease`
- `feather.refreshProjectView`
- `feather.selectProject`

Keep IDs stable for users, keybindings, and command palette muscle memory.

## Development and packaging

Local development:

```bash
pnpm install
pnpm run extension:build
```

Then press F5 with the "Feather VS Code Extension" launch configuration (`.vscode/launch.json`).

Packaging:

- `pnpm run extension:prepare` builds/copies local CLI/runtime assets for the extension.
- `pnpm run extension:binary` builds packaged CLI binaries.
- `pnpm run extension:package` prepares, builds, generates the icon, and packages with `vsce`.

The packaged extension should use its bundled assets. Local development should use the workspace CLI launcher prepared by `extension:prepare`.

## Testing

- `pnpm run extension:build`
- `pnpm run extension:test`
- `pnpm run extension:test:integration` (downloads VS Code into `node_modules/.vscode-test`; opens a window, so it needs a desktop session)

Run package-level checks after changing scripts, bundled binary resolution, icon generation, or files included in the VSIX.

Use extension integration tests for command wiring and packaged/development launcher behavior. Use CLI command tests for the underlying Feather behavior.

## Error handling

Surface actionable CLI failures. Prefer messages that include the failed command or the setting the user should fix, such as `feather.loveExecutable`, project directory, vendor directory, or missing native tooling.
