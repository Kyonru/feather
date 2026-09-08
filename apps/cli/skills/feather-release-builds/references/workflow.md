# Release Builds Workflow

Use this when preparing Feather-free release artifacts, upload checks, or store workflows.

## Production Gates

Run:

- `feather doctor <dir> --production --json`
- Add `--build-target <target>` for platform checks.

Block or call out:

- Console or Hot Reload enabled.
- Weak API keys.
- Insecure filesystem/network capabilities.
- Embedded debugger runtime in release artifacts.
- Missing signing credentials.
- Missing vendor or SDK.
- Generated metadata that is stale.

## Build Commands

- Android release: `feather build android --dir <dir> --release`.
- iOS release: `feather build ios --dir <dir> --release`.
- Desktop release: `feather build windows|macos|linux|steamos --dir <dir>`.
- Release setup: `feather release init --dir <dir>`.
- Store helpers: `feather release ios beta|production --dir <dir>` and `feather release android beta|production --dir <dir>`.
- Itch upload: `feather upload itch <target> --dir <dir> --build`.

## Artifact Review

Report:

- Target and command.
- Artifact path from command output.
- Whether Feather runtime/debug files are absent.
- Signing/upload status.
- Store track or destination.

## Release Safety

Do not silently produce debug artifacts for release requests. If a release blocker exists, name it, provide the exact failing check, and stop before upload unless the user explicitly redirects.
