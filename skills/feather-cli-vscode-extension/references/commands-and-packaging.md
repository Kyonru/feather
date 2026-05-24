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

Keep IDs stable for users, keybindings, and command palette muscle memory.

## Development and packaging

Local development:

```bash
npm install
npm run cli:build
npm run extension:build
```

Packaging:

- `npm run extension:prepare` builds/copies local CLI/runtime assets for the extension.
- `npm run extension:binary` builds packaged CLI binaries.
- `npm run extension:package` prepares, builds, generates the icon, and packages with `vsce`.

The packaged extension should use bundled assets. Local development should use `vscode-extension/bundled-bin/feather-dev.mjs` or the workspace CLI path prepared by scripts.

## Testing

- `npm run extension:build`
- `npm run extension:test`
- `npm run extension:test:integration`

Run package-level checks after changing scripts, bundled binary resolution, icon generation, or files included in the VSIX.

Use extension integration tests for command wiring and packaged/development launcher behavior. Use CLI command tests for the underlying Feather behavior.

## Error handling

Surface actionable CLI failures. Prefer messages that include the failed command or the setting the user should fix, such as `feather.loveExecutable`, project directory, vendor directory, or missing native tooling.
